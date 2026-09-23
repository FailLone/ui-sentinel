import { describe, it, expect } from 'vitest'
import {
  efficiencyOptions,
  efficiencySchedule,
  efficiencyMetrics,
  efficiencyTotals,
  scoreBoundRecheck,
} from '../../scripts/experiments/efficiency-protocol.ts'

describe('private efficiency experiment protocol', () => {
  it('requires fixed revisions, an explicit phase and an approved learning source', () => {
    expect(() =>
      efficiencyOptions([
        '--baseline-ref',
        'main',
        '--candidate-ref',
        'abcdef0',
        '--phase',
        'diagnostic',
      ]),
    ).toThrow('immutable')
    expect(() =>
      efficiencyOptions([
        '--baseline-ref',
        '1234567',
        '--candidate-ref',
        'abcdef0',
        '--phase',
        'compare',
      ]),
    ).toThrow('learning-source')
    expect(() => efficiencyOptions(['--bogus', '1'])).toThrow('Invalid')
    expect(() => efficiencyOptions(['--phase'])).toThrow('Invalid')
    expect(() =>
      efficiencyOptions([
        '--baseline-ref',
        '1234567',
        '--candidate-ref',
        'abcdef0',
        '--phase',
        'diagnostic',
        '--max-cost-usd',
        '0',
      ]),
    ).toThrow('cost')
  })
  it('alternates paired arms without mixing diagnostic and repeated comparison samples', () => {
    const diagnostic = efficiencySchedule('diagnostic')
    expect(diagnostic.map((r) => `${r.arm}/${r.profile}`)).toEqual([
      'baseline/C0',
      'candidate/C0',
      'candidate/C2',
      'baseline/C2',
    ])
    expect(efficiencySchedule('learning-diagnostic')).toEqual([
      { arm: 'candidate', profile: 'abnormal', repeat: 1 },
      { arm: 'candidate', profile: 'healthy', repeat: 1 },
    ])
    expect(() =>
      efficiencyOptions([
        '--baseline-ref',
        '1234567',
        '--candidate-ref',
        'abcdef0',
        '--phase',
        'learning-diagnostic',
      ]),
    ).toThrow('learning-source')
    const compare = efficiencySchedule('compare')
    expect(compare).toHaveLength(12)
    for (const arm of ['baseline', 'candidate'])
      for (const profile of ['healthy', 'abnormal'])
        expect(compare.filter((r) => r.arm === arm && r.profile === profile)).toHaveLength(3)
  })
  it('keeps missing usage and timing unavailable, failed requests in counts and provider changes incomparable', () => {
    const result = efficiencyMetrics(undefined, [{ status: 'error', usage: null }], 'Wafer')
    expect(result).toMatchObject({
      requests: 1,
      errors: 1,
      unknownUsage: 1,
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      comparableProvider: false,
      elapsedMs: null,
      profile: null,
    })
  })
  it('compares agent and vision against their separately fixed providers', () => {
    const requests = [
      { model: 'agent', provider: 'Wafer' },
      { model: 'vision', provider: 'Alibaba' },
    ]
    expect(
      efficiencyMetrics(undefined, requests, { agent: 'Wafer', vision: 'Alibaba' })
        .comparableProvider,
    ).toBe(true)
    expect(efficiencyMetrics(undefined, requests, { agent: 'Wafer' }).comparableProvider).toBe(
      false,
    )
    expect(
      efficiencyMetrics(undefined, requests, { agent: 'Wafer', vision: 'Other' })
        .comparableProvider,
    ).toBe(false)
  })
  it('does not replace bound-rule evidence with a cheap successful finish', () => {
    const report = {
      findings: [],
      events: [{ type: 'finish:accepted', payload: {} }],
      usage: { modelCalls: 1, actions: 0, elapsedMs: 1 },
      status: 'blocked',
    }
    expect(
      scoreBoundRecheck(report, { orders: [{}] }, [{ exists: true }], 'r', 5000, true).passed,
    ).toBe(false)
  })
})

it('does not zero-fill incomplete aggregate tokens or elapsed time', () => {
  const rows = [
    {
      arm: 'candidate',
      metrics: { requests: 4, elapsedMs: 100, inputTokens: 10, outputTokens: 5 },
    },
    {
      arm: 'candidate',
      metrics: { requests: 2, elapsedMs: 200, inputTokens: null, outputTokens: null },
    },
  ]
  expect(efficiencyTotals(rows, 'candidate')).toEqual({ requests: 6, elapsedMs: 300, tokens: null })
  expect(efficiencyTotals(rows.slice(0, 1), 'candidate')).toEqual({
    requests: 4,
    elapsedMs: 100,
    tokens: 15,
  })
  expect(efficiencyTotals([{ arm: 'candidate', metrics: { requests: 0 } }], 'candidate')).toEqual({
    requests: 0,
    elapsedMs: null,
    tokens: null,
  })
})
