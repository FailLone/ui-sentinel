import { describe, expect, it, vi } from 'vitest'
import { CANDIDATE_MAX } from './visual-candidate.ts'
import { createVisualScanner, type VisualScanDeps } from './visual-scan.ts'

const VIEWPORT = { width: 1280, height: 768 }

const region = { x: 430, y: 196, width: 420, height: 52 }

function goodCandidate(over: Record<string, unknown> = {}) {
  return {
    perceivedRegion: region,
    targetDescription: 'the search field at the top of the product list',
    visualBasis: 'a light rounded band with a magnifier glyph, wider than the text it accepts',
    excludedRegions: [],
    confidence: 'high',
    ...over,
  }
}

function harness(over: { output?: unknown; failing?: boolean } = {}) {
  const saved: any[] = []
  const deps: VisualScanDeps = {
    viewport: VIEWPORT,
    runId: 'run-1',
    guard: () => {},
    countModel: vi.fn(),
    scan: async () =>
      over.failing
        ? Promise.reject(new Error('model-request-timeout'))
        : (over.output ?? { candidates: [goodCandidate()] }),
    saveCandidate: async (candidate) => {
      saved.push(candidate)
    },
    nextId: () => `candidate-${saved.length + 1}`,
    now: () => '2026-09-29T00:00:00.000Z',
  }
  return { deps, saved }
}

const context = { observationId: 'obs-1', screenshotRef: 'shot-1' }

describe('bounded visual scan', () => {
  it('returns one server-bound candidate for a valid response and persists it', async () => {
    const h = harness()
    const scanner = createVisualScanner(h.deps)

    const result = await scanner.run(context)

    expect(result.status).toBe('scanned')
    expect(result.candidates).toHaveLength(1)
    const candidate = result.candidates[0]
    // Identity and provenance are the server's, never the model's.
    expect(candidate.runId).toBe('run-1')
    expect(candidate.observationId).toBe('obs-1')
    expect(candidate.screenshotRef).toBe('shot-1')
    expect(candidate.kind).toBe('input-focus-region')
    expect(candidate.id).toBe('candidate-1')
    expect(h.saved).toEqual([candidate])
  })

  it('charges exactly one model call for a scan', async () => {
    const h = harness({
      output: { candidates: [goodCandidate(), goodCandidate({ confidence: 'medium' })] },
    })
    const scanner = createVisualScanner(h.deps)

    await scanner.run(context)

    expect(h.deps.countModel).toHaveBeenCalledTimes(1)
  })

  it('rejects the whole response and persists nothing when the model output is malformed', async () => {
    // A model that invents its own id or a verdict must not be partially honoured.
    const h = harness({ output: { candidates: [{ ...goodCandidate(), id: 'mine' }] } })
    const scanner = createVisualScanner(h.deps)

    const result = await scanner.run(context)

    expect(result.status).toBe('rejected')
    expect(result.candidates).toEqual([])
    expect(h.saved).toEqual([])
  })

  it('refuses a rectangle that leaves the viewport instead of clipping it into shape', async () => {
    const h = harness({
      output: {
        candidates: [
          goodCandidate({ perceivedRegion: { x: 1000, y: 196, width: 420, height: 52 } }),
        ],
      },
    })
    const scanner = createVisualScanner(h.deps)

    const result = await scanner.run(context)

    expect(result.status).toBe('rejected')
    if (result.status !== 'rejected') throw new Error('expected a rejected scan')
    expect(result.reason).toMatch(/outside-viewport/)
    expect(h.saved).toEqual([])
  })

  it('treats an empty candidate list as a scan that raised nothing, not a failure', async () => {
    const h = harness({ output: { candidates: [] } })
    const scanner = createVisualScanner(h.deps)

    const result = await scanner.run(context)

    expect(result.status).toBe('scanned')
    expect(result.candidates).toEqual([])
  })

  it('never exceeds the candidate cap', async () => {
    const h = harness({
      output: {
        candidates: Array.from({ length: CANDIDATE_MAX + 1 }, () => goodCandidate()),
      },
    })
    const scanner = createVisualScanner(h.deps)

    const result = await scanner.run(context)

    expect(result.status).toBe('rejected')
    expect(h.saved).toEqual([])
  })

  it('scans an observation once: a second run returns the stored candidates without another call', async () => {
    const h = harness()
    const scanner = createVisualScanner(h.deps)

    const first = await scanner.run(context)
    const second = await scanner.run(context)

    expect(second.candidates).toEqual(first.candidates)
    expect(second.reused).toBe(true)
    expect(h.deps.countModel).toHaveBeenCalledTimes(1)
    expect(h.saved).toHaveLength(1)
  })

  it('reports a model failure as rejected rather than inventing a candidate', async () => {
    const h = harness({ failing: true })
    const scanner = createVisualScanner(h.deps)

    const result = await scanner.run(context)

    expect(result.status).toBe('rejected')
    expect(h.saved).toEqual([])
  })

  it('does not pay for the same screenshot again after a refusal', async () => {
    // Bounded means bounded: a malformed response is remembered, so consulting the candidate list
    // repeatedly cannot turn one screenshot into an unbounded number of model calls.
    const h = harness({ output: { candidates: [{ ...goodCandidate(), id: 'mine' }] } })
    const scanner = createVisualScanner(h.deps)

    await scanner.run(context)
    const second = await scanner.run(context)

    expect(second.status).toBe('rejected')
    expect(second.reused).toBe(true)
    expect(h.deps.countModel).toHaveBeenCalledTimes(1)
  })

  it('shares a single model call between two concurrent scans of the same observation', async () => {
    // Without this, a second caller racing the first pays for the same screenshot twice.
    let release: (value: unknown) => void = () => {}
    const gate = new Promise((resolve) => {
      release = resolve
    })
    const h = harness()
    const scanner = createVisualScanner({
      ...h.deps,
      scan: async () => {
        await gate
        return { candidates: [goodCandidate()] }
      },
    })

    const first = scanner.run(context)
    const second = scanner.run(context)
    release(null)
    const [a, b] = await Promise.all([first, second])

    expect(a.candidates).toEqual(b.candidates)
    expect(h.deps.countModel).toHaveBeenCalledTimes(1)
    expect(h.saved).toHaveLength(1)
  })

  it('does not call the model at all once the run is cancelled', async () => {
    // Plan 4.5: a cancelled or closed run must not start new model work.
    const h = harness()
    const scanner = createVisualScanner({
      ...h.deps,
      guard: () => {
        throw new Error('budget-exhausted')
      },
    })

    await expect(scanner.run(context)).rejects.toThrow(/budget-exhausted/)
    expect(h.deps.countModel).not.toHaveBeenCalled()
    expect(h.saved).toEqual([])
  })
})
