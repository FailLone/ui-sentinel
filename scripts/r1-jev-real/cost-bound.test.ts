import { describe, expect, it } from 'vitest'
import { JEV_PRICE_2026_10_07, worstCaseCostBound, type PriceFact } from './cost-bound.ts'

describe('recorded price fact', () => {
  it('records the OpenRouter page rate and the context cap with a citation', () => {
    expect(JEV_PRICE_2026_10_07.inputUsdPerToken).toBe(4.2e-8)
    expect(JEV_PRICE_2026_10_07.outputUsdPerToken).toBe(0)
    expect(JEV_PRICE_2026_10_07.contextTokens).toBe(32000)
    expect(JEV_PRICE_2026_10_07.source).toBe('https://openrouter.ai/typesafe/jev-1.13')
    expect(JEV_PRICE_2026_10_07.checkedAt).toBe('2026-10-07')
  })

  it('matches the two usage examples published in the provider documentation', () => {
    // 492 input tokens -> 0.000020664 and 476 -> 0.000019992, as printed in the Jev tutorial.
    const rate = JEV_PRICE_2026_10_07.inputUsdPerToken
    expect(492 * rate).toBeCloseTo(0.000020664, 12)
    expect(476 * rate).toBeCloseTo(0.000019992, 12)
  })

  it('is consistent with the displayed $0.042 per million input tokens', () => {
    expect(JEV_PRICE_2026_10_07.inputUsdPerToken * 1_000_000).toBeCloseTo(0.042, 12)
  })
})

describe('worstCaseCostBound', () => {
  it('bounds one request by the context cap times the input rate', () => {
    const bound = worstCaseCostBound(JEV_PRICE_2026_10_07, 6, 0.25)
    expect(bound.perRequestUsd).toBeCloseTo(0.001344, 12)
    expect(bound.requests).toBe(6)
    expect(bound.batchUsd).toBeCloseTo(0.008064, 12)
  })

  it('reports the batch bound as comfortably inside the proposed ceiling', () => {
    expect(worstCaseCostBound(JEV_PRICE_2026_10_07, 6, 0.25).withinCeiling).toBe(true)
  })

  it('flags a bound that would exceed the ceiling instead of silently passing', () => {
    expect(worstCaseCostBound(JEV_PRICE_2026_10_07, 6, 0.001).withinCeiling).toBe(false)
  })

  it('charges nothing for output tokens', () => {
    const paidOutput: PriceFact = { ...JEV_PRICE_2026_10_07, outputUsdPerToken: 1e-6 }
    expect(worstCaseCostBound(paidOutput, 1, 1).perRequestUsd).toBe(
      worstCaseCostBound(JEV_PRICE_2026_10_07, 1, 1).perRequestUsd,
    )
  })

  it('refuses a negative or non-finite rate rather than returning a nonsense bound', () => {
    expect(() => worstCaseCostBound({ ...JEV_PRICE_2026_10_07, inputUsdPerToken: -1 }, 1, 1)).toThrowError(
      /invalid-price-fact/,
    )
    expect(() =>
      worstCaseCostBound({ ...JEV_PRICE_2026_10_07, inputUsdPerToken: Number.POSITIVE_INFINITY }, 1, 1),
    ).toThrowError(/invalid-price-fact/)
    expect(() => worstCaseCostBound(JEV_PRICE_2026_10_07, -1, 1)).toThrowError(/invalid-request-count/)
  })

  it('states the assumptions the bound rests on, including the undocumented one', () => {
    const bound = worstCaseCostBound(JEV_PRICE_2026_10_07, 6, 0.25)
    expect(bound.assumptions.join(' ')).toMatch(/context length/)
    expect(bound.assumptions.join(' ')).toMatch(/output tokens are free/)
    expect(bound.assumptions.join(' ')).toMatch(/over-cap/)
    expect(bound.assumptions.join(' ')).toMatch(/client rejects oversize payloads/)
  })

  it('is deterministic', () => {
    expect(JSON.stringify(worstCaseCostBound(JEV_PRICE_2026_10_07, 6, 0.25))).toEqual(
      JSON.stringify(worstCaseCostBound(JEV_PRICE_2026_10_07, 6, 0.25)),
    )
  })
})