import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { prepare, runCampaign } from './runner.ts'
import { evaluateEvidence } from './score.ts'
import { sealEvidence } from './evidence.ts'
import { jsonResponse, replyFor } from './test-support.ts'
import { sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'

const root = mkdtempSync(join(tmpdir(), 'r1-score-audit-'))
const original = join(root, 'artifacts/original')
const copies: string[] = []
const labels = 'evaluation/r1-jev-quality/development-labels.json'
const read = (dir: string, path: string) => JSON.parse(readFileSync(join(dir, path), 'utf8'))
const write = (dir: string, path: string, value: unknown) =>
  writeFileSync(join(dir, path), JSON.stringify(value, null, 2) + '\n')
function copy() {
  const target = mkdtempSync(join(root, 'artifacts/copy-'))
  cpSync(original, target, { recursive: true })
  copies.push(target)
  return target
}
function evaluate(dir: string) {
  rmSync(join(dir, 'manifest.json'))
  sealEvidence(dir)
  return evaluateEvidence(root, dir, labels)
}
function journal(dir: string, mutate: (rows: any[]) => any[]) {
  const rows = mutate(
    readFileSync(join(dir, 'ledger.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((s) => JSON.parse(s)),
  )
  rows.forEach((row, i) => {
    row.seq = i
    row.previous = rows[i - 1]?.hash ?? ''
    row.hash = sha256(
      JSON.stringify([
        row.seq,
        row.previous,
        row.at,
        row.kind,
        row.id,
        row.quote,
        row.cost,
        row.limits ?? null,
      ]),
    )
  })
  writeFileSync(join(dir, 'ledger.jsonl'), rows.map((row) => JSON.stringify(row)).join('\n') + '\n')
}
function handoff(dir: string, key: string, reason = 'requires-agent-investigation') {
  const row = read(dir, `results/${key}.json`)
  Object.assign(row.result, { kind: 'handoff', outcome: 'handoff', reasonCode: reason })
  delete row.result.scores
  delete row.result.orderedCandidateIds
  write(dir, `results/${key}.json`, row)
}
function rawHandoff(dir: string, key: string, reason = 'requires-agent-investigation') {
  const event = read(dir, `attempts/${key}-response.json`)
  const raw = JSON.parse(event.responseText)
  raw.answers.readiness.choice = reason
  raw.answers.readiness.probabilities = {
    scoreable: 0,
    'insufficient-information': reason === 'insufficient-information' ? 1 : 0,
    'requires-agent-investigation': reason === 'requires-agent-investigation' ? 1 : 0,
  }
  event.responseText = JSON.stringify(raw)
  event.responseDigest = sha256(event.responseText)
  delete event.receipt
  write(dir, `attempts/${key}-response.json`, event)
}
beforeAll(async () => {
  mkdirSync(join(root, 'evaluation'))
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
  const config = JSON.parse(readFileSync('plans/r1-jev-real/development-config.json', 'utf8'))
  config.dataset = 'evaluation/inputs.json'
  config.protocol = {
    questionsVerified: true,
    billingBoundVerified: true,
    source: 'https://example.invalid/test-only',
    checkedAt: '2026-10-07',
    quoteUsd: 0.01,
    basis: 'Synthetic injected responses only.',
  }
  const freeze = prepare(root, config).freeze
  const authorization = {
    version: 'r1-jev-authorization-1',
    authorized: true,
    freezeSha256: sha256(JSON.stringify(freeze)),
    approvedBy: 'unit-test-only',
    approvalReference: 'injected-no-network',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }
  expect(
    await runCampaign({
      root,
      freeze,
      authorization,
      output: original,
      getKey: () => 'unit-test-only-secret-abcdef',
      fetch: async (_url, init) =>
        jsonResponse(replyFor({ questions: JSON.parse(init.body as string).questions })),
    }),
  ).toEqual({ completed: 24, stopped: null })
})
afterEach(() => {
  for (const dir of copies.splice(0)) rmSync(dir, { recursive: true, force: true })
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('sealed evidence must join dispatch, result and durable accounting', () => {
  it('accepts an intact fake campaign with exact request and cost replay', () => {
    const report = evaluate(copy())
    expect(report.metrics.knownCostUsd).toBeCloseTo(0.024)
    expect(report.verdict).toBe('development-only')
  })
  it.each(['empty', 'omitted'] as const)(
    'rejects %s ledger tickets even with valid resealed hashes',
    (variant) => {
      const dir = copy()
      const id = read(dir, 'results/s01-0.json').result.trace.attemptId
      journal(dir, (rows) =>
        variant === 'empty' ? rows.slice(0, 1) : rows.filter((r) => r.id !== id),
      )
      expect(() => evaluate(dir)).toThrow('dispatch-ledger-mismatch')
    },
  )
  it('rejects a ledger ticket whose dispatch event is missing', () => {
    const dir = copy()
    rmSync(join(dir, 'attempts/s01-0-dispatch.json'))
    expect(() => evaluate(dir)).toThrow('attempt-event-chain')
  })
  it('rejects extra and duplicated dispatch files', () => {
    const dir = copy()
    copyFileSync(
      join(dir, 'attempts/s01-0-dispatch.json'),
      join(dir, 'attempts/extra-dispatch.json'),
    )
    expect(() => evaluate(dir)).toThrow('unrepresented-provider-attempt')
  })
  it('rejects a dispatch assigned to another attempt', () => {
    const dir = copy(),
      event = read(dir, 'attempts/s01-0-dispatch.json')
    event.attemptId = read(dir, 'results/s02-0.json').result.trace.attemptId
    write(dir, 'attempts/s01-0-dispatch.json', event)
    expect(() => evaluate(dir)).toThrow('attempt-event-binding')
  })
  it('rejects duplicate attempt identities even if every associated event was relabelled', () => {
    const dir = copy(),
      row = read(dir, 'results/s02-0.json')
    row.result.trace.attemptId = read(dir, 'results/s01-0.json').result.trace.attemptId
    write(dir, 'results/s02-0.json', row)
    for (const stage of ['prepared', 'dispatch', 'response']) {
      const path = `attempts/s02-0-${stage}.json`,
        event = read(dir, path)
      event.attemptId = row.result.trace.attemptId
      write(dir, path, event)
    }
    expect(() => evaluate(dir)).toThrow('duplicate-result-attempt')
  })
  it('rejects changed prepared wire and response ownership', () => {
    for (const stage of ['prepared', 'response']) {
      const dir = copy(),
        path = `attempts/s01-0-${stage}.json`,
        event = read(dir, path)
      if (stage === 'prepared') event.wire += ' '
      else event.requestDigest = '0'.repeat(64)
      write(dir, path, event)
      expect(() => evaluate(dir)).toThrow(
        stage === 'prepared' ? 'prepared-request-mismatch' : 'attempt-event-binding',
      )
    }
  })
  it('rejects a known ledger fee inconsistent with the original response', () => {
    const dir = copy()
    journal(dir, (rows) => rows.map((r) => (r.kind === 'settle' ? { ...r, cost: 0 } : r)))
    expect(() => evaluate(dir)).toThrow('ledger-response-cost-mismatch')
  })
  it('rejects forged usage in either response metadata or result', () => {
    for (const target of ['event', 'result']) {
      const dir = copy(),
        path = target === 'event' ? 'attempts/s01-0-response.json' : 'results/s01-0.json',
        row = read(dir, path)
      if (target === 'event') row.usage.costUsd = 0
      else row.result.trace.usage.costUsd = 0
      write(dir, path, row)
      expect(() => evaluate(dir)).toThrow(
        target === 'event' ? 'response-usage-mismatch' : 'result-usage-mismatch',
      )
    }
  })
  it('rejects a ticket whose result and request evidence have both disappeared', () => {
    const dir = copy()
    rmSync(join(dir, 'results/s24-0.json'))
    for (const stage of ['prepared', 'dispatch', 'response'])
      rmSync(join(dir, `attempts/s24-0-${stage}.json`))
    expect(() => evaluate(dir)).toThrow('unrepresented-paid-attempt')
  })
  it('rejects a ticket quote changed independently of the frozen dispatch budget', () => {
    const dir = copy()
    journal(dir, (rows) => rows.map((r) => (r.kind === 'reserve' ? { ...r, quote: 0.009 } : r)))
    expect(() => evaluate(dir)).toThrow('ledger-quote-mismatch')
  })
})

describe('handoff credit comes from normalized raw responses', () => {
  it('rejects scores reclassified as semantic handoff', () => {
    const dir = copy()
    handoff(dir, 's17-0')
    expect(() => evaluate(dir)).toThrow('handoff-replay-mismatch')
  })
  it('rejects a forged semantic reason even when the raw response is a valid handoff', () => {
    const dir = copy()
    rawHandoff(dir, 's17-0', 'insufficient-information')
    handoff(dir, 's17-0', 'requires-agent-investigation')
    expect(() => evaluate(dir)).toThrow('handoff-replay-mismatch')
  })
  it('rejects missing raw response instead of crediting the handoff', () => {
    const dir = copy()
    handoff(dir, 's17-0')
    rmSync(join(dir, 'attempts/s17-0-response.json'))
    expect(() => evaluate(dir)).toThrow('attempt-event-chain')
  })
  it('credits a matching raw semantic handoff', () => {
    const dir = copy()
    rawHandoff(dir, 's17-0')
    handoff(dir, 's17-0')
    expect(evaluate(dir).perState.find((s) => s.id === 's17')!.handoffRecall).toBe(1)
  })
  it.each(['timeout', 'cancelled', 'transport-failed'])(
    'retains %s as a nonsemantic failure with unknown cost',
    (reason) => {
      const dir = copy(),
        key = 's24-0',
        event = read(dir, `attempts/${key}-response.json`),
        row = read(dir, `results/${key}.json`)
      rmSync(join(dir, `attempts/${key}-response.json`))
      const usage = {
        status: 'unknown',
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        source: 'provider',
      }
      write(dir, `attempts/${key}-failure.json`, {
        attemptId: event.attemptId,
        requestDigest: event.requestDigest,
        wireDigest: event.wireDigest,
        stage: 'failure',
        usage,
        code: reason === 'transport-failed' ? reason : 'aborted',
        durationMs: 1,
      })
      row.result.trace.usage = usage
      write(dir, `results/${key}.json`, row)
      handoff(dir, key, reason)
      journal(dir, (rows) => rows.filter((r) => !(r.kind === 'settle' && r.id === event.attemptId)))
      const report = evaluate(dir)
      expect(report.verdict).toBe('incomplete')
      expect(report.metrics.unknownCostCount).toBe(1)
      expect(report.perState.find((s) => s.id === 's24')!.handoffRecall).toBe(0)
    },
  )
})
