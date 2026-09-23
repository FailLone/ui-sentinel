import { describe, expect, it } from 'vitest'
import {
  investigationDigest,
  withInvestigationDigest,
} from '../../scripts/experiments/decision-contract.ts'

describe('experimental investigation digest', () => {
  it('preserves original facts, tools, unresolved hypotheses and model configuration', () => {
    const input = {
      inspection: { snapshotId: 's2' },
      task: { hypotheses: [{ id: 'h1', status: 'open' }] },
      finishReadiness: { applicableGaps: ['hypothesis:h1:open'] },
      businessOutcomeObserved: { response: { canRetry: true }, writePolicy: { maxOrders: 1 } },
      observation: { elements: [{ ref: 'e2', tag: 'button', enabled: false, text: 'Try again' }] },
    }
    const body = {
      messages: [{ role: 'user', content: JSON.stringify(input) }],
      tools: ['unchanged'],
      reasoning: { effort: 'low' },
    }
    const before = structuredClone(body)
    const output = withInvestigationDigest(body)
    const { investigationDigest: digest, ...facts } = JSON.parse(output.messages[0].content)
    expect(body).toEqual(before)
    expect(facts).toEqual(input)
    expect(output.tools).toEqual(body.tools)
    expect(output.reasoning).toEqual(body.reasoning)
    expect(digest.hypotheses).toEqual(input.task.hypotheses)
    expect(digest.gaps).toEqual(['hypothesis:h1:open'])
    expect(digest.currentTargets[0].enabled).toBe(false)
    expect(digest).not.toHaveProperty('canFinish')
  })

  it('does not reuse stale detail or infer pixel occlusion from a pointer error', () => {
    const digest = investigationDigest({
      inspection: { snapshotId: 's2' },
      observation: { elements: [{ ref: 'e2', tag: 'button' }] },
      history: [
        {
          tools: [
            {
              tool: 'element_details',
              results: [{ ref: 'e1' }, { ref: 'e2', snapshotId: 's1' }, { ref: 'e2', stale: true }],
            },
            {
              tool: 'page_act',
              error:
                '\u001b[2m <div> intercepts pointer events\u001b[22m\n <div> intercepts pointer events\n waiting 500ms',
            },
          ],
        },
      ],
    })
    expect(digest.historicalReceipts[0].details).toEqual([])
    expect(digest.historicalReceipts[1].error).toBe('<div> intercepts pointer events')
    expect(JSON.stringify(digest)).not.toContain('occlusion')
  })

  it('bounds UTF-8 bytes, marks omissions, and retains the original read path', () => {
    const input = {
      observation: {
        elements: Array.from({ length: 100 }, (_, i) => ({
          ref: `e${i}`,
          tag: 'button',
          text: '长'.repeat(1000),
        })),
      },
    }
    const digest = investigationDigest(input)
    expect(Buffer.byteLength(JSON.stringify(digest))).toBeLessThanOrEqual(6000)
    expect(digest.omitted).toContain('currentTargets')
    expect(input.observation.elements).toHaveLength(100)
  })
})
