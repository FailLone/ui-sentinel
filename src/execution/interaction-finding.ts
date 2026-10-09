import { readFile } from 'node:fs/promises'
import { getDbClient } from '../storage/database.ts'
import {
  appendEvent,
  getEvents,
  getFindings,
  recordHypothesis,
  submitFinding,
  updateHypothesis,
} from './run-manager.ts'
import { digestBytes } from './interaction-finding-proof.ts'
import type { measureInteraction } from './interaction-verification.ts'

/** A comparison finding, not a claim that the Agent's applicability basis is a universal rule. */
export async function publishInteractionFinding(input: {
  runId: string
  actionId: string
  itemId: string
  receiptRef: string
  evidenceRefs: readonly string[]
  measurement: Awaited<ReturnType<typeof measureInteraction>>
  metadata: Record<string, unknown>
  guard(): void
}) {
  const { runId, actionId, itemId, receiptRef, measurement, guard } = input
  if (measurement.outcome !== 'failed') return
  guard()
  const events = await getEvents(runId)
  const prior = events.find(
    (e) =>
      e.type === 'interaction:finding-measured' &&
      e.payload.actionId === actionId &&
      e.payload.itemId === itemId,
  )
  if (prior) {
    const existing = (await getFindings(runId)).find(
      (f) => f.hypothesisId === prior.payload.hypothesisId,
    )
    if (existing) return existing.id
    throw Error('interaction-finding-publication-incomplete')
  }
  const measured = events.find(
    (e) =>
      ['interaction:measured', 'interaction:recovered'].includes(e.type) &&
      e.evidenceRefs.includes(receiptRef),
  )
  const resolved = [...events]
    .reverse()
    .find(
      (e) =>
        e.type === 'scope:item-updated' &&
        e.payload.itemId === itemId &&
        e.payload.status === 'failed',
    )
  if (!measured || !resolved) throw Error('interaction-finding-source-required')
  const evidenceRefs = [...new Set(input.evidenceRefs)]
  const rows = await getDbClient().execute({
    sql: 'SELECT id,file_path FROM artifacts WHERE run_id=?',
    args: [runId],
  })
  const evidenceHashes: Record<string, string> = {}
  for (const id of evidenceRefs) {
    const artifact = rows.rows.find((a) => a.id === id)
    if (!artifact) throw Error('interaction-finding-evidence-not-owned')
    evidenceHashes[id] = digestBytes(await readFile(String(artifact.file_path)))
  }
  const h = await recordHypothesis({
    runId,
    kind: 'ui-interaction',
    status: 'open',
    evidenceRefs,
    phenomenon: 'Measured post-action result differs from its declared expectation',
    basis: measurement.input.basis,
    verificationPlan: JSON.stringify({ actionId, itemId, receiptRef, input: measurement.input }),
  })
  await appendEvent(
    runId,
    'interaction:finding-measured',
    {
      hypothesisId: h.id,
      actionId,
      itemId,
      receiptRef,
      evidenceHashes,
      measurementEventId: measured.id,
      resolutionEventId: resolved.id,
    },
    { actionId, evidenceRefs },
  )
  const finding = await submitFinding(
    {
      runId,
      hypothesisId: h.id,
      source: 'agent',
      ruleId: null,
      ruleRevision: null,
      validationStatus: 'supported',
      severity: 'warning',
      stepId: null,
      evidenceRefs,
      title: 'Measured post-action result contradicts a declared expectation',
      expected: `${measurement.input.condition} ${JSON.stringify(measurement.input.expected ?? '')}; applicability basis: ${measurement.input.basis}`,
      actual:
        JSON.stringify({
          target: measurement.input.selector,
          measured: measurement.measured,
          actionId,
          itemId,
        }) + ' Scope: this captured result and the declared public expectation only.',
    },
    guard,
  )
  await updateHypothesis(h.id, 'supported', evidenceRefs, guard)
  await appendEvent(
    runId,
    'finding:submitted',
    { findingId: finding.id, hypothesisId: h.id, contract: 'ui-interaction-1' },
    { actionId, evidenceRefs },
  )
  return finding.id
}
