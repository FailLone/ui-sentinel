import { describe, expect, it } from 'vitest'
import { createInspectionHost } from './inspection-host.ts'
import type { RunEvent } from '../shared/types.ts'

/**
 * The executor-owned inspection ledger (plan 5.2, 8/B2).
 *
 * The rules under test are the ones that make "checked" mean something: the executor creates and
 * resolves items from real measurements, and the model can only select among items that exist. The
 * model-side surface is here too, because that is where a ledger is usually weakened - an update that
 * could mark its own work verified, or an empty one that could clear an obligation.
 */
const events: RunEvent[] = []
const append = async (type: string, payload: Record<string, unknown>, extra?: any) => {
  const event = {
    id: `evt-${events.length + 1}`,
    runId: 'run-1',
    seq: events.length,
    type,
    timestamp: new Date().toISOString(),
    stepId: extra?.stepId ?? null,
    actionId: null,
    payload,
    evidenceRefs: extra?.evidenceRefs ?? [],
  } as RunEvent
  events.push(event)
  return event
}

function host(overrides: Partial<Parameters<typeof createInspectionHost>[0]> = {}) {
  events.length = 0
  let snapshotId = 's1'
  return {
    setSnapshot: (id: string) => {
      snapshotId = id
    },
    events,
    host: createInspectionHost({
      runId: 'run-1',
      entryUrl: 'https://shop.example.org/catalog',
      goal: 'check the catalog',
      currentSnapshotId: () => snapshotId,
      currentUrl: () => 'https://shop.example.org/catalog',
      currentObservationVersion: () => 'v1',
      appendEvent: append,
      ...overrides,
    }),
  }
}

describe('executor-created items', () => {
  it('creates an entry-observation item and resolves it from the observation evidence', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp', 'snapshot.json'],
      candidateDetail: '2 buttons, 1 link',
      candidateCategories: ['local-interaction', 'navigation'],
    })

    const entry = h.snapshot().items.find((i) => i.category === 'entry-observation')
    expect(entry).toMatchObject({
      status: 'verified',
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp', 'snapshot.json'],
    })
    // An observation with no saved evidence cannot establish that the entry was readable.
    expect(h.completionFacts().entryEvidenceRefs.length).toBeGreaterThan(0)
  })

  it('refuses to mark the entry observed without evidence', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: [],
      candidateDetail: 'none',
      candidateCategories: [],
    })
    // The item exists and is recorded honestly, but it does not claim the entry was proven.
    const entry = h.snapshot().items.find((i) => i.category === 'entry-observation')
    expect(entry?.status).toBe('unverified')
    expect(h.completionFacts().entryEvidenceRefs).toEqual([])
  })

  it('resolves an automatic check by its verdict, and a pass is a completion', async () => {
    const { host: h } = host()
    await h.recordAutomaticCheck({
      ruleId: 'pointer-hit',
      revision: '3',
      verdict: 'pass',
      evidenceRefs: ['shot.webp'],
    })
    await h.recordAutomaticCheck({
      ruleId: 'overlay-blocking',
      revision: '2',
      verdict: 'fail',
      evidenceRefs: ['shot.webp'],
    })

    const items = h.snapshot().items.filter((i) => i.category === 'automatic-check')
    expect(items.map((i) => i.status).sort()).toEqual(['failed', 'verified'])
    // A verified defect is a *finished* check: it must not hold completion back (plan 6.1).
    expect(h.completionFacts().gaps).toEqual([])
  })

  it('records an unknown-with-no-declared-requirement as a limit, not an obligation', async () => {
    const { host: h } = host()
    // The rule ran and had nothing to judge against. That is a recorded measurement limit: the item
    // keeps its reason, and it must not become a gap that makes `scope-covered` unreachable (plan
    // 5.2, 7 - a general site declares no SLA, so response-time cannot block a bounded completion).
    await h.recordAutomaticCheck({
      ruleId: 'response-time',
      revision: '3.0.0',
      verdict: 'unknown',
      evidenceRefs: ['measurement.json'],
      unchecked: { reasonCode: 'requirement-not-declared' },
    })
    const item = h.snapshot().items[0]!
    expect(item.status).toBe('unverified')
    expect(item.reasonCode).toBe('requirement-not-declared')
    expect(item.selected).toBe(false)
    // The reason survives in the report, but the run is not held open by it.
    expect(h.completionFacts().gaps).toEqual([])
    expect(h.snapshot().unsupported.map((u) => u.dimension)).toContain('response-time')
  })

  it('keeps an unknown automatic check as an unfinished obligation with its reason', async () => {
    const { host: h } = host()
    await h.recordAutomaticCheck({
      ruleId: 'response-time',
      revision: '1',
      verdict: 'unknown',
      evidenceRefs: ['measurement.json'],
    })
    expect(h.snapshot().items[0]).toMatchObject({
      status: 'unverified',
      reasonCode: 'rule-unknown',
    })
    expect(h.completionFacts().gaps.map((g) => g.reasonCode)).toEqual(['rule-unknown'])
  })

  it('records an interaction and a navigation each with their own evidence', async () => {
    const { host: h } = host()
    await h.recordInteraction({
      target: 'Filter',
      basis: 'agent-selected',
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['before.json', 'after.json'],
      outcome: 'verified',
    })
    await h.recordNavigation({
      url: 'https://shop.example.org/detail?id=1',
      from: 'https://shop.example.org/catalog',
      evidenceRefs: ['detail.json'],
      outcome: 'verified',
    })

    const categories = h.snapshot().items.map((i) => i.category)
    expect(categories).toContain('local-interaction')
    expect(categories).toContain('navigation')
    expect(h.completionFacts().gaps).toEqual([])
  })

  it('records an unsupported dimension rather than leaving it silently absent', async () => {
    const { host: h } = host()
    await h.recordUnsupported('websocket', 'unsupported-channel')
    expect(h.snapshot().unsupported).toEqual([
      expect.objectContaining({ dimension: 'websocket', reasonCode: 'unsupported-channel' }),
    ])
  })
})

describe('resolveInteraction', () => {
  it('resolves the observed candidate at a ref, rather than creating a parallel item', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp'],
      candidateDetail: 'button "Filter"',
      candidateCategories: ['local-interaction'],
      candidateItems: [
        { ref: 'e1', description: 'button "Filter"', category: 'local-interaction' },
      ],
    })
    const candidate = h.candidateItems()[0]!
    // The model selected it, as the sampler does before acting.
    await h.selectItems([{ itemId: candidate.itemId, basis: 'the page states this affordance' }])

    const item = await h.resolveInteraction({
      ref: 'e1',
      target: 'button "Filter"',
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['before.json', 'after.json'],
      outcome: 'verified',
      category: 'local-interaction',
    })

    // One item, the candidate's own, now resolved - not a second item that would leave the original
    // pending forever and hold completion back (plan 5.2: the executor updates the ledger entry).
    expect(item?.itemId).toBe(candidate.itemId)
    expect(item?.status).toBe('verified')
    const interactions = h.snapshot().items.filter((i) => i.category === 'local-interaction')
    expect(interactions).toHaveLength(1)
    expect(h.completionFacts().gaps).toEqual([])
  })

  it('records an interaction against the ref even when nothing was selected', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp'],
      candidateDetail: 'button "Filter"',
      candidateCategories: ['local-interaction'],
      candidateItems: [
        { ref: 'e1', description: 'button "Filter"', category: 'local-interaction' },
      ],
    })
    // The model never selected it; the executor still reports what it actually did.
    const item = await h.resolveInteraction({
      ref: 'e1',
      target: 'button "Filter"',
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['after.json'],
      outcome: 'verified',
      category: 'local-interaction',
    })
    expect(item?.selected).toBe(true)
    // The sampling obligation is discharged by the interaction itself: the run really did act on the
    // control the page offered, whether or not a prior tool call said it would.
    expect(h.completionFacts().gaps).toEqual([])
  })

  it('resolves an observed candidate at a ref that a later observation renumbered', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot-1.webp'],
      candidateDetail: 'button "Filter"',
      candidateCategories: ['local-interaction'],
      candidateItems: [
        { ref: 'e1', description: 'button "Filter"', category: 'local-interaction' },
      ],
    })
    const first = h.candidateItems()[0]!
    // The next observation numbers its refs afresh and its (bounded) candidate list no longer holds
    // the old ref, so an action at a ref this run never offered is recorded as its own item rather
    // than being attributed to whichever item now answers to that number.
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot-2.webp'],
      candidateDetail: 'button "Sort"',
      candidateCategories: ['local-interaction'],
      candidateItems: [{ ref: 'e5', description: 'button "Sort"', category: 'local-interaction' }],
    })
    const other = h.resolveInteraction({
      ref: 'e1',
      target: 'button "Filter"',
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['after.json'],
      outcome: 'verified',
      category: 'local-interaction',
      snapshotId: 's1',
    })
    await expect(other).resolves.toMatchObject({ status: 'verified' })
    // The first observation's item is untouched: it is still the unresolved obligation it was.
    const items = h.snapshot().items
    expect(items.find((i) => i.itemId === first.itemId)?.status).toBe('pending')
  })

  it('resolves a navigation candidate at its ref with the landed url', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp'],
      candidateDetail: 'link "Detail"',
      candidateCategories: ['navigation'],
      candidateItems: [{ ref: 'e2', description: 'link "Detail"', category: 'navigation' }],
    })
    await h.resolveInteraction({
      ref: 'e2',
      target: 'a "Detail"',
      url: 'https://shop.example.org/detail?id=1',
      evidenceRefs: ['detail.json'],
      outcome: 'verified',
      category: 'navigation',
    })
    const nav = h.snapshot().items.find((i) => i.category === 'navigation')!
    expect(nav.status).toBe('verified')
    expect(nav.url).toBe('https://shop.example.org/detail?id=1')
  })

  it('records a failed interaction as a completed measurement, not an outstanding gap', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp'],
      candidateDetail: 'button "Filter"',
      candidateCategories: ['local-interaction'],
      candidateItems: [
        { ref: 'e1', description: 'button "Filter"', category: 'local-interaction' },
      ],
    })
    await h.resolveInteraction({
      ref: 'e1',
      target: 'button "Filter"',
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['after.json'],
      outcome: 'failed',
      detail: 'the control did not respond to a pointer click',
      category: 'local-interaction',
    })
    // A verified defect is a finished check (plan 6.1) - it must not hold the run back.
    expect(h.completionFacts().gaps).toEqual([])
    expect(h.snapshot().items.find((i) => i.category === 'local-interaction')?.status).toBe(
      'failed',
    )
  })

  it('creates an honest unverified item when the ref cannot be tied to a candidate', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp'],
      candidateDetail: 'no operable control',
      candidateCategories: [],
    })
    const item = await h.resolveInteraction({
      ref: 'e9',
      target: 'a "Elsewhere"',
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['after.json'],
      outcome: 'unverified',
      reasonCode: 'target-ambiguous',
      category: 'navigation',
    })
    expect(item?.status).toBe('unverified')
    expect(item?.reasonCode).toBe('target-ambiguous')
  })
})

describe('the model-side ledger surface', () => {
  it('selects an existing item but cannot mark its own work verified', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp'],
      candidateDetail: 'button "Filter", link "Detail"',
      candidateCategories: ['local-interaction', 'navigation'],
      candidateItems: [
        { ref: 'e1', description: 'button "Filter"', category: 'local-interaction' },
        { ref: 'e2', description: 'link "Detail"', category: 'navigation' },
      ],
    })
    const candidates = h.candidateItems()
    expect(candidates).toHaveLength(2)

    await h.selectItems([
      { itemId: candidates[0]!.itemId, basis: 'the filter control is in scope' },
      { itemId: candidates[1]!.itemId, basis: 'one same-origin detail page' },
    ])
    const selected = h.snapshot().items.filter((i) => i.selected && i.status === 'pending')
    expect(selected).toHaveLength(2)
    // Selection is a scope decision; the status is still pending and only the executor concludes it.
    expect(selected.every((i) => i.status === 'pending')).toBe(true)
  })

  it('refuses to select an unknown item and refuses to exclude one', async () => {
    const { host: h } = host()
    await expect(h.selectItems([{ itemId: 'item-invented', basis: 'x' }])).rejects.toThrow(
      'unknown',
    )
    await expect(h.excludeItem('item-invented', 'not needed')).rejects.toThrow()
  })

  it('records a model-reported gap as an unverified item with its reason', async () => {
    const { host: h } = host()
    await h.recordGap({
      reasonCode: 'no-permission',
      detail: 'the checked control opened a login page',
      url: 'https://shop.example.org/catalog',
    })
    expect(h.snapshot().items[0]).toMatchObject({
      status: 'unverified',
      reasonCode: 'no-permission',
      targetSource: 'agent',
    })
  })

  it('does not let an empty update clear an executor-owned obligation', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp'],
      candidateDetail: 'button "Filter"',
      candidateCategories: ['local-interaction'],
    })
    // The candidate list offered an interaction, so the sampling obligation exists before any
    // selection. An empty model update must not discharge it.
    expect(h.completionFacts().gaps.map((g) => g.reason)).toContain('no-local-interaction-selected')
    await h.selectItems([])
    expect(h.completionFacts().gaps.map((g) => g.reason)).toContain('no-local-interaction-selected')
  })

  it('offers the sampler a bounded candidate list and reports what it truncated', async () => {
    const { host: h } = host()
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['shot.webp'],
      candidateDetail: '40 controls',
      candidateCategories: ['local-interaction'],
      candidateItems: Array.from({ length: 12 }, (_, i) => ({
        ref: `e${i}`,
        description: `button ${i}`,
        category: 'local-interaction' as const,
      })),
    })
    expect(h.candidateItems().length).toBeLessThanOrEqual(8)
    expect(h.snapshot().candidates?.truncated).toBe(4)
  })
})

describe('pending candidate continuity', () => {
  it('reuses only a pending same-page item and preserves an executed unknown', async () => {
    const { host: h, setSnapshot } = host()
    const observation = (ref: string, continuedItemId?: string) =>
      h.recordObservation({
        url: 'https://shop.example.org/catalog',
        evidenceRefs: ['shot.webp'],
        candidateDetail: 'Filter',
        candidateCategories: ['local-interaction'],
        candidateItems: [
          { ref, description: 'Filter', category: 'local-interaction', continuedItemId },
        ],
      })
    await observation('s1e1')
    const original = h.candidateItems()[0]!.itemId
    await h.selectItems([{ itemId: original, basis: 'public control' }])
    setSnapshot('s2')
    await observation('s2e1', original)
    expect(h.candidateItems()[0]!.itemId).toBe(original)
    expect(events.some((e) => e.type === 'scope:candidate-reobserved')).toBe(true)
    await h.resolveInteraction({
      ref: 's2e1',
      snapshotId: 's2',
      target: 'Filter',
      url: 'https://shop.example.org/catalog',
      category: 'local-interaction',
      outcome: 'unverified',
      reasonCode: 'missing-result',
      evidenceRefs: ['after.json'],
    })
    setSnapshot('s3')
    await observation('s3e1', original)
    expect(h.candidateItems()[0]!.itemId).not.toBe(original)
    expect(h.selectedCandidates()).toHaveLength(0)
    await h.resolveInteraction({
      ref: 's2e1',
      snapshotId: 's2',
      target: 'Filter',
      url: 'https://shop.example.org/catalog',
      category: 'local-interaction',
      outcome: 'verified',
      evidenceRefs: ['new.json'],
    })
    expect(h.snapshot().items.find((i) => i.itemId === original)?.status).toBe('unverified')
    expect(h.completionGaps().some((g) => g.itemId === original)).toBe(true)
  })
})

it('counts public controls separately from repeated checks without erasing an unknown', async () => {
  const { host: h, setSnapshot } = host()
  let original = ''
  for (const [index, key] of ['a', 'a', 'b', 'c', 'd'].entries()) {
    const snapshot = `s${index}`,
      ref = `e${index}`
    setSnapshot(snapshot)
    await h.recordObservation({
      url: 'https://shop.example.org/catalog',
      evidenceRefs: ['snapshot'],
      candidateDetail: key,
      candidateCategories: ['local-interaction'],
      candidateItems: [{ ref, category: 'local-interaction', description: key, samplingKey: key }],
    })
    const item = h.candidateItems()[0]!
    if (!index) original = item.itemId
    if (key === 'd') {
      expect(() => h.assertActionSelectable(ref, snapshot)).toThrow('sampling-cap')
      await expect(
        h.selectItems([{ itemId: item.itemId, basis: 'fourth control' }]),
      ).rejects.toThrow('sampling-cap')
    } else {
      expect(() => h.assertActionSelectable(ref, snapshot)).not.toThrow()
      await h.resolveInteraction({
        ref,
        snapshotId: snapshot,
        target: key,
        url: 'https://shop.example.org/catalog',
        category: 'local-interaction',
        evidenceRefs: ['measurement'],
        outcome: index ? 'verified' : 'unverified',
        reasonCode: index ? 'measured' : 'missing',
      })
    }
  }
  expect(h.localSampling()).toMatchObject({ limit: 3, selected: 3, remaining: 0 })
  expect(() => h.assertActionSelectable('unoffered', 'missing', true)).toThrow('sampling-cap')
  expect(
    h.snapshot().items.filter((i) => i.selected && i.category === 'local-interaction'),
  ).toHaveLength(4)
  expect(h.snapshot().items.find((i) => i.itemId === original)?.status).toBe('unverified')
  expect(h.completionGaps().some((g) => g.itemId === original)).toBe(true)
})
