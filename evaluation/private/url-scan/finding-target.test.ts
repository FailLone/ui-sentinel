import { it, expect } from 'vitest'
import { verifiesSortFinding } from './finding-target.ts'
it('requires independent node identity and the same measured assertion, not a selector substring', () => {
  const selector = 'html > body > ul > li:nth-of-type(1)'
  const receipt = {
    verdict: 'fail',
    program: { targets: [{ name: 'first', selector }] },
    samples: { after: { first: { text: '20 · Blue widget' } } },
    assertions: [
      {
        verdict: 'fail',
        operator: 'eq',
        left: { sample: 'after', target: 'first', metric: 'text' },
        right: { value: '5 · Amber gadget' },
        actualLeft: '20 · Blue widget',
        actualRight: '5 · Amber gadget',
      },
    ],
  }
  expect(verifiesSortFinding(receipt, [selector])).toBe(true)
  expect(verifiesSortFinding(receipt, [])).toBe(false)
  expect(verifiesSortFinding({ ...receipt, samples: {} }, [selector])).toBe(false)
  expect(verifiesSortFinding({ ...receipt, verdict: 'unknown' }, [selector])).toBe(false)
  receipt.program.targets[0]!.selector = '#rows + p'
  expect(verifiesSortFinding(receipt, [selector])).toBe(false)
})

it('accepts inline measurements only for independently located result nodes and exact actual values', () => {
  const receipt = {
    outcome: 'failed',
    input: { selector: '.price', condition: 'numeric-ascending' },
    binding: { mode: 'post-action-current', selector: '.price' },
    measured: { supported: true, count: 3, values: ['20', '5', '12'] },
  }
  expect(verifiesSortFinding(receipt, [], ['.price'])).toBe(true)
  expect(verifiesSortFinding(receipt, ['.price'], [])).toBe(false)
  expect(verifiesSortFinding({ ...receipt, outcome: 'unverified' }, [], ['.price'])).toBe(false)
  expect(
    verifiesSortFinding(
      { ...receipt, measured: { ...receipt.measured, values: ['5', '12', '20'] } },
      [],
      ['.price'],
    ),
  ).toBe(false)
  expect(
    verifiesSortFinding(
      { ...receipt, measured: { ...receipt.measured, supported: false } },
      [],
      ['.price'],
    ),
  ).toBe(false)
  expect(
    verifiesSortFinding(
      { ...receipt, input: { ...receipt.input, selector: '#other' } },
      [],
      ['.price'],
    ),
  ).toBe(false)
})
