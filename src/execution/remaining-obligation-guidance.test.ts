import { it, expect } from 'vitest'
import { createRemainingObligationGuidance } from './remaining-obligation-guidance.ts'
import { createProgressDetector } from './progress-detector.ts'

it('offers one decision turn for existing obligations, never manufactures progress or renews', () => {
  const g = createRemainingObligationGuidance(),
    d = createProgressDetector()
  const facts = {
    pageUrl: 'https://example.test/',
    hypothesisFacts: [],
    findingFacts: [],
    measurementFacts: [],
  }
  expect(d.check(facts).isProgress).toBe(true)
  expect(g.take([])).toBeUndefined()
  expect(
    g.take([{ itemId: 'original', ref: 'e2', category: 'local-interaction', description: 'Open' }])
      ?.allowance,
  ).toBe('one-model-turn')
  expect(d.check(facts).isProgress).toBe(false)
  expect(
    g.take([{ itemId: 'new', ref: 'e3', category: 'navigation', description: 'Next' }]),
  ).toBeUndefined()
  expect(d.check({ ...facts, measurementFacts: ['new actual measurement'] }).isProgress).toBe(true)
  expect(
    g.take([{ itemId: 'original', ref: 'e4', category: 'local-interaction', description: 'Open' }]),
  ).toBeUndefined()
})
