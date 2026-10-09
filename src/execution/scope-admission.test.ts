import { expect, it } from 'vitest'
import { admitOptionalScope } from './scope-admission.ts'
it('uses all live dimensions and reserves unchanged closing plus required work', () => {
  const input = {
    remaining: { actions: 5, modelCalls: 5, timeMs: 90000 },
    requiredBound: { actions: 2, modelCalls: 1, timeMs: 10000 },
    extensionBound: { actions: 1, modelCalls: 2, timeMs: 20000 },
    closingReserve: { actions: 0, modelCalls: 2, timeMs: 60000 },
  }
  expect(admitOptionalScope(input).admitted).toBe(true)
  for (const key of ['actions', 'modelCalls', 'timeMs'] as const) {
    const needed = admitOptionalScope(input).needed![key]
    expect(
      admitOptionalScope({ ...input, remaining: { ...input.remaining, [key]: needed - 1 } })
        .admitted,
    ).toBe(false)
  }
})
it('unknown or invalid bounds never buy optional scope', () => {
  const input = {
    remaining: { actions: 100, modelCalls: 100, timeMs: 999999 },
    closingReserve: { actions: 0, modelCalls: 2, timeMs: 60000 },
  }
  expect(admitOptionalScope(input)).toMatchObject({
    admitted: false,
    reason: 'cost-upper-bound-unknown',
  })
  expect(
    admitOptionalScope({
      ...input,
      requiredBound: { actions: NaN, modelCalls: 0, timeMs: 0 },
      extensionBound: { actions: 1, modelCalls: 1, timeMs: 1 },
    }).admitted,
  ).toBe(false)
})
