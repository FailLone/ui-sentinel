/** Original-input SDK replay; the test author, never the model, chooses subsequent calls. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { standardSchemaToJSONSchema } from '@mastra/core/schema'
import assert from 'node:assert/strict'
import { createProductPath } from '../../src/execution/product-path.ts'
import { freezeProductSource } from '../../src/inspection/product-source.ts'
import { productPathSkill } from '../../src/agent/skills/product-path.ts'
import { productSource } from '../r2-product-acceptance/policy.ts'
export const progressFailures = JSON.parse(
  readFileSync('evaluation/private/r2-product-acceptance/progress-feedback-failures.json', 'utf8'),
)
export const progressRow = (id: string): any => progressFailures.rows.find((r: any) => r.row === id)
export function progressHarness(input = productSource()) {
  const source = freezeProductSource(input),
    events: any[] = [],
    progress = new Set<string>()
  const target = { itemId: 'original-control', status: 'pending', selected: true }
  const runtime = createProductPath({
    source,
    progress: (key) => {
      progress.add(key)
    },
    inspection: {
      scope: { createItem: () => ({ itemId: 'source' }), snapshot: () => ({ items: [target] }) },
      candidateItems: () => [{ ...target, ref: 'e5', category: 'local-interaction' }],
      flush: async () => {},
    } as any,
    page: () => ({ url: () => 'http://127.0.0.1' }) as any,
    guard: () => {},
    events: async () => events,
    emit: async (type, payload, evidenceRefs = []) => {
      const e = { id: `e${events.length}`, seq: events.length + 1, type, payload, evidenceRefs }
      events.push(e)
      return e as any
    },
    save: async () => 'test-plan.json',
    selector: async () => '#preview',
    remaining: () => ({ actions: 8, modelCalls: 20, timeMs: 180000 }),
    clean: () => true,
  })
  const tools: any = runtime.tools(async (_, fn) => fn())
  return {
    source,
    events,
    progress,
    runtime,
    tools,
    call: (name: string, args: any) => tools[name].execute(args, {}),
    schema: (name: string) => standardSchemaToJSONSchema(tools[name].inputSchema, { io: 'input' }),
  }
}
export async function replayProgressFeedback() {
  const rows = []
  for (const id of ['R1', 'R5']) {
    const original = progressRow(id),
      h = progressHarness(),
      states = []
    for (const call of original.sourceCalls) {
      const result = await h.call(call.toolName, call.originalArguments)
      const after = await h.runtime.status()
      assert.equal(after.plan, undefined)
      assert.equal(after.complete, false)
      states.push({
        originalRequest: call.requestSeq,
        originalReceipt: call.result,
        result,
        registration: after.registration,
        progressKeys: [...h.progress],
      })
    }
    assert.equal(h.progress.size, 2) // overview + one covered window, including repeated searches
    rows.push({
      row: id,
      originalContexts: original.contexts.map((c: any) => ({
        seq: c.seq,
        productPath: c.productPath,
        budgetRemaining: c.budgetRemaining,
      })),
      states,
    })
  }
  for (const id of ['R6', 'R2']) {
    const original = progressRow(id),
      h = progressHarness()
    await h.call('product_source_read', { offset: 0 })
    const registered = await h.call(
      'product_path_register',
      original.registrations[0].originalArguments,
    )
    assert.ok(registered.plan)
    const before = [...h.progress]
    const result = await h.call('product_path_bind', original.bindings[0].originalArguments)
    assert.equal(result.error, 'product-precondition-bindings-required')
    assert.equal(result.execution.phase, 'repair-binding-input')
    assert.deepEqual([...h.progress], before)
    assert.equal(h.events.filter((e) => e.type === 'product:bound').length, 0)
    rows.push({
      row: id,
      originalInput: original.bindings[0].originalArguments,
      before: original.bindings[0].result,
      after: result,
      status: await h.runtime.status(),
      events: h.events,
      progressUnchangedByRejection: true,
    })
  }
  return {
    paidCalls: 0,
    actualSdkBoundary: true,
    browserMeasurements: false,
    limitation:
      'Local host substitutes inspection/persistence for SDK feedback replay; real binding and measurement are tested separately through the browser.',
    wireSchema: progressHarness().schema('product_path_register'),
    skill: productPathSkill,
    rows,
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve('data/r2-product-acceptance/progress-feedback-free-20261011')
  mkdirSync(root, { recursive: true })
  writeFileSync(
    resolve(root, 'sdk-replay.json'),
    JSON.stringify(await replayProgressFeedback(), null, 2) + '\n',
    { flag: 'wx' },
  )
  console.log('SDK original-input feedback replay passed; paid calls 0')
}

/** Fixed local response generator; no live model and no inferred model success. */
export function progressReply(mode: string, turn: number, packet: any) {
  const row = progressRow(mode === 'feedback-defect' ? 'R2' : 'R6')
  let name = 'run_finish',
    args: any = { reason: 'unverified-scope' }
  const execution = packet.productPath.execution
  const bind = (step: number, incomplete = false) => {
    const elements =
      packet.latestToolResults.tools.find((t: any) => t.tool === 'page_inspect')?.elements ??
      packet.history
        .flatMap((h: any) => h.tools ?? [])
        .filter((t: any) => t.tool === 'page_inspect')
        .at(-1)?.elements
    assert.ok(elements, 'author replay needs previously returned DOM evidence')
    const slot = (label: string) => {
      const section = elements.filter((e: any) => e.tag === 'section' && e.ariaLabel === label)
      assert.equal(section.length, 1)
      const values = elements.filter(
        (e: any) => e.tag === 'p' && e.selector.startsWith(section[0].selector + ' > '),
      )
      assert.equal(values.length, 1)
      return values[0].selector
    }
    const targetName = row.registrations[0].originalArguments.steps[step].targetName
    const candidate = packet.inspectionScope.candidates.find((c: any) =>
      c.description.includes(targetName),
    )
    assert.ok(candidate)
    name = 'product_path_bind'
    args = {
      step,
      ref: candidate.ref,
      resultSelector: slot(step === 0 ? '预览状态' : '详情状态'),
      preconditionSelectors: step === 0 ? [slot('目录可用状态')] : [slot('预览状态')],
    }
    if (mode !== 'feedback-defect')
      args.preconditionSelectors.push(slot(step === 0 ? '预览状态' : '详情状态'))
    if (incomplete) args = { ...row.bindings[0].originalArguments, ref: candidate.ref }
  }
  if (turn === 0) {
    name = 'product_source_read'
    args = { offset: 0 }
  } else if (turn === 1) {
    name = 'product_path_register'
    args = row.registrations[0].originalArguments
  } else if (turn === 2 || (turn === 6 && mode !== 'feedback-unavailable-enabled')) {
    if (turn === 6) {
      assert.deepEqual(execution.completedSteps, [0])
      assert.equal(execution.step, 1)
    }
    name = 'page_inspect'
    args = { selector: 'main section, main section p, main button', offset: 0 }
  } else if (turn === 3) bind(0, true)
  else if (turn === 4) {
    assert.equal(execution.phase, 'repair-binding-input')
    assert.equal(execution.diagnostics.expectedCount, mode === 'feedback-defect' ? 1 : 2)
    assert.equal(execution.diagnostics.receivedCount, mode === 'feedback-defect' ? 0 : 1)
    // Prior DOM is copied below by the harness, not guessed from the original fixture.
    bind(0)
  } else if (mode === 'feedback-unavailable-enabled') {
    assert.equal(execution.phase, 'prerequisite-not-satisfied')
    if (turn === 5) {
      name = 'page_act'
      args = { type: 'click', role: 'button', name: '预览目录' }
    }
  } else if (turn === 5 || turn === 8) {
    assert.equal(execution.phase, 'act-bound-step')
    name = 'page_act'
    args = { type: 'click', ref: execution.ref }
  } else if (turn === 7) bind(1)
  return { name, args, additionalCalls: [] }
}
