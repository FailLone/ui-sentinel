import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runOfflineCli } from './offline-cli.ts'

/**
 * T15 requires proof of zero egress that does NOT depend on an API key being absent. A missing key
 * only makes a real call fail; it does not prove none was attempted. This file therefore proves
 * zero egress two independent ways:
 *   1. runtime - every fetch call throws while the full replay still completes; and
 *   2. static  - no production module in the allowed write set can reach a network primitive at all,
 *      because none of them imports one.
 */
const dirs: string[] = []
function out(): string {
  const dir = `artifacts/r1-jev/trap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const PRODUCTION_DIRS = ['src/agent/decisions/exploration', 'scripts/r1-jev']
const NETWORK_PRIMITIVES = [
  'node:net',
  'node:tls',
  'node:dns',
  'node:http',
  'node:https',
  'node:http2',
  'undici',
  'node-fetch',
  'axios',
  'got',
]

function productionFiles(): string[] {
  return PRODUCTION_DIRS.flatMap((dir) =>
    readdirSync(dir)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
      .map((name) => join(dir, name)),
  )
}

describe('network trap: zero egress regardless of key presence', () => {
  it('has no production module that can reach a network primitive', () => {
    const files = productionFiles()
    expect(files.length).toBeGreaterThan(0)
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const primitive of NETWORK_PRIMITIVES) {
        if (
          new RegExp(`from\\s+['"]${primitive.replace(/[/:]/g, (m) => `\\${m}`)}['"]`).test(source)
        )
          offenders.push(`${file}:${primitive}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('has no production module that reads a model key or model id from the environment', () => {
    // Strip comments and block comments first: prose about process.env is not a read of it.
    const codeOnly = (source: string) =>
      source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const offenders: string[] = []
    for (const file of productionFiles()) {
      const source = codeOnly(readFileSync(file, 'utf8'))
      if (/process\.env/.test(source)) offenders.push(`${file}:process.env`)
      for (const key of ['OPENROUTER', 'COMPLETION_REVIEW', 'AGENT_MODEL', 'VISION_MODEL'])
        if (new RegExp(key).test(source)) offenders.push(`${file}:${key}`)
    }
    expect(offenders).toEqual([])
  })

  it('completes the full replay with fetch trapped while a plausible key IS present', async () => {
    let fetchCalls = 0
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      fetchCalls += 1
      throw new Error('network-trap:fetch-denied')
    })
    // Deliberately leave a plausible key set: the trap, not the key, is the proof.
    const previousKey = process.env.OPENROUTER_API_KEY
    process.env.OPENROUTER_API_KEY = 'present-but-must-never-be-used'
    try {
      const target = out()
      const code = await runOfflineCli({ output: target })
      expect(code).toBe(0)
      expect(fetchCalls).toBe(0)
      const rows = readFileSync(join(target, 'results.jsonl'), 'utf8').trim().split('\n')
      expect(rows.length).toBe(22)
      expect(rows.every((r) => JSON.parse(r).realModel === 'not-run')).toBe(true)
      expect(rows.every((r) => JSON.parse(r).usage.mode === 'stub')).toBe(true)
      expect(rows.every((r) => JSON.parse(r).usage.billable === false)).toBe(true)
    } finally {
      fetchSpy.mockRestore()
      if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY
      else process.env.OPENROUTER_API_KEY = previousKey
    }
  })

  it('does not consult a model id from the environment at all', async () => {
    const target = out()
    const previous = process.env.AGENT_MODEL
    process.env.AGENT_MODEL = 'must-never-be-read'
    try {
      const code = await runOfflineCli({ output: target })
      expect(code).toBe(0)
      const summary = JSON.parse(readFileSync(join(target, 'summary.json'), 'utf8'))
      expect(summary.realModel).toBe('not-run')
      expect(summary.claims).toEqual([])
    } finally {
      if (previous === undefined) delete process.env.AGENT_MODEL
      else process.env.AGENT_MODEL = previous
    }
  })
})
