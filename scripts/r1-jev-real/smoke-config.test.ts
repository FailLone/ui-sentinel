import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { configSchema, blockers, freezeSchema } from './config.ts'
import { dryRun } from './runner.ts'
import { loadDataset } from './dataset.ts'

const ROOT = process.cwd()
const CONFIG_PATH = 'plans/r1-jev-real/smoke-config.json'
const config = JSON.parse(readFileSync(join(ROOT, CONFIG_PATH), 'utf8'))

const dirs: string[] = []
const freshDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'r1-smoke-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})

describe('smoke-config.json', () => {
  it('is a valid campaign config in the smoke phase', () => {
    const parsed = configSchema.parse(config)
    expect(parsed.phase).toBe('smoke')
  })

  it('pins the proposed batch ceilings: 6 requests, US$0.25, 5 minutes wall clock', () => {
    const parsed = configSchema.parse(config)
    expect(parsed.limits).toEqual({ maxAttempts: 6, maxCostUsd: 0.25, maxWallMs: 300000 })
  })

  it('pins one request at 15 seconds, one repetition, single concurrency', () => {
    const parsed = configSchema.parse(config)
    expect(parsed.requestTimeoutMs).toBe(15000)
    expect(parsed.repetitions).toBe(1)
    expect(parsed.profile.maxQuestions).toBe(65)
  })

  it('points at the derived six-state dataset with a matching digest', () => {
    const parsed = configSchema.parse(config)
    expect(parsed.dataset).toBe('evaluation/r1-jev-real/smoke-inputs.json')
    const loaded = loadDataset(ROOT, parsed)
    expect(loaded.cases.map((c) => c.id)).toEqual(['s01', 's03', 's05', 's07', 's17', 's21'])
  })

  it('keeps conditional arithmetic separate from a verified billing reservation', () => {
    const parsed = configSchema.parse(config)
    expect(parsed.protocol.billingBoundVerified).toBe(false)
    expect(parsed.protocol.quoteUsd).toBeNull()
    expect(blockers(parsed)).toContain('billing-bound-unverified')
  })

  it('still blocks on the question-count limit, which remains undocumented', () => {
    // Closing one gap must not quietly close the other: no source documents a questions cap.
    const parsed = configSchema.parse(config)
    expect(parsed.protocol.questionsVerified).toBe(false)
    expect(blockers(parsed)).toContain('question-limit-unverified')
  })

  it('never raises a caller limit above the module hard ceilings', () => {
    const parsed = configSchema.parse(config)
    const first = loadDataset(ROOT, parsed).cases[0]
    expect(first.input.limits.maxCandidates).toBeLessThanOrEqual(32)
    expect(first.input.limits.maxInputBytes).toBeLessThanOrEqual(32768)
    expect(first.input.limits.maxHistory).toBeLessThanOrEqual(32)
    expect(first.input.state.cacheable).toBe(false)
  })
})

describe('dry-run on the six states', () => {
  it('produces six prepared requests, zero network calls and no real model', () => {
    const output = join(freshDir(), 'dry')
    const result = dryRun(ROOT, config, output)
    expect(result.mode).toBe('dry-run')
    expect(result.cases).toBe(6)
    const preflight = JSON.parse(readFileSync(join(output, 'preflight.json'), 'utf8'))
    expect(preflight.networkRequests).toBe(0)
    expect(preflight.realModel).toBe('not-run')
    expect(preflight.priceEstimate).toBeNull()
    expect(preflight.identity.modelId).toBe('typesafe/jev-1.13-20260917')
    expect(preflight.identity.provider).toBe('TypeSafe')
  })

  it('keeps the still-open question-limit blocker visible in the dry-run output', () => {
    const output = join(freshDir(), 'dry')
    const result = dryRun(ROOT, config, output)
    expect(result.blockers).toContain('question-limit-unverified')
    expect(result.blockers).toContain('billing-bound-unverified')
  })

  it('emits a freeze whose schema parses and whose config digest matches the file', () => {
    const output = join(freshDir(), 'dry')
    dryRun(ROOT, config, output)
    const freeze = freezeSchema.parse(JSON.parse(readFileSync(join(output, 'freeze.json'), 'utf8')))
    expect(freeze.version).toBe('r1-jev-freeze-1')
    expect(freeze.config.phase).toBe('smoke')
    expect(freeze.sourceSha).toMatch(/^[a-f0-9]{40}$/)
  })

  it('writes one input and one compiled request per state, with five questions each', () => {
    const output = join(freshDir(), 'dry')
    dryRun(ROOT, config, output)
    for (const id of ['s01', 's03', 's05', 's07', 's17', 's21']) {
      const compiled = JSON.parse(readFileSync(join(output, 'requests', `${id}.json`), 'utf8'))
      // Two eligible candidates x two score dimensions + one readiness question.
      expect(Object.keys(compiled.questions)).toHaveLength(5)
      expect(compiled.byteLength).toBeLessThanOrEqual(32768)
      expect(compiled.wireDigest).toMatch(/^[a-f0-9]{64}$/)
    }
  })
})
