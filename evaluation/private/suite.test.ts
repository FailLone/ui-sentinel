import { it, expect } from 'vitest'
import { evaluationCases } from './suite.ts'
it('keeps all six cases and three repeats mandatory for minimum acceptance', () => {
  expect(evaluationCases('minimum', 3)).toEqual(['C0', 'C1', 'C2', 'C3', 'C4', 'C5'])
  expect(() => evaluationCases('minimum', 1)).toThrow()
  expect(() => evaluationCases('minimum', 4)).toThrow()
})
it('separates one-pass diagnostics from the minimum gate', () => {
  expect(evaluationCases('diagnostic', 1)).toHaveLength(6)
  expect(() => evaluationCases('diagnostic', 3)).toThrow()
  expect(() => evaluationCases('custom', 1)).toThrow()
})
