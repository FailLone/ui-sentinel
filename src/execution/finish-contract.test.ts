import { expect, it } from 'vitest'
import { resolveShortFinish, shortFinishInput } from './finish-contract.ts'

it('derives the outcome from evidence, retaining unknown and incomplete inspections', () => {
  expect(
    resolveShortFinish({ reason: 'scope-covered' }, { businessResult: 'success', gaps: [] }),
  ).toMatchObject({ businessResult: 'success', blocked: false })
  expect(
    resolveShortFinish({ reason: 'observed-blocker' }, { businessResult: 'unknown', gaps: [] }),
  ).toMatchObject({ businessResult: 'unknown', blocked: true })
  expect(
    resolveShortFinish(
      { reason: 'unverified-scope' },
      { businessResult: 'success', gaps: ['unverified:always:missing'] },
    ),
  ).toMatchObject({ businessResult: 'success', blocked: true })
})

it('accepts only an explicit finish reason code and rejects freeform reports', () => {
  expect(shortFinishInput.safeParse({ reason: ' ' }).success).toBe(false)
  expect(shortFinishInput.safeParse({ reason: 'x'.repeat(241) }).success).toBe(false)
  expect(shortFinishInput.safeParse({ reason: 'scope-covered' }).success).toBe(true)
})
