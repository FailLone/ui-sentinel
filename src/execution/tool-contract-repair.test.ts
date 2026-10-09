import { it, expect } from 'vitest'
import { createToolContractRepair } from './tool-contract-repair.ts'
it('offers only one repair for an actual latest input-validation error', () => {
  const repair = createToolContractRepair()
  repair.observe([
    { payload: { toolName: 'page_inspect', result: { error: true, message: 'page failure' } } },
  ])
  expect(repair.take()).toBeUndefined()
  const invalid = [
    {
      payload: {
        toolName: 'investigation_run',
        result: {
          error: true,
          message: 'invalid input',
          validationErrors: { errors: ['invalid'] },
        },
      },
    },
  ]
  repair.observe(invalid)
  repair.observe([])
  expect(repair.take()).toBeUndefined()
  repair.observe(invalid)
  expect(repair.take()?.allowance).toBe('one-model-turn')
  repair.observe(invalid)
  expect(repair.take()).toBeUndefined()
})
