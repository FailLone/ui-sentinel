import { createHash } from 'node:crypto'
import { saveEvidence } from '../browser.ts'
import { appendEvent, recordHypothesis, submitFinding, updateHypothesis } from '../run-manager.ts'
import { runProgram, type ProgramHost } from './runner.ts'
import { programInput, type InvestigationProgram } from './program.ts'

export async function investigateProgram(
  input: InvestigationProgram,
  host: ProgramHost & {
    runId: string
    metadata(): Record<string, unknown>
    registered(id: string, phenomenon: string): void
    resolved(id: string, status: 'supported' | 'refuted' | 'inconclusive'): void
  },
) {
  host.guard()
  input = programInput.parse(input)
  if (input.steps.filter((s) => s.op === 'act').length > host.remainingActions())
    throw Error('program-action-budget-exhausted')
  const programRef = await saveEvidence(
    host.runId,
    'investigation-program',
    JSON.stringify(input),
    host.metadata(),
    host.guard,
  )
  if (input.exploration) {
    const receipt = await runProgram(input, host)
    host.guard()
    const body = JSON.stringify({
      ...receipt,
      verdict: 'unknown',
      runId: host.runId,
      programRef,
      effectTested: false,
    })
    const receiptRef = await saveEvidence(
      host.runId,
      'measurement',
      body,
      { ...host.metadata(), kind: 'evidence-collection' },
      host.guard,
    )
    const result = {
      hypothesisId: undefined,
      findingId: undefined,
      verdict: 'unknown' as const,
      effectTested: false,
      assertions: [],
      targetIssues: receipt.targetIssues,
      resultBindings: receipt.resultBindings,
      programRef,
      receiptRef,
      evidenceRefs: [programRef, receiptRef, ...receipt.screenshotRefs],
      ...(receipt.error ? { error: receipt.error } : {}),
      scope:
        'Evidence collection only. An operation and observed change do not resolve the original control effect.',
      nextStep:
        'Read the actual public result. Only a previously frozen independent expectation can be measured through the returned exploration checkRef; otherwise preserve the original pending item.',
    }
    await appendEvent(host.runId, 'program:explored', result, { evidenceRefs: result.evidenceRefs })
    return result
  }
  const h = await recordHypothesis({
    runId: host.runId,
    kind: 'program',
    phenomenon:
      'Bounded DOM comparisons: ' +
      input.assertions
        .map(
          (a) =>
            `${a.left.sample}.${a.left.target}.${a.left.metric} ${a.operator} ${JSON.stringify(a.right)}`,
        )
        .join('; '),
    basis: input.basis,
    verificationPlan: JSON.stringify({ programRef }),
    status: 'open',
    evidenceRefs: [programRef],
  })
  host.registered(h.id, h.phenomenon)
  const receipt = await runProgram(input, host)
  host.guard()
  const body = JSON.stringify({ ...receipt, runId: host.runId, hypothesisId: h.id, programRef })
  const receiptRef = await saveEvidence(
    host.runId,
    'measurement',
    body,
    { ...host.metadata(), kind: 'investigation-program' },
    host.guard,
  )
  const evidenceRefs = [programRef, receiptRef, ...receipt.screenshotRefs]
  await appendEvent(
    host.runId,
    'program:measured',
    {
      hypothesisId: h.id,
      programRef,
      receiptRef,
      sha256: createHash('sha256').update(body).digest('hex'),
      verdict: receipt.verdict,
    },
    { evidenceRefs },
  )
  const validationStatus =
    receipt.verdict === 'fail'
      ? 'supported'
      : receipt.verdict === 'pass'
        ? 'refuted'
        : 'inconclusive'
  let findingId: string | undefined
  if (receipt.verdict === 'fail') {
    const finding = await submitFinding(
      {
        runId: host.runId,
        hypothesisId: h.id,
        source: 'agent',
        ruleId: null,
        ruleRevision: null,
        validationStatus,
        severity: 'warning',
        title: 'Measured facts contradict an Agent-declared expectation',
        expected: `${input.assertions.map((a) => a.expectation).join('; ')}. Agent's applicability basis: ${input.basis}`,
        actual:
          JSON.stringify(
            receipt.assertions.map((a) => ({
              expectation: a.expectation,
              left: a.actualLeft,
              operator: a.operator,
              right: a.actualRight,
              verdict: a.verdict,
            })),
          ) + ` Scope: ${receipt.scope}`,
        stepId: null,
        evidenceRefs,
      },
      host.guard,
    )
    findingId = finding.id
    await appendEvent(
      host.runId,
      'finding:submitted',
      { findingId, hypothesisId: h.id, contract: 'investigation-program-1' },
      { evidenceRefs },
    )
  }
  await updateHypothesis(h.id, validationStatus, evidenceRefs, host.guard)
  host.resolved(h.id, validationStatus)
  const result = {
    hypothesisId: h.id,
    findingId,
    verdict: receipt.verdict,
    validationStatus,
    assertions: receipt.assertions,
    targetIssues: receipt.targetIssues,
    resultBindings: receipt.resultBindings,
    evidenceRefs,
    programRef,
    receiptRef,
    ...(receipt.error ? { error: receipt.error } : {}),
    scope: receipt.scope,
    nextStep:
      receipt.verdict === 'unknown'
        ? 'This saved check is inconclusive, not a defect or verified interaction. Read targetIssues/error. If a target was replaced, inspect the current public DOM and bind a new current-state check; do not silently reuse the old node or replay a write. A new check does not erase this unverified scope. Otherwise record the remaining gap and finish partial. Rereading this receipt cannot change its measurements.'
        : 'Continue remaining scope or run_finish; this check is saved. Do not submit it again.',
  }
  await appendEvent(host.runId, 'program:completed', result, { evidenceRefs })
  return result
}
