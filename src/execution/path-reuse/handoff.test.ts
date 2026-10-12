import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { progressHarness } from '../../../evaluation/support/product-sources/progress.ts'
import { productContinuation } from '../../inspection/product-continuation.ts'
import { productStage } from '../../inspection/product-stage.ts'
const captured = JSON.parse(
  readFileSync('evaluation/fixtures/path-handoff/public-handoff.json', 'utf8'),
)
const sourceInput = {
  title: captured.source.title,
  version: captured.source.version,
  markdown: captured.source.markdown,
}
const event = (readOnly = true) => ({
  id: 'handoff',
  seq: 1000,
  type: 'path-reuse:finished',
  payload: { ...captured.handoff, readOnly },
  evidenceRefs: [],
})
async function harness(readOnly = true) {
  const h = progressHarness(sourceInput, true)
  await h.runtime.installReusablePlan(captured.plan)
  h.events.push(event(readOnly))
  return h
}
it('overrides the captured bind directive without rewriting completed and pending facts', () => {
  const report = {
    plan: captured.plan,
    steps: captured.plan.steps.map((step: any, i: number) => ({
      ...step,
      ...captured.handoff.steps[i],
    })),
    issues: [],
  } as any
  const execution = productContinuation(report, [event()] as any)
  expect(execution.phase).toBe('reuse-read-only')
  expect(
    productContinuation({ ...report, issues: ['unresolved-proof'] }, [event()] as any).phase,
  ).toBe('reuse-read-only')
  expect(execution.completedSteps).toEqual([0])
  expect(execution.nextAction).toContain('run_finish')
  const stage = productStage({ registration: { phase: 'frozen' }, execution })
  expect(stage.decisionRequired).toBe(false)
  expect(stage.allowedTools).toContain('run_finish')
  for (const tool of [
    'product_path_bind',
    'product_path_decide',
    'product_path_register',
    'page_act',
    'findings_submit',
  ])
    expect(stage.allowedTools).not.toContain(tool)
})
it('rejects direct and batched binding/plan/action calls before state changes', async () => {
  const h = await harness()
  const before = JSON.stringify(h.events),
    progress = [...h.progress]
  const args = {
    step: 1,
    ref: 'e39',
    resultSelector: '#details-state',
    preconditionSelectors: ['#preview-state'],
  }
  const denied = await h.call('product_path_bind', args)
  expect(denied).toMatchObject({ dispatched: false })
  const results = await Promise.all([
    h.call('product_path_bind', { ...args, ref: 'e40' }),
    h.call('product_path_decide', {
      decision: { kind: 'unsupported', reason: 'replace', unchecked: ['details'] },
    }),
    h.runtime.authorizeTool('page_act'),
  ])
  for (const result of results) expect(result).toMatchObject({ dispatched: false })
  expect(JSON.stringify(h.events)).toBe(before)
  expect([...h.progress]).toEqual(progress)
  expect(await h.runtime.authorizeTool('run_finish')).toBeUndefined()
  expect((await h.runtime.status()).registration.nextAction).toContain('run_finish')
  await expect(h.runtime.assertAction(undefined)).rejects.toThrow('product-reuse-read-only')
})
it('does not lock ordinary source workflow on a pre-install source mismatch', async () => {
  const h = progressHarness(sourceInput, true)
  h.events.push(event(false))
  expect((await h.runtime.status()).stage.phase).toBe('need-source')
  await h.call('product_source_read', { offset: 0 })
  expect((await h.runtime.status()).stage.decisionRequired).toBe(true)
  expect(await h.runtime.authorizeTool('product_path_decide')).toBeUndefined()
  const installed = await harness(false)
  expect((await installed.runtime.status()).stage.phase).toBe('bind-next-step')
  expect(await installed.runtime.authorizeTool('product_path_bind')).toBeUndefined()
})
