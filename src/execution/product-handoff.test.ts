import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { progressHarness } from '../../scripts/validation/r2-progress-replay.ts'
import { extractToolSummary } from '../agent/context/compact-history.ts'

const original = JSON.parse(
  readFileSync(
    'evaluation/private/r2-product-acceptance/registration-action-handoff-failures.json',
    'utf8',
  ),
)

it('sixth R1 exact repeated requests add no coverage, plan, or action', async () => {
  const h = progressHarness(undefined, true)
  const receipts = original.rows.find((r: any) => r.row === 'R1').receipts
  let complete: string[] = []
  for (const r of receipts) {
    await h.call(r.toolName, r.originalArguments)
    if (r.requestSeq === 2) complete = [...h.progress]
    if (r.requestSeq > 2) expect([...h.progress]).toEqual(complete)
  }
  const status = await h.runtime.status()
  expect(status.registration.sourceCoverage).toMatchObject({
    complete: true,
    returnedChars: 609,
    semanticCompleteness: 'not-inferred',
  })
  expect(status.plan).toBeUndefined()
  expect(status.nextAction).toBeUndefined()
  expect(h.events.filter((e) => ['product:planned', 'action:executing'].includes(e.type))).toEqual(
    [],
  )
})

it('offers only the source-owned original effect from a unique current binding', async () => {
  const h = progressHarness(undefined, true)
  await h.call('product_source_read', { offset: 0 })
  const plan = original.rows
    .find((r: any) => r.row === 'R6')
    .receipts.find((r: any) => r.toolName === 'product_path_register').originalArguments
  await h.call('product_path_decide', { decision: { kind: 'draft', plan } })
  const step = (await h.runtime.status()).plan!.steps[0]!
  h.events.push({
    id: 'target',
    seq: 2,
    type: 'scope:item-created',
    payload: { ...h.target },
    evidenceRefs: [],
  })
  h.events.push({
    id: 'bound',
    seq: 3,
    type: 'product:bound',
    payload: {
      step: 0,
      itemId: h.target.itemId,
      ref: 'e5',
      resultSelector: '#out',
      checks: [],
      targetWasSelected: true,
      planEventId: h.events.find((e) => e.type === 'product:planned').id,
    },
  })
  expect((await h.runtime.status()).nextAction).toBeUndefined()
  const effect = {
    sourceKind: 'product-source',
    sourceId: `${h.source.sourceId}:step:0`,
    requirementId: 'requirement:original',
    actionContract: { type: step.action, value: step.value },
    predicate: { ...step.expectation, selector: '#out' },
  }
  h.target.checks = { effects: [effect], sourceReview: { state: 'sealed' }, generic: {} }
  const next = (await h.runtime.status()).nextAction
  expect(next).toEqual({
    tool: 'page_act',
    args: { type: 'click', ref: 'e5', requirementId: 'requirement:original' },
  })
  expect(
    extractToolSummary({ tool: 'product_path_bind', result: { bound: true, nextAction: next } }),
  ).toMatchObject({ nextAction: next })
  h.target.checks.effects.push({ ...effect, requirementId: 'requirement:other' })
  expect((await h.runtime.status()).nextAction).toBeUndefined()
  h.target.checks.effects = [effect]
  h.target.checks.sourceReview.state = 'unresolved'
  expect((await h.runtime.status()).nextAction).toBeUndefined()
  h.target.checks.sourceReview.state = 'sealed'
  h.events.push({ ...h.events.at(-1), id: 'duplicate', seq: 4 })
  expect((await h.runtime.status()).nextAction).toBeUndefined()
  h.events.pop()
  h.events.push({ id: 'action', seq: 5, type: 'action:executing', payload: {} })
  expect((await h.runtime.status()).nextAction).toBeUndefined()
})
