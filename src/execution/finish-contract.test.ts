import { expect, it } from 'vitest'
import { resolveShortFinish, shortFinishInput } from './finish-contract.ts'

it('derives the outcome from evidence, retaining unknown and incomplete inspections', () => {
  expect(
    resolveShortFinish(
      { reason: 'Observed scope checked.' },
      { businessResult: 'success', gaps: [] },
    ),
  ).toMatchObject({ businessResult: 'success', blocked: false })
  expect(
    resolveShortFinish(
      { reason: 'Recovery cannot proceed.' },
      { businessResult: 'unknown', gaps: [] },
    ),
  ).toMatchObject({ businessResult: 'unknown', blocked: true })
  expect(
    resolveShortFinish(
      { reason: 'Unverified branch recorded.' },
      { businessResult: 'success', gaps: ['unverified:always:missing'] },
    ),
  ).toMatchObject({ businessResult: 'success', blocked: true })
})

it('rejects empty and oversized finish payloads instead of silently truncating them', () => {
  expect(shortFinishInput.safeParse({ reason: ' ' }).success).toBe(false)
  expect(shortFinishInput.safeParse({ reason: 'x'.repeat(241) }).success).toBe(false)
  expect(shortFinishInput.safeParse({ reason: 'x'.repeat(240) }).success).toBe(true)
})
