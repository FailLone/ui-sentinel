import { it, expect } from 'vitest'
import { createTool } from '@mastra/core/tools'
import { actionInput, actionInputValidationError } from './action-input.ts'
import { createToolContractRepair } from './tool-contract-repair.ts'

it.each([
  [{ type: 'navigate', url: null, ref: 'e25', role: 'link', name: 'About' }, 'url'],
  [{ type: 'navigate', url: '/info' }, 'url'],
  [{ type: 'navigate', url: 'javascript:alert(1)' }, 'url'],
  [{ type: 'click' }, 'ref'],
  [{ type: 'probe' }, 'ref'],
  [{ type: 'fill', selector: 'input', value: null }, 'value'],
  [{ type: 'scroll', scrollY: null }, 'scrollY'],
  [{ type: 'click', role: 'button' }, 'name'],
  [{ type: 'click', name: 'Open' }, 'role'],
  [{ type: 'click', selector: '#open', nth: 0 }, 'nth'],
  [{ type: 'click', selector: '#open', role: 'button', name: 'Open' }, 'selector'],
  [{ type: 'click', ref: ' ' }, 'ref'],
  [{ type: 'fill', selector: 'input', value: '', url: 'https://example.org' }, 'url'],
  [{ type: 'click', selector: '#open', value: 'ignored' }, 'value'],
  [{ type: 'scroll', scrollY: 500, selector: '#open' }, 'selector'],
  [{ type: 'scroll', scrollY: Infinity }, 'scrollY'],
  [{ type: 'scroll', scrollY: 1001 }, 'scrollY'],
  [{ type: 'navigate', url: 'https://example.org', ref: 'e1' }, 'ref'],
  [
    {
      type: 'probe',
      ref: 'e1',
      verify: { selector: 'h1', condition: 'visible', basis: 'public heading' },
    },
    'verify',
  ],
] as const)('SDK rejects invalid action %j before execute, naming %s', async (input, field) => {
  let executions = 0
  const tool = createTool({
    id: 'page.act',
    description: 'Explicit action contract',
    inputSchema: actionInput,
    execute: async () => {
      executions++
      return { status: 'completed' }
    },
  })
  const result = (await tool.execute!(input as any, {} as any)) as any
  expect(executions).toBe(0)
  expect(result.error).toBe(true)
  expect(result.validationErrors).toBeTruthy()
  expect(result.message).toContain(field)
  const repair = createToolContractRepair()
  repair.observe([{ payload: { toolName: 'page_act', result } }])
  expect(repair.take()?.allowance).toBe('one-model-turn')
  repair.observe([{ payload: { toolName: 'page_act', result } }])
  expect(repair.take()).toBeUndefined()
})

it.each([
  { type: 'navigate', url: 'https://example.org/info', ref: null, role: null, name: null },
  { type: 'click', ref: 'e1' },
  { type: 'click', ref: 'e1', role: 'button', name: 'Open', nth: 0 },
  { type: 'click', ref: 'e1', selector: '#open' },
  { type: 'probe', visualDescription: 'Public Open button' },
  { type: 'fill', selector: 'input', value: '' },
  { type: 'fill', ref: 'e1', value: '   ' },
  { type: 'scroll', scrollY: 0 },
  { type: 'scroll', scrollY: -1000 },
])('accepts explicit valid action %j without guessing or changing its type', async (input) => {
  let actual: unknown
  const tool = createTool({
    id: 'page.act',
    description: 'Explicit action contract',
    inputSchema: actionInput,
    execute: async (value) => {
      actual = value
      return { status: 'completed' }
    },
  })
  await tool.execute!(input as any, {} as any)
  expect(actual).toMatchObject(
    Object.fromEntries(Object.entries(input).filter(([, v]) => v !== null)),
  )
})

it('guards internal callers and refuses a business ref-only target without a browser lookup', () => {
  expect(
    actionInputValidationError({ type: 'fill', selector: 'input' }, { allowRefOnly: true }),
  ).toMatchObject({ error: true, dispatched: false })
  expect(
    actionInputValidationError({ type: 'click', ref: 'e1' }, { allowRefOnly: false })?.message,
  ).toContain('ref alone')
  expect(
    actionInputValidationError(
      { type: 'fill', selector: 'input', value: '' },
      { allowRefOnly: false },
    ),
  ).toBeUndefined()
})
