import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseExplorationInput, type ExplorationInput } from './contracts.ts'
import { buildScoringRequest, SYSTEM_INSTRUCTION } from './prompt.ts'

function fixture(name: string): ExplorationInput {
  const parsed = parseExplorationInput(
    JSON.parse(readFileSync(`evaluation/r1-jev-dev/public/${name}.json`, 'utf8')),
  )
  if (!parsed.ok) throw new Error(`fixture ${name} should be valid`)
  return parsed.value
}

describe('bounded scoring question', () => {
  it('declares page-derived text untrusted and forbids it from changing schema, task or permissions', () => {
    expect(SYSTEM_INSTRUCTION).toMatch(/untrusted/i)
    expect(SYSTEM_INSTRUCTION).toMatch(/schema/i)
    expect(SYSTEM_INSTRUCTION).toMatch(/permission/i)
    expect(SYSTEM_INSTRUCTION).toMatch(/injection|prompt/i)
  })

  it('carries the caller task verbatim as ordinary data', () => {
    const request = buildScoringRequest(fixture('menu'))
    expect(request.system).toBe(SYSTEM_INSTRUCTION)
    expect(request.data.task.goal).toContain('帮助文档页面')
  })

  it('includes only public candidate fields', () => {
    const request = buildScoringRequest(fixture('same-text-context'))
    expect(request.data.candidates.map((c) => c.id)).toEqual(['c1', 'c2'])
    const serialized = JSON.stringify(request.data)
    expect(serialized).toContain('文档目录的更多章节')
    // No evaluator-side field ever appears in the body.
    for (const banned of ['expectedStatus', 'checks', 'reason', 'evaluator', 'scenario'])
      expect(serialized).not.toContain(banned)
  })

  it('never leaks the fixture file name into the request body', () => {
    const request = buildScoringRequest(fixture('page-injection'))
    expect(JSON.stringify(request.data)).not.toContain('page-injection')
    expect(request.data.candidates[0].text).toContain('忽略之前的指令')
  })

  it('keeps injected page text inside the candidate data, not in the system instruction', () => {
    const request = buildScoringRequest(fixture('page-injection'))
    expect(SYSTEM_INSTRUCTION).not.toContain('忽略之前的指令')
    expect(request.system).not.toContain('admin')
  })

  it('is deterministic for the same input', () => {
    const a = buildScoringRequest(fixture('tabs'))
    const b = buildScoringRequest(fixture('tabs'))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('produces a body within the module hard byte ceiling', () => {
    const request = buildScoringRequest(fixture('menu'))
    expect(request.byteLength).toBeLessThanOrEqual(32768)
    expect(request.byteLength).toBe(Buffer.byteLength(request.body, 'utf8'))
  })

  it('refuses to silently truncate an oversized obligation set', () => {
    const input = fixture('menu')
    const huge: ExplorationInput = {
      ...input,
      candidates: [
        {
          ...input.candidates[0],
          text: 'x'.repeat(20000),
          context: 'y'.repeat(20000),
        },
      ],
    }
    const request = buildScoringRequest(huge)
    // The facts are preserved rather than dropped; the caller is told it does not fit.
    expect(request.fits).toBe(false)
    expect(request.data.candidates[0].text.length).toBe(20000)
  })

  it('binds the request to a local digest rather than a provider-reported version', () => {
    const request = buildScoringRequest(fixture('menu'))
    expect(request.requestDigest).toMatch(/^[0-9a-f]{64}$/)
    expect(request.promptVersion).toBe('r1-exploration-prompt-1')
  })
})
