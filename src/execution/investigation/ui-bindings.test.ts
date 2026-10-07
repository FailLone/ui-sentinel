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
