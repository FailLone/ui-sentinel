import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { progressHarness } from '../../scripts/validation/r2-progress-replay.ts'
import { productStage, productStageAllows } from './product-stage.ts'

const fixture = JSON.parse(
  readFileSync('evaluation/private/r2-product-acceptance/stage-decision-failures.json', 'utf8'),
)
const row = (id: string) => fixture.rows.find((r: any) => r.row === id)
const registration = (id: string) =>
  row(id).receipts.find((r: any) => r.toolName === 'product_path_register').originalArguments

const decide = (h: ReturnType<typeof progressHarness>, kind: string, fields: any) =>
  h.call('product_path_decide', { decision: { kind, ...fields } })
const query = (h: ReturnType<typeof progressHarness>, tool: string, args: any) =>
  decide(h, 'retrieve', {
    missing: 'Original cited passage required for this draft',
    queries: [{ tool, args }],
  })

describe('original evidence drives structured source decisions', () => {
  it.each(['R1', 'R2', 'R3', 'R4', 'R5'])(
    '%s requires a decision with direct source queries without inventing a plan',
    async (id) => {
      const h = progressHarness(undefined, true)
      const read = row(id).receipts.find((r: any) => r.toolName === 'product_source_read')
      const result = await h.call('product_source_read', read.originalArguments)
      expect(result.text).toBe(read.result.text)
      const before = [...h.progress]
      const status = await h.runtime.status()
      expect(status.stage.phase).toBe('source-located')
      expect(status.stage.allowedTools).toEqual(['product_path_decide'])
      expect(await h.call('product_source_read', read.originalArguments)).toMatchObject({
        dispatched: false,
      })
      expect(status.plan).toBeUndefined()
      expect(h.tools.product_path_gap).toBeUndefined()
      expect(await h.runtime.authorizeTool('page_inspect')).toMatchObject({ dispatched: false })
      const search = await query(h, 'product_source_search', { quote: '暂不可用', offset: 0 })
      expect(search.queryResults[0].result.matches.length).toBeGreaterThan(0)
      expect(
        (await query(h, 'product_source_read', read.originalArguments)).queryResults[0].result.text,
      ).toBe(result.text)
      expect([...h.progress]).toEqual(before)
      expect((await h.runtime.status()).complete).toBe(false)
    },
  )
  it.each(['R1', 'R2'])(
    '%s reuses the original successful plan; registration retires source tools',
    async (id) => {
      const h = progressHarness(undefined, true)
      await h.call('product_source_read', { offset: 0 })
      // R2 used a second issued shorter citation; call the original tool directly.
      for (const receipt of row(id).receipts.filter(
        (r: any) =>
          r.toolName === 'product_source_search' &&
          r.requestSeq <
            row(id).receipts.find((r: any) => r.toolName === 'product_path_register').requestSeq,
      )) {
        await query(h, 'product_source_search', receipt.originalArguments)
      }
      const result = await decide(h, 'draft', { plan: registration(id) })
      expect(result.plan).toBeDefined()
      expect(result.stage).toMatchObject({ phase: 'bind-next-step', step: 0 })
      expect(await h.runtime.authorizeTool('product_source_read')).toMatchObject({
        dispatched: false,
      })
      expect(await h.runtime.authorizeTool('page_inspect')).toBeUndefined()
      expect(await h.runtime.authorizeTool('page_act')).toMatchObject({ dispatched: false })
      expect(await h.runtime.authorizeTool('product_path_register')).toMatchObject({
        dispatched: false,
      })
      const before = [...h.progress]
      const bad = await h.call('product_path_bind', {
        step: 0,
        ref: 'e5',
        resultSelector: '#result',
        preconditionSelectors: [],
      })
      expect(bad.error).toBe('product-precondition-bindings-required')
      expect((await h.runtime.status()).stage.phase).toBe('repair-binding-input')
      expect([...h.progress]).toEqual(before)
      expect(h.events.some((e) => e.type === 'product:bound')).toBe(false)
    },
  )
  it('refuses unrelated action targets even when a stage allows page_act', async () => {
    const h = progressHarness(undefined, true)
    await h.call('product_source_read', { offset: 0 })
    await decide(h, 'draft', { plan: registration('R1') })
    h.events.push({
      id: 'bound',
      seq: 99,
      type: 'product:bound',
      payload: { step: 0, ref: 'e5', itemId: 'original-control' },
      evidenceRefs: [],
    })
    await expect(h.runtime.assertAction('unrelated-control')).rejects.toThrow(
      'product-action-requires-current-bound-step',
    )
  })
  it('malformed retrieval parameters cannot dispatch an action or manufacture progress', async () => {
    const h = progressHarness(undefined, true)
    const result = await h.call('product_source_read', {
      offset: 0,
      tool: 'page_act',
      args: { type: 'click' },
    })
    expect(JSON.stringify(result)).toContain('validation')
    expect(h.progress.size).toBe(0)
    expect(h.events).toEqual([])
    expect(await h.runtime.authorizeTool('page_act')).toMatchObject({ dispatched: false })
  })
  it('bounded read-only sets follow the stage rather than reopening global exploration', () => {
    const before = productStage({
      registration: { phase: 'source-located' },
      execution: { phase: 'registration-required' },
    })
    const after = productStage({
      registration: { phase: 'frozen' },
      execution: { phase: 'bind-next-step', step: 0 },
    })
    expect(before.readOnlyTools).toEqual([
      'product_source_read',
      'product_source_search',
      'tool_result_read',
      'history_read',
    ])
    expect(after.readOnlyTools).toEqual([
      'page_inspect',
      'element_details',
      'page_observe',
      'tool_result_read',
      'history_read',
    ])
    for (const stage of [before, after])
      for (const tool of [
        'product_path_gap',
        'investigation_run',
        'exploration_update',
        'journey_run',
        'rule_check',
      ])
        expect(productStageAllows(stage, tool)).toBe(false)
  })
  it.each(row('R1').contexts as any[])(
    'preserves R1 next-step/original-action continuity at request $seq',
    (context: any) => {
      const stage = productStage(context.productPath)
      const phase = context.productPath.execution.phase
      if (phase === 'act-bound-step') expect(stage.allowedTools).toContain('page_act')
      if (phase === 'bind-next-step') expect(stage.allowedTools).toContain('product_path_bind')
      expect(stage.step).toBe(context.productPath.execution.step)
    },
  )
  it.each(['verify-original-action', 'prerequisite-not-satisfied', 'effect-failed', 'unverified'])(
    '%s cannot bind or replay; direct read-only/report remain possible',
    (phase) => {
      const stage = productStage({
        registration: { phase: 'frozen' },
        execution: { phase, step: 1, actionId: 'original' },
      })
      expect(productStageAllows(stage, 'page_act')).toBe(false)
      expect(productStageAllows(stage, 'product_path_bind')).toBe(false)
      expect(productStageAllows(stage, 'interaction_verify')).toBe(
        phase === 'verify-original-action',
      )
      expect(stage.actionId).toBe('original')
      expect(productStageAllows(stage, 'run_finish')).toBe(true)
    },
  )
})
