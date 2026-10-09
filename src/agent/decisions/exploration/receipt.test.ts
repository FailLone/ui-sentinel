import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseStubReply, validateReceipt, type NormalizedReceipt } from './receipt.ts'

function stub(name: string): unknown {
  return JSON.parse(readFileSync(`evaluation/r1-jev-dev/stub/${name}.json`, 'utf8'))
}

const candidateIds = ['c1']

/** Build a synthetic normalized receipt, including deliberately invalid score values. */
function scored(
  scores: {
    candidateId: string
    relevance: number
    informationGain: number
    uncertainty: number | null
  }[],
): NormalizedReceipt {
  return {
    kind: 'scores',
    scores,
    usage: {
      status: 'unknown',
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      source: 'provider',
    },
    modelId: null,
  }
}

describe('stub reply adaptation', () => {
  it('reads a scored stub reply and its zero-cost stub usage', () => {
    const parsed = parseStubReply(stub('menu'))
    expect(parsed.ok).toBe(true)
    expect(parsed.ok && parsed.value.kind).toBe('scores')
    expect(parsed.ok && parsed.value.usage).toEqual({
      status: 'known',
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      source: 'stub',
    })
  })

  it('reads a handoff stub reply', () => {
    const parsed = parseStubReply(stub('agent-investigation'))
    expect(parsed.ok && parsed.value.kind).toBe('handoff')
    if (!parsed.ok || parsed.value.kind !== 'handoff') throw new Error('expected a handoff receipt')
    expect(parsed.value.reasonCode).toBe('requires-agent-investigation')
  })

  it('keeps a missing cost as unknown rather than zero', () => {
    const parsed = parseStubReply(stub('missing-candidate-reply'))
    expect(parsed.ok && parsed.value.usage).toEqual({
      status: 'unknown',
      inputTokens: 9,
      outputTokens: 1,
      costUsd: null,
      source: 'provider',
    })
  })

  it('treats a null usage as fully unknown', () => {
    const parsed = parseStubReply(stub('unknown-candidate-reply'))
    expect(parsed.ok && parsed.value.usage).toEqual({
      status: 'unknown',
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      source: 'provider',
    })
  })

  it('rejects a malformed reply without throwing', () => {
    for (const bad of [
      null,
      42,
      { schemaVersion: 'x' },
      { schemaVersion: 'r1-stub-reply-1', kind: 'nope' },
    ]) {
      expect(parseStubReply(bad).ok).toBe(false)
    }
  })
})

describe('receipt validation against the current candidate set', () => {
  it('accepts a complete one-to-one receipt', () => {
    const parsed = parseStubReply(stub('menu'))
    const result = validateReceipt(parsed.ok ? parsed.value : null, candidateIds)
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.kind !== 'scores') throw new Error('expected a scored receipt')
    expect(result.value.scores[0].candidateId).toBe('c1')
  })

  it('rejects a receipt that omits a candidate', () => {
    const parsed = parseStubReply(stub('missing-candidate-reply'))
    const result = validateReceipt(parsed.ok ? parsed.value : null, candidateIds)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('missing-candidate')
  })

  it('rejects a receipt that references an id outside the current set', () => {
    const parsed = parseStubReply(stub('unknown-candidate-reply'))
    const result = validateReceipt(parsed.ok ? parsed.value : null, candidateIds)
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('unknown-candidate')
  })

  it('rejects a duplicated id even when the count matches', () => {
    const parsed = parseStubReply(stub('duplicate-input-id'))
    const result = validateReceipt(parsed.ok ? parsed.value : null, ['c1', 'c2'])
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.detail).toContain('duplicate-candidate')
  })

  it('rejects out-of-range scores instead of clamping them', () => {
    const receipt = scored([
      { candidateId: 'c1', relevance: 1.4, informationGain: 0.5, uncertainty: 0.1 },
    ])
    const result = validateReceipt(receipt, candidateIds)
    expect(result.ok).toBe(false)
  })

  it('rejects a non-finite uncertainty rather than treating it as unknown', () => {
    const receipt = scored([
      { candidateId: 'c1', relevance: 0.5, informationGain: 0.5, uncertainty: Number.NaN },
    ])
    expect(validateReceipt(receipt, candidateIds).ok).toBe(false)
  })

  it('accepts an explicit null uncertainty as unknown', () => {
    const receipt = scored([
      { candidateId: 'c1', relevance: 0.5, informationGain: 0.5, uncertainty: null },
    ])
    const result = validateReceipt(receipt, candidateIds)
    expect(result.ok).toBe(true)
    if (!result.ok || result.value.kind !== 'scores') throw new Error('expected a scored receipt')
    expect(result.value.scores[0].uncertainty).toBeNull()
  })
})
