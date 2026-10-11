import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { productContinuation } from './product-continuation.ts'
import { extractToolSummary } from '../agent/context/compact-history.ts'
const fixture = JSON.parse(
  readFileSync('evaluation/private/r2-product-acceptance/continuation-failures.json', 'utf8'),
)
const original = (row: string) => structuredClone(fixture.rows.find((r: any) => r.row === row))
describe('continuation of original real traces, guidance only', () => {
  it('R1 advances past the measured original action to the pending dynamic target without modifying evidence', () => {
    const r = original('R1'),
      before = JSON.stringify(r)
    expect(productContinuation(r.report, r.events)).toMatchObject({
      phase: 'bind-next-step',
      step: 1,
      targetName: '查看详情',
      completedSteps: [0],
      advisoryOnly: true,
    })
    expect(JSON.stringify(r)).toBe(before)
  })
  it('R5 distinguishes zero-match binding from false prerequisite and preserves diagnostics through compression', () => {
    const r = original('R5'),
      before = JSON.stringify(r)
    const execution = productContinuation(r.report, r.events)
    expect(execution).toMatchObject({
      phase: 'inspect-binding',
      step: 0,
      diagnostics: [
        {
          field: 'preconditionSelectors[0]',
          measured: { count: 0, values: [] },
          outcome: 'unverified',
          resolution: 'inspect-selector',
        },
      ],
    })
    const compact = extractToolSummary({
      tool: 'product_path_bind',
      result: { error: 'product-precondition-missing', dispatched: false, execution },
    })
    expect(compact).toMatchObject({ execution })
    expect(JSON.stringify(r)).toBe(before)
  })
  it('does not suggest selector repair to turn an actual false prerequisite into a pass', () => {
    const r = original('R5'),
      check = r.events.find((e: any) => e.type === 'product:precondition-missing').payload.checks[0]
    check.measured = { count: 1, values: ['暂不可用'], supported: true }
    check.outcome = 'failed'
    expect(productContinuation(r.report, r.events)).toMatchObject({
      phase: 'prerequisite-not-satisfied',
    })
  })
  it.each([null, { count: 0, values: [], supported: false }])(
    'keeps unsupported measurement %j unverified instead of assuming missing selector repair',
    (measured) => {
      const r = original('R5'),
        check = r.events.find((e: any) => e.type === 'product:precondition-missing').payload
          .checks[0]
      check.measured = measured
      expect(productContinuation(r.report, r.events)).toMatchObject({ phase: 'unverified' })
    },
  )
  it('requires read-only original-action recovery, never rebind/replay after an unverified effect', () => {
    const r = original('R1')
    r.report.steps[0].state = 'unverified'
    expect(productContinuation(r.report, r.events)).toMatchObject({
      phase: 'verify-original-action',
      step: 0,
      actionId: r.report.steps[0].actionId,
    })
  })
  it('does not continue a dependent step after failure or erase integrity/legacy assumptions', () => {
    const r = original('R1')
    r.report.steps[0].state = 'failed'
    expect(productContinuation(r.report, r.events)).toMatchObject({
      phase: 'effect-failed',
      step: 0,
    })
    r.report.issues = ['product-admission-invalid']
    expect(productContinuation(r.report, r.events)).toMatchObject({ phase: 'unverified' })
    const legacy = original('R5')
    legacy.report.plan.assumptions = ['available assumed']
    expect(productContinuation(legacy.report, legacy.events)).toMatchObject({ phase: 'unverified' })
  })
})
