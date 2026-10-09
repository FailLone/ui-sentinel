import { readFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runOfflineCli, stripVolatile } from './offline-cli.ts'

// Output must stay package-relative, so tests write under the git-ignored artifacts/ directory.
const tempDirs: string[] = []
function tempOut(): string {
  const dir = `artifacts/r1-jev/test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  tempDirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('offline CLI', () => {
  it('writes JSONL rows and a summary for the whole seed set', async () => {
    const out = tempOut()
    const code = await runOfflineCli({ output: out })
    expect(code).toBe(0)
    const rows = readFileSync(join(out, 'results.jsonl'), 'utf8').trim().split('\n')
    expect(rows.length).toBe(22)
    const summary = JSON.parse(readFileSync(join(out, 'summary.json'), 'utf8'))
    expect(summary.cases).toBe(22)
    expect(summary.realModel).toBe('not-run')
    expect(summary.baselineRanked + summary.baselineHandoff + summary.baselineInvalidInput).toBe(22)
    expect(summary.stubRanked + summary.stubHandoff + summary.stubInvalidInput).toBe(22)
  })

  it('records versions, timing and usage fields on every emitted row', async () => {
    const out = tempOut()
    await runOfflineCli({ output: out })
    const rows = readFileSync(join(out, 'results.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    for (const row of rows) {
      expect(row.versions).toBeDefined()
      expect(row.versions.contract).toBe('r1-exploration-contract-1')
      expect(row.outcome).toBeDefined()
      expect(row.usage).toBeDefined()
    }
  })

  it('produces identical deterministic fields across two runs, with timing separated', async () => {
    const first = tempOut()
    const second = tempOut()
    await runOfflineCli({ output: first })
    await new Promise((r) => setTimeout(r, 15))
    await runOfflineCli({ output: second })
    const a = stripVolatile(readFileSync(join(first, 'results.jsonl'), 'utf8'))
    const b = stripVolatile(readFileSync(join(second, 'results.jsonl'), 'utf8'))
    expect(a).toBe(b)
    // The raw rows must still carry real timings, just not in the compared projection.
    const rawA = readFileSync(join(first, 'results.jsonl'), 'utf8')
    const rawB = readFileSync(join(second, 'results.jsonl'), 'utf8')
    expect(rawA).toContain('durationMs')
    expect(rawB).toContain('durationMs')
    expect(JSON.parse(rawA.trim().split('\n')[0]).attemptId).not.toBe(
      JSON.parse(rawB.trim().split('\n')[0]).attemptId,
    )
  })

  it('makes no network call even with no API key present', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const out = tempOut()
    await runOfflineCli({ output: out })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('refuses to write outside the package directory', async () => {
    await expect(runOfflineCli({ output: '/tmp/r1-jev-escape' })).rejects.toThrow(/outside-package/)
    await expect(runOfflineCli({ output: '../r1-jev-escape' })).rejects.toThrow(/outside-package/)
  })

  it('rejects a --real run without an explicit dry-run plan', async () => {
    const out = tempOut()
    await expect(runOfflineCli({ output: out, real: true })).rejects.toThrow(
      /real-not-authorized|dry-run/,
    )
  })

  it('prints a dry-run plan for --real --dry-run without executing anything', async () => {
    const out = tempOut()
    const code = await runOfflineCli({ output: out, real: true, dryRun: true })
    expect(code).toBe(0)
    expect(existsSync(join(out, 'real-plan.json'))).toBe(true)
    const plan = JSON.parse(readFileSync(join(out, 'real-plan.json'), 'utf8'))
    expect(plan.authorized).toBe(false)
    expect(plan.modelCompatibility).toBe('unverified')
    expect(plan.requiresSeparateAuthorization).toBe(true)
    expect(plan.runs).toBe(0)
  })
})
