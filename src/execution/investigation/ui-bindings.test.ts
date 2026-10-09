import { describe, expect, it } from 'vitest'
import { assertUiProgramBindings, programInput } from './program.ts'

const input = () =>
  programInput.parse({
    version: 1,
    phenomenon: 'Result updates',
    basis: 'Public feedback requirement',
    targets: [
      { name: 'button', selector: 'button' },
      { name: 'result', selector: 'output' },
    ],
    steps: [
      { op: 'measure', name: 'before' },
      { op: 'act', type: 'click', target: 'button' },
      { op: 'measure', name: 'after' },
    ],
    assertions: [
      {
        expectation: 'Feedback is Ready',
        left: { sample: 'after', target: 'result', metric: 'text' },
        operator: 'eq',
        right: { value: 'Ready' },
      },
    ],
  })
describe('UI pre-action result intent', () => {
  it('rejects ambiguous result-only assertions even with an unused before sample', () => {
    expect(() => assertUiProgramBindings(input())).toThrow('ambiguous-result-binding')
  })
  it('accepts explicit result binding and genuine identity-sensitive comparisons', () => {
    const result = input()
    result.targets[1]!.binding = 'post-action'
    result.steps.splice(2, 0, { op: 'bind_results' })
    expect(() => assertUiProgramBindings(programInput.parse(result))).not.toThrow()
    const identity = input()
    identity.assertions[0]!.right = { sample: 'before', target: 'result', metric: 'text' }
    expect(() => assertUiProgramBindings(identity)).not.toThrow()
    const explicit = input()
    explicit.targets[1]!.identityBasis = 'Focus must remain on the original node'
    expect(() => assertUiProgramBindings(explicit)).not.toThrow()
  })
  it('keeps read-only current-state and action-target measurements available', () => {
    const current = input()
    current.steps = [{ op: 'measure', name: 'after' }]
    expect(() => assertUiProgramBindings(current)).not.toThrow()
    const control = input()
    control.assertions[0]!.left.target = 'button'
    expect(() => assertUiProgramBindings(control)).not.toThrow()
  })
})

it('normalizes only optional nulls and still refuses missing required action operands', () => {
  const wire = {
    ...input(),
    targets: input().targets.map((t) => ({ ...t, binding: null, identityBasis: null })),
    steps: [
      { op: 'act', type: 'click', target: 'button', value: null, scrollY: null },
      { op: 'measure', name: 'after' },
    ],
  }
  const parsed = programInput.parse(wire)
  expect(parsed.targets[0]!.binding).toBeUndefined()
  expect(parsed.steps[0]).toMatchObject({ op: 'act', type: 'click', value: undefined })
  for (const action of [
    { op: 'act', type: 'fill', target: 'button', value: null },
    { op: 'act', type: 'scroll', target: null, scrollY: null },
    { op: 'act', type: 'click', target: null },
  ])
    expect(programInput.safeParse({ ...wire, steps: [action, wire.steps[1]] }).success).toBe(false)
  expect(
    programInput.safeParse({ ...wire, steps: [...Array(4).fill(wire.steps[0]), wire.steps[1]] })
      .success,
  ).toBe(false)
})

it.each([
  { op: 'act', type: 'click', target: 'button', value: 'unused' },
  { op: 'act', type: 'fill', target: 'button', value: '', scrollY: 500 },
  { op: 'act', type: 'scroll', target: 'button', scrollY: 500 },
])('rejects invalid nested action operands before any program execution: %j', (action) => {
  const result = programInput.safeParse({
    ...input(),
    steps: [action, { op: 'measure', name: 'after' }],
  })
  expect(result.success).toBe(false)
  if (!result.success)
    expect(result.error.issues.some((i) => i.path[0] === 'steps' && i.path[1] === 0)).toBe(true)
})
