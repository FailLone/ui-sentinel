import { it, expect } from 'vitest'
import { createProgressDetector, type ProgressFacts } from './progress-detector.ts'
const facts: ProgressFacts = {
  pageUrl: 'http://localhost/shop',
  pageFingerprint: 'button disabled',
  hypothesisFacts: [],
  findingFacts: [],
  measurementFacts: [],
}
it('requires changed facts, not repeated actions or fresh record IDs', () => {
  const d = createProgressDetector()
  expect(d.check(facts).isProgress).toBe(true)
  for (let i = 0; i < 6; i++) expect(d.check(facts).isProgress).toBe(false)
  expect(d.check({ ...facts, pageFingerprint: 'button enabled' }).isProgress).toBe(true)
})
it('tracks new hypothesis semantics and resolutions instead of database IDs', () => {
  const d = createProgressDetector()
  d.check(facts)
  expect(d.check({ ...facts, hypothesisFacts: ['blocked:open'] }).isProgress).toBe(true)
  expect(d.check({ ...facts, hypothesisFacts: ['blocked:open', 'blocked:open'] }).isProgress).toBe(
    false,
  )
  expect(d.check({ ...facts, hypothesisFacts: ['blocked:refuted'] }).isProgress).toBe(true)
})
it('does not give later rounds credit for facts already observed together', () => {
  const d = createProgressDetector(),
    all = {
      ...facts,
      hypothesisFacts: ['h'],
      findingFacts: ['f'],
      measurementFacts: ['measured 5 seconds disabled'],
    }
  d.check(all)
  expect(d.check(all).isProgress).toBe(false)
  expect(d.check({ ...all, measurementFacts: ['measured 5 seconds enabled'] }).isProgress).toBe(
    true,
  )
})
it('does not reset no-progress on page cycling or repeated measurements', () => {
  const d = createProgressDetector()
  d.check(facts)
  d.check({ ...facts, pageFingerprint: 'cart' })
  expect(d.check(facts).isProgress).toBe(false)
})

it('counts a completed analysis fact once, including a reviewed answer without defect candidates', () => {
  const detector = createProgressDetector()
  const facts = {
    pageUrl: 'http://example.test',
    hypothesisFacts: [],
    findingFacts: [],
    measurementFacts: [],
  }
  detector.check(facts)
  expect(detector.check({ ...facts, analysisFacts: [] }).isProgress).toBe(false)
  const reviewed = { ...facts, analysisFacts: ['snapshot-v1:submit-access:reviewed-unobscured'] }
  expect(detector.check(reviewed).isProgress).toBe(true)
  expect(detector.check(reviewed).isProgress).toBe(false)
})
