import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { progressHarness } from '../../scripts/validation/r2-progress-replay.ts'
import { productStage, productStageAllows } from './product-stage.ts'
import { extractToolSummary } from '../agent/context/compact-history.ts'

const fixture = JSON.parse(
  readFileSync('evaluation/private/r2-product-acceptance/stage-decision-failures.json', 'utf8'),
)
const row = (id: string) => fixture.rows.find((r: any) => r.row === id)
const registration = (id: string) =>
  row(id).receipts.find((r: any) => r.toolName === 'product_path_register').originalArguments

describe('fifth-batch evidence drives stage decisions', () => {
  it.each(['R1', 'R2', 'R3', 'R4', 'R5'])(
    '%s exposes registration or explicit gap after returned source, without inventing a plan',
    async (id) => {
      const h = progressHarness(undefined, true)
      const read = row(id).receipts.find((r: any) => r.toolName === 'product_source_read')
      const result = await h.call('product_source_read', read.originalArguments)
      expect(result.text).toBe(read.result.text)
      const before = [...h.progress]
      const status = await h.runtime.status()
      expect(status.stage.phase).toBe('source-located')
      expect(status.stage.allowedTools).toContain('product_path_register')
      expect(status.plan).toBeUndefined()
      expect(await h.call('product_source_read', read.originalArguments)).toMatchObject({
        error: 'product-stage-tool-not-allowed',
        dispatched: false,
      })
      const gap = await h.call('product_path_gap', {
        question: 'Which exact passage specifies the unavailable-state boundary?',
        tool: 'product_source_search',
      })
      expect(extractToolSummary({ tool: 'product_path_gap', result: gap })).toMatchObject({
        stage: gap.stage,
      })
      expect(await h.runtime.authorizeTool('page_inspect')).toMatchObject({ dispatched: false })
      const search = await h.call('product_source_search', { quote: '暂不可用', offset: 0 })
      expect(search.matches.length).toBeGreaterThan(0)
      expect((await h.runtime.status()).stage.retrieval).toBeUndefined()
      expect(await h.call('product_source_search', { quote: '暂不可用', offset: 0 })).toMatchObject(
        { dispatched: false },
      )
      expect([...h.progress]).toEqual(before)
      expect((await h.runtime.status()).complete).toBe(false)
    },
  )
  it.each(['R1', 'R2'])(
    '%s reuses the original successful plan; registration invalidates an unused gap',
    async (id) => {
      const h = progressHarness(undefined, true)
      await h.call('product_source_read', { offset: 0 })
      // R2 used a second issued shorter citation. Reproduce this actual reference issuance through a gap.
      for (const receipt of row(id).receipts.filter(
        (r: any) =>
          r.toolName === 'product_source_search' &&
          r.requestSeq <
            row(id).receipts.find((r: any) => r.toolName === 'product_path_register').requestSeq,
      )) {
        await h.call('product_path_gap', {
          question: 'Need the shorter original citation used by this recorded plan.',
          tool: 'product_source_search',
        })
        await h.call('product_source_search', receipt.originalArguments)
      }
      await h.call('product_path_gap', {
        question: 'Need to locate a missing source passage before deciding.',
        tool: 'product_source_read',
      })
      const result = await h.call('product_path_register', registration(id))
      expect(result.plan).toBeDefined()
      expect(result.stage).toMatchObject({ phase: 'bind-next-step', step: 0 })
      expect(result.stage.retrieval).toBeUndefined()
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
    await h.call('product_path_register', registration('R1'))
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
  it('does not offer action tools as information-gap grants', async () => {
    const h = progressHarness(undefined, true)
    const result = await h.call('product_path_gap', {
      question: 'Click to learn what this control does.',
      tool: 'page_act',
    })
    expect(JSON.stringify(result)).toContain('validation')
    expect((await h.runtime.status()).stage.retrieval).toBeUndefined()
    expect(h.events).toEqual([])
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
    '%s cannot bind or replay; gap/report remain possible',
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
