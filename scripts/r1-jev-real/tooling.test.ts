import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  copyFileSync,
  appendFileSync,
  readdirSync,
  symlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { openCampaignLedger } from './ledger.ts'
import { dryRun, prepare, runCampaign } from './runner.ts'
import { sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'
import { sealEvidence, verifyEvidence, writeJson } from './evidence.ts'
import { evaluateEvidence, bootstrap, ndcg } from './score.ts'
import { jsonResponse, replyFor } from './test-support.ts'
import { calibrateEvidence } from './calibrate.ts'
import { main } from './cli.ts'
const dirs: string[] = []
function temp() {
  const d = mkdtempSync(join(tmpdir(), 'r1-jev-real-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  vi.restoreAllMocks()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const limits = { maxAttempts: 3, maxCostUsd: 0.05, maxWallMs: 10000 }
const config = () => JSON.parse(readFileSync('plans/r1-jev-real/development-config.json', 'utf8'))
function repo() {
  const root = temp()
  mkdirSync(join(root, 'evaluation'), { recursive: true })
  mkdirSync(join(root, 'artifacts'))
  copyFileSync(
    'evaluation/r1-jev-quality/development-inputs.json',
    join(root, 'evaluation/inputs.json'),
  )
  copyFileSync('pnpm-lock.yaml', join(root, 'pnpm-lock.yaml'))
  writeFileSync(join(root, '.gitignore'), 'artifacts/\n')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  git('init', '-q')
  git('add', '.')
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'fixture')
  const c = config()
  c.dataset = 'evaluation/inputs.json'
  return { root, c, git }
}
function authorizedFixture() {
  const { root, c } = repo()
  // Fake-only attestation used with an injected in-memory HTTP transport. Never a real quote.
  c.protocol = {
    questionsVerified: true,
    billingBoundVerified: true,
    source: 'https://example.invalid/test-only',
    checkedAt: '2026-10-07',
    quoteUsd: 0.01,
    basis: 'Synthetic test transport charges exactly .001 per response.',
  }
  const freeze = prepare(root, c).freeze
  const authorization = {
    version: 'r1-jev-authorization-1',
    authorized: true,
    freezeSha256: sha256(JSON.stringify(freeze)),
    approvedBy: 'unit-test-only',
    approvalReference: 'injected-no-network',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }
  return { root, c, freeze, authorization }
}

describe('persistent budget and evidence', () => {
  it('persists pending dispatch, prevents duplicate runner, settles idempotently', () => {
    const d = temp()
    const ledger = openCampaignLedger(d, limits)
    expect(() => openCampaignLedger(d, limits)).toThrow()
    ledger.reserve('a', 0.01)
    expect(() => ledger.reserve('b', 0.01)).toThrow('campaign-stopped')
    ledger.close()
    const reopened = openCampaignLedger(d, limits)
    expect(reopened.snapshot().pending).toBe(1)
    expect(() => reopened.reserve('b', 0.01)).toThrow()
    reopened.settle('a', 0.001)
    reopened.settle('a', 0.001)
    expect(() => reopened.settle('a', 0.002)).toThrow('conflicting-cost')
    reopened.reserve('b', 0.01)
    reopened.settle('b', 0.02)
    expect(reopened.snapshot().overrun).toBe(true)
    expect(() => reopened.reserve('c', 0.01)).toThrow()
    reopened.close()
  })
  it('enforces attempt, cost, time and malformed journal limits', () => {
    let now = 1000
    const d = temp()
    const ledger = openCampaignLedger(d, { ...limits, maxAttempts: 1 }, () => now)
    ledger.reserve('a', 0.04)
    ledger.settle('a', 0.04)
    expect(() => ledger.reserve('b', 0.001)).toThrow()
    ledger.close()
    expect(() => openCampaignLedger(d, limits)).toThrow('ledger-limits')
    appendFileSync(join(d, 'ledger.jsonl'), 'partial')
    expect(() => openCampaignLedger(d, { ...limits, maxAttempts: 1 })).toThrow('ledger-truncated')
    const t = openCampaignLedger(temp(), limits, () => now)
    now += 10001
    expect(() => t.reserve('a', 0)).toThrow()
    t.close()
  })
  it('clock rollback cannot extend a live campaign', () => {
    let now = 10000
    const ledger = openCampaignLedger(temp(), limits, () => now)
    now = 9000
    expect(ledger.snapshot().remainingMs).toBe(0)
    expect(() => ledger.reserve('rollback', 0)).toThrow('campaign-stopped')
    ledger.close()
  })
  it('verifies exact leaf coverage and refuses changed files, extra files or symlinks', () => {
    const root = temp()
    writeJson(join(root, 'one.json'), { x: 1 })
    sealEvidence(root)
    expect(verifyEvidence(root).files).toBe(1)
    writeFileSync(join(root, 'extra'), 'x')
    expect(() => verifyEvidence(root)).toThrow('evidence-index-incomplete')
    rmSync(join(root, 'extra'))
    writeFileSync(join(root, 'one.json'), '{}')
    expect(() => verifyEvidence(root)).toThrow('evidence-hash')
    rmSync(join(root, 'one.json'))
    symlinkSync('/etc/hosts', join(root, 'one.json'))
    expect(() => verifyEvidence(root)).toThrow('symlink-evidence')
  })
})

describe('campaign preflight and safe defaults', () => {
  it('dry run never touches network or secret; includes public requests and blockers', () => {
    const { root, c } = repo()
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw Error('external network forbidden')
    })
    const result = dryRun(root, c, join(root, 'artifacts/dry'))
    expect(result.blockers).toContain('billing-bound-unverified')
    expect(result.cases).toBe(24)
    expect(fetch).not.toHaveBeenCalled()
    expect(verifyEvidence(join(root, 'artifacts/dry')).files).toBe(50)
    const contents = readFileSync(join(root, 'artifacts/dry/requests/s01.json'), 'utf8')
    expect(contents).not.toContain('acceptableTop')
    expect(contents).not.toContain('author-draft')
  })
  it('missing authorization or unverified protocol blocks before reading key', async () => {
    const { root, c } = repo()
    const freeze = prepare(root, c).freeze
    let keys = 0
    await expect(
      runCampaign({
        root,
        freeze,
        authorization: { authorized: false },
        output: join(root, 'artifacts/run'),
        getKey: () => {
          keys++
          return 'fake'
        },
      }),
    ).rejects.toThrow()
    const auth = {
      version: 'r1-jev-authorization-1',
      authorized: true,
      freezeSha256: sha256(JSON.stringify(freeze)),
      approvedBy: 'test',
      approvalReference: 'fake-only',
      expiresAt: '2099-01-01T00:00:00Z',
    }
    await expect(
      runCampaign({
        root,
        freeze,
        authorization: auth,
        output: join(root, 'artifacts/run'),
        getKey: () => {
          keys++
          return 'fake'
        },
      }),
    ).rejects.toThrow('real-preflight-blocked')
    expect(keys).toBe(0)
  })
  it('a dirty source or changed data cannot use the previous freeze', async () => {
    const { root, freeze, authorization } = authorizedFixture()
    writeFileSync(join(root, 'new-code.ts'), 'change')
    await expect(
      runCampaign({
        root,
        freeze,
        authorization,
        output: join(root, 'artifacts/run'),
        getKey: () => {
          throw Error('must not read')
        },
      }),
    ).rejects.toThrow('real-preflight-blocked')
    rmSync(join(root, 'new-code.ts'))
    appendFileSync(join(root, 'evaluation/inputs.json'), '\n')
    expect(() => prepare(root, freeze.config)).toThrow('dataset-digest')
  })
  it('executes fake responses, preserves all attempts, independently replays and prevents reset', async () => {
    const { root, freeze, authorization } = authorizedFixture()
    let count = 0
    const output = join(root, 'artifacts/run')
    const result = await runCampaign({
      root,
      freeze,
      authorization,
      output,
      getKey: () => 'unit-test-only-secret-abcdef',
      fetch: async (_url, init) => {
        count++
        return jsonResponse(replyFor({ questions: JSON.parse(init.body as string).questions }))
      },
    })
    expect(result).toEqual({ completed: 24, stopped: null })
    expect(count).toBe(24)
    expect(verifyEvidence(output).files).toBeGreaterThan(100)
    const report = evaluateEvidence(
      root,
      output,
      'evaluation/r1-jev-quality/development-labels.json',
    )
    expect(report.verdict).toBe('development-only')
    expect(report.metrics.knownCostUsd).toBeCloseTo(0.024)
    expect(report.denominators.rankingStates).toBe(16)
    const calibration = calibrateEvidence(
      root,
      output,
      'evaluation/r1-jev-quality/development-labels.json',
    )
    expect(calibration.networkRequests).toBe(0)
    expect(calibration.table).toHaveLength(6)
    expect(calibration.recommendedThreshold).toBeNull()
    await expect(
      runCampaign({
        root,
        freeze,
        authorization,
        output: join(root, 'artifacts/another'),
        getKey: () => 'unit-test-only-secret-abcdef',
        fetch: async () => {
          throw Error('must not send')
        },
      }),
    ).rejects.toThrow()
  })
  it('unknown fees stop the complete campaign after one dispatch', async () => {
    const { root, freeze, authorization } = authorizedFixture()
    let count = 0
    const result = await runCampaign({
      root,
      freeze,
      authorization,
      output: join(root, 'artifacts/run'),
      getKey: () => 'unit-test-only-secret-abcdef',
      fetch: async (_url, init) => {
        count++
        const r: any = replyFor({ questions: JSON.parse(init.body as string).questions })
        delete r.usage.cost
        return jsonResponse(r)
      },
    })
    expect(result).toEqual({ completed: 1, stopped: 'unknown-cost' })
    expect(count).toBe(1)
    const report = evaluateEvidence(
      root,
      join(root, 'artifacts/run'),
      'evaluation/r1-jev-quality/development-labels.json',
    )
    expect(report.verdict).toBe('incomplete')
    expect(report.metrics.costPerValidAdvice).toBeNull()
    expect(report.perState.filter((s) => s.missing).length).toBe(23)
  })
  it('CLI does not infer run mode or accept duplicate modes', async () => {
    await expect(main([])).rejects.toThrow('choose-one-mode')
    await expect(main(['--dry-run', '--run'])).rejects.toThrow('choose-one-mode')
  })
  it('metrics have known analytic values and deterministic family bootstrap', () => {
    const label: any = {
      scores: [
        { candidateId: 'a', relevance: 3, informationGain: 3 },
        { candidateId: 'b', relevance: 0, informationGain: 0 },
      ],
    }
    expect(ndcg(['a', 'b'], label)).toBe(1)
    expect(ndcg(['b', 'a'], label)).toBeCloseTo(1 / Math.log2(3))
    expect(ndcg([], label)).toBe(0)
    expect(bootstrap([0.1, 0.1, 0.1])!.lower).toBeCloseTo(0.1)
    expect(bootstrap([0.1, 0.1, 0.1])!.upper).toBeCloseTo(0.1)
    expect(bootstrap([0.1, -0.1, 0.5])).toEqual(bootstrap([0.1, -0.1, 0.5]))
  })
})
