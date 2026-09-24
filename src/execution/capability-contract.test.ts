import { expect, it } from 'vitest'
import { withCapabilityContract } from '../../scripts/experiments/capability-contract.ts'

function request(input: any) {
  return {
    messages: [
      { role: 'system', content: 'Preserve safety and task requirements.' },
      { role: 'user', content: JSON.stringify(input) },
    ],
    tools: [
      'page_act',
      'hypotheses_record',
      'transition_observe',
      'findings_submit',
      'journey_run',
      'rule_check',
      'element_details',
      'rules_search',
      'run_finish',
    ].map((name) => ({
      type: 'function',
      function: {
        name,
        parameters: {
          properties: {
            hypothesisId: { type: 'string' },
            refs: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    })),
  }
}
const inputOf = (body: any) => JSON.parse(body.messages.find((m: any) => m.role === 'user').content)

it('keeps novel exploration and retrieval; does not turn an empty queue into permission to finish', () => {
  const source = request({
    phase: 'exploring',
    availableJourneys: [],
    task: { hypotheses: [] },
    observation: { elements: [{ ref: 'widget-9' }] },
    pendingKnownRuleChecks: 0,
  })
  const before = JSON.stringify(source)
  const result = withCapabilityContract(source)
  expect(JSON.stringify(source)).toBe(before)
  expect(result.messages[0]).toEqual(source.messages[0])
  const input = inputOf(result)
  expect(input.activeTools).toContain('hypotheses_record')
  expect(input.activeTools).toContain('rules_search')
  expect(input.activeTools).not.toContain('journey_run')
  expect(input.activeTools).not.toContain('findings_submit')
  expect(input.decisionContract).not.toHaveProperty('shouldFinish')
  expect(input.observation).toEqual(inputOf(source).observation)
  expect(
    result.tools.find((t: any) => t.function.name === 'element_details').function.parameters
      .properties.refs.items.enum,
  ).toEqual(['widget-9'])
})

it('indexes measurements only for their owning hypothesis, without treating visibility as operability', () => {
  const result = withCapabilityContract(
    request({
      phase: 'verifying',
      availableJourneys: [{ id: 'route-a' }],
      task: {
        hypotheses: [
          { id: 'question-a', status: 'open', applicability: 'triggered' },
          { id: 'question-b', status: 'open', applicability: 'triggered' },
        ],
      },
      latestToolResults: {
        tools: [
          {
            tool: 'transition_observe',
            args: { hypothesisId: 'question-a' },
            condition: 'element-visible',
            evidenceStatus: 'complete',
            sampleSummary: { values: [true] },
            evidenceRefs: ['proof-a'],
          },
        ],
      },
    }),
  )
  const input = inputOf(result)
  expect(input.decisionContract.investigations[0].stage).toBe(
    'measurement-recorded-interpret-against-hypothesis',
  )
  expect(input.decisionContract.investigations[0].measurements[0].condition).toBe('element-visible')
  expect(input.decisionContract.investigations[1].measurements).toEqual([])
  expect(input.activeTools).toContain('transition_observe')
  expect(input.activeTools).toContain('journey_run')
  expect(
    result.tools.find((t: any) => t.function.name === 'findings_submit').function.parameters
      .properties.hypothesisId.enum,
  ).toEqual(['question-a', 'question-b'])
})

it('hides phase-forbidden tools but preserves unresolved verification and honest finish options', () => {
  const result = withCapabilityContract(
    request({
      phase: 'finalizing',
      task: { hypotheses: [{ id: 'h', status: 'inconclusive', applicability: 'triggered' }] },
    }),
  )
  const input = inputOf(result)
  expect(input.activeTools).not.toContain('page_act')
  expect(input.activeTools).not.toContain('hypotheses_record')
  expect(input.activeTools).toContain('transition_observe')
  expect(input.activeTools).toContain('findings_submit')
  expect(input.activeTools).toContain('run_finish')
  expect(input.decisionContract.investigations[0].stage).toBe(
    'no-complete-measurement-in-delivered-context',
  )
})

it('does not offer resolved or untriggered IDs for submission or measurement', () => {
  const result = withCapabilityContract(
    request({
      phase: 'verifying',
      task: {
        hypotheses: [
          { id: 'done', status: 'supported', applicability: 'triggered' },
          { id: 'unused', status: 'open', applicability: 'not-triggered' },
        ],
      },
    }),
  )
  const input = inputOf(result)
  expect(input.activeTools).not.toContain('findings_submit')
  expect(input.activeTools).not.toContain('transition_observe')
  expect(input.activeTools).toContain('hypotheses_record')
  expect(input.decisionContract.investigations[0].stage).toBe('resolved')
})
