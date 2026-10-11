import { describe, it, expect } from 'vitest'
import { progressHarness, progressRow } from '../../scripts/validation/r2-progress-replay.ts'
import { productBindingInputDiagnostics, productContinuation } from './product-continuation.ts'
import { extractToolSummary } from '../agent/context/compact-history.ts'
import { productPathSkill } from '../agent/skills/product-path.ts'

describe('original trace feedback through actual SDK tools', () => {
  it.each(['R1', 'R5'])(
    '%s can reuse returned citations without new progress or automatic registration',
    async (id) => {
      const h = progressHarness(),
        row = progressRow(id)
      expect((await h.runtime.status()).registration.nextAction).toContain('Locate and read')
      for (const c of row.sourceCalls) await h.call(c.toolName, c.originalArguments)
      const status = await h.runtime.status()
      expect(status.registration).toMatchObject({ phase: 'source-located', invalidAttempts: 0 })
      expect(status.registration.nextAction).toContain('No plan is registered yet')
      expect(status.registration.nextAction).toContain('specific missing')
      expect(status.plan).toBeUndefined()
      expect(status.complete).toBe(false)
      expect([...h.progress].sort()).toEqual([
        'overview',
        `source-coverage:${h.source.markdown.length}`,
      ])
      // The existing supported R2 draft is an author-selected compatibility control, not inferred by product.
      const registered = await h.call(
        'product_path_register',
        progressRow('R2').registrations[0].originalArguments,
      )
      expect(registered.registration.phase).toBe('frozen')
      expect(registered.execution.phase).toBe('bind-next-step')
    },
  )
  it('does not turn any returned passage into sufficient evidence for a draft', async () => {
    const h = progressHarness({
      title: 'Sparse',
      version: '1',
      markdown: '# Overview\nNo executable behavior specified.',
    })
    await h.call('product_source_read', { offset: 0 })
    expect((await h.runtime.status()).registration.nextAction).toContain('not proof')
    const result = await h.call(
      'product_path_register',
      progressRow('R2').registrations[0].originalArguments,
    )
    expect(result.error).toBe('product-registration-invalid')
    expect(result.registration.phase).toBe('repair-needed')
    expect(h.events.some((e) => e.type === 'product:planned')).toBe(false)
    expect((await h.runtime.status()).complete).toBe(false)
  })
  it('removes unconditional rereading from actual wire schema and skill', () => {
    const wire: any = progressHarness().schema('product_path_register')
    const description =
      wire.properties.steps.items.properties.review.properties.preconditionsComplete.description
    expect(description).toContain('already returned')
    expect(description).toContain('specific missing or truncated')
    expect(description).not.toContain('rereading')
    expect(productPathSkill).toContain('reread only missing or truncated passages')
  })
  it.each(['R6', 'R2'])(
    '%s gets indexed count feedback without evidence, progress, or an action',
    async (id) => {
      const h = progressHarness(),
        row = progressRow(id)
      await h.call('product_source_read', { offset: 0 })
      await h.call('product_path_register', row.registrations[0].originalArguments)
      const before = [...h.progress]
      const result = await h.call('product_path_bind', row.bindings[0].originalArguments)
      expect(result).toMatchObject({
        error: 'product-precondition-bindings-required',
        dispatched: false,
        execution: { phase: 'repair-binding-input' },
        diagnostics: {
          expectedCount: id === 'R6' ? 2 : 1,
          receivedCount: id === 'R6' ? 1 : 0,
          missingPositions: [id === 'R6' ? 1 : 0],
        },
      })
      expect(result.diagnostics.requirements.map((r: any) => r.expectation)).toEqual(
        row.registrations[0].originalArguments.steps[0].preconditions.map(
          (p: any) => p.expectation,
        ),
      )
      expect(extractToolSummary({ tool: 'product_path_bind', result })).toMatchObject({
        diagnostics: result.diagnostics,
        execution: result.execution,
      })
      expect((await h.runtime.status()).execution).toEqual(result.execution)
      expect([...h.progress]).toEqual(before)
      expect(h.events.some((e) => ['product:bound', 'action:executing'].includes(e.type))).toBe(
        false,
      )
      expect((await h.runtime.status()).complete).toBe(false)
    },
  )
  it('labels only absent array positions, not semantic missing requirements, and reports extras', () => {
    const step = progressRow('R6').registrations[0].originalArguments.steps[0]
    const diagnostic = productBindingInputDiagnostics(step, ['#preview-state'])!
    expect(diagnostic.missingPositions).toEqual([1])
    expect(diagnostic.requirements[0]?.suppliedSelector).toBe('#preview-state')
    expect(diagnostic.mapping).toContain('not been measured or matched semantically')
    expect(productBindingInputDiagnostics(step, ['#a', '#b', '#c'])?.extraPositions).toEqual([2])
    expect(productBindingInputDiagnostics(step, ['#wrong', '#wrong'])).toBeUndefined()
    // Equal count is not a binding success: the unchanged runtime still measures every selector.
  })
  it('successful binding and original actions supersede old input diagnostics', async () => {
    const h = progressHarness(),
      row = progressRow('R6')
    await h.call('product_source_read', { offset: 0 })
    await h.call('product_path_register', row.registrations[0].originalArguments)
    await h.call('product_path_bind', row.bindings[0].originalArguments)
    const report = await h.runtime.status()
    const bound = { seq: 99, type: 'product:bound', payload: { step: 0, ref: 'fresh' } } as any
    expect(productContinuation(report, [...h.events, bound]).phase).toBe('act-bound-step')
    report.steps[0]!.actionId = 'original-action'
    expect(productContinuation(report, [...h.events, bound]).phase).toBe('verify-original-action')
    report.steps[0]!.state = 'verified'
    expect(productContinuation(report, [...h.events, bound])).toMatchObject({
      phase: 'bind-next-step',
      step: 1,
    })
  })
})
