/** Free wiring author only; never imported in paid mode. */
import { freezeProductSource } from '../../src/inspection/product-source.ts'
import { publicInput, policy } from './policy.ts'
export function freeResponse(body: any, row: string, seq: number, failAuthor: boolean) {
  const packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  let name = 'run_finish',
    args: any = { reason: 'unverified-scope' }
  if (row === 'author' && !failAuthor) {
    const source = freezeProductSource(publicInput('http://127.0.0.1').productSource)
    const quote = (needle: string) => {
      const quote = source.markdown.split('\n\n').find((p) => p.includes(needle))!
      const start = source.markdown.indexOf(quote)
      return { start, end: start + quote.length, quote }
    }
    const state = packet.productPath
    if (state.stage.phase === 'need-source') {
      name = 'product_source_read'
      args = { offset: 0 }
    } else if (state.stage.decisionRequired) {
      name = 'product_path_decide'
      args = {
        decision: {
          kind: 'draft',
          plan: {
            sourceId: source.sourceId,
            contentHash: source.contentHash,
            title: '访客目录路径',
            rationale: '验证来源明确的匿名预览到详情路径',
            unchecked: ['登录收藏、跨设备同步及其他范围未检查'],
            assumptions: [],
            steps: [0, 1].map((i) => ({
              title: ['预览目录', '查看详情'][i],
              targetName: ['预览目录', '查看详情'][i],
              citation: quote(i === 0 ? '访客点击“预览目录”' : '只有预览状态'),
              certainty: 'explicit',
              action: 'click',
              timing: 'action-complete',
              expectation: { condition: 'text-equals', expected: ['预览就绪', '详情已就绪'][i] },
              preconditions: [
                {
                  description: i === 0 ? '目录可用' : '预览就绪',
                  citation: quote(i === 0 ? '预览的前置条件' : '只有预览状态'),
                  expectation: { condition: 'text-equals', expected: ['可用', '预览就绪'][i] },
                },
              ],
              review: { preconditionsComplete: true, predicatesDistinguishStates: true },
            })),
          },
        },
      }
    } else if (state.stage.phase === 'act-bound-step') {
      name = 'page_act'
      args = state.nextAction.args
    } else if (['bind-next-step', 'inspect-binding'].includes(state.stage.phase)) {
      const i = state.stage.step,
        candidate = packet.inspectionScope.candidates.find((c: any) =>
          c.description.includes(['预览目录', '查看详情'][i]),
        )
      if (!candidate) throw Error('free-control-missing')
      name = 'product_path_bind'
      args = {
        step: i,
        ref: candidate.ref,
        resultSelector: ['#preview-state', '#details-state'][i],
        preconditionSelectors: [['#availability', '#preview-state'][i]],
      }
    } else args = { reason: 'scope-covered' }
  } else if (row === 'handoff' && seq === 1) {
    name = 'page_inspect'
    args = { selector: 'button', offset: 0 }
  } else if (row !== 'author' && row !== 'handoff') throw Error('zero-model-reuse-requested-model')
  const common = {
    id: `free-${row}-${seq}`,
    model: policy.model,
    provider: policy.provider,
    object: 'chat.completion.chunk',
    created: 1,
  }
  return new Response(
    `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ index: 0, id: `free-${seq}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 } })}\n\ndata: [DONE]\n\n`,
    { headers: { 'content-type': 'text/event-stream' } },
  )
}
