import assert from 'node:assert/strict'
import { policy } from './policy.ts'
export function freeResponse(body: any, row: string, seq: number) {
  const packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  const offered = body.tools.map((t: any) => t.function.name)
  let calls: { name: string; args: any }[] = [
    { name: 'run_finish', args: { reason: 'unverified-scope' } },
  ]
  if (row.startsWith('handoff')) {
    assert.equal(packet.pathReuse.readOnly, true)
    assert.equal(packet.productPath.stage.phase, 'reuse-read-only')
    assert.equal(packet.productPath.execution.phase, 'reuse-read-only')
    assert.equal(packet.productPath.stage.decisionRequired, false)
    assert.equal(body.tool_choice, 'required')
    assert.equal(packet.productPath.nextAction, undefined)
    assert.ok(packet.productPath.registration.nextAction.includes('run_finish'))
    for (const name of [
      'product_path_bind',
      'product_path_register',
      'product_path_decide',
      'page_act',
      'findings_submit',
    ]) {
      assert.ok(!offered.includes(name))
      assert.ok(!packet.activeTools.includes(name))
    }
    assert.ok(offered.includes('run_finish'))
    assert.equal(packet.productPath.steps[0].state, 'verified')
    assert.equal(packet.productPath.steps[1].state, 'unverified')
    assert.deepEqual(packet.pathReuse.remainingSteps, [1])
    if (row === 'handoff-denied-batch' && seq === 1) {
      const refs = packet.observation.elements
        .filter((e: any) => e.text === '查看详情')
        .map((e: any) => e.ref)
      calls = refs.map((ref: string) => ({
        name: 'product_path_bind',
        args: {
          step: 1,
          ref,
          resultSelector: '#details-state',
          preconditionSelectors: ['#preview-state'],
        },
      }))
      calls.push(
        { name: 'page_act', args: { type: 'click', ref: refs[0] } },
        {
          name: 'product_path_decide',
          args: {
            decision: { kind: 'unsupported', reason: 'replace plan', unchecked: ['details'] },
          },
        },
        { name: 'run_finish', args: { reason: 'scope-covered' } },
      )
    }
    if (seq > 2) throw Error('unexpected-free-handoff-loop')
  } else if (row === 'source-mismatch') {
    assert.equal(packet.pathReuse.readOnly, false)
    if (seq === 1) {
      assert.equal(packet.productPath.stage.phase, 'need-source')
      calls = [{ name: 'product_source_read', args: { offset: 0 } }]
    } else if (seq === 2) {
      assert.equal(packet.productPath.stage.decisionRequired, true)
      calls = [
        {
          name: 'product_path_decide',
          args: {
            decision: {
              kind: 'unsupported',
              reason: 'Free source-mismatch probe: no new path attempted',
              unchecked: ['new source path'],
            },
          },
        },
      ]
    } else if (seq > 3) throw Error('unexpected-free-source-loop')
  } else throw Error('zero-model-row-requested-model')
  const common = {
    id: `free-${row}-${seq}`,
    model: policy.model,
    provider: policy.provider,
    object: 'chat.completion.chunk',
    created: 1,
  }
  return new Response(
    `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: calls.map((c, i) => ({ index: i, id: `free-${seq}-${i}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 } })}\n\ndata: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
