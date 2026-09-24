/** Experimental decision interface. No oracle, browser access, or semantic verdicts. */
export function withCapabilityContract(body: any) {
  const result = structuredClone(body)
  const message = result.messages.find((m: any) => m.role === 'user')
  if (!message || typeof message.content !== 'string')
    throw Error('Missing structured decision input')
  const input = JSON.parse(message.content)
  const hypotheses = input.task?.hypotheses ?? []
  const unresolved = hypotheses.filter(
    (h: any) => ['open', 'inconclusive'].includes(h.status) && h.applicability !== 'not-triggered',
  )
  const receipts = [...(input.history ?? []), input.latestToolResults]
    .filter(Boolean)
    .flatMap((entry: any) => entry.tools ?? [])
  const investigations = hypotheses.map((h: any) => {
    const measurements = receipts
      .filter((r: any) => r.tool === 'transition_observe' && r.args?.hypothesisId === h.id)
      .map((r: any) => ({
        receiptRef: r.receiptRef ?? r.resultRef,
        condition: r.condition,
        evidenceStatus: r.evidenceStatus,
        startedAtMs: r.startedAtMs,
        observedUntilMs: r.observedUntilMs,
        sampleSummary: r.sampleSummary,
        evidenceRefs: r.evidenceRefs,
      }))
    return {
      id: h.id,
      status: h.status,
      applicability: h.applicability,
      stage: ['supported', 'refuted'].includes(h.status)
        ? 'resolved'
        : measurements.some((m: any) => m.evidenceStatus === 'complete')
          ? 'measurement-recorded-interpret-against-hypothesis'
          : 'no-complete-measurement-in-delivered-context',
      measurements,
    }
  })
  // Match existing runtime phase restrictions; never manufacture a finish verdict.
  const finalizingAllowed = new Set([
    'run_finish',
    'findings_submit',
    'hypotheses_link_finding',
    'element_details',
    'history_read',
    'tool_result_read',
    'exploration_update',
    'checks_run',
    'rules_search',
    'rule_details',
    'page_observe',
    'transition_observe',
    'rule_check',
  ])
  const excluded: { tool: string; reason: string }[] = []
  result.tools = result.tools.filter((tool: any) => {
    const name = tool.function.name
    let reason: string | undefined
    if (input.phase === 'finalizing' && !finalizingAllowed.has(name))
      reason = 'Existing runtime phase forbids new exploration'
    else if (name === 'journey_run' && input.availableJourneys?.length === 0)
      reason = 'No offered journey'
    else if (['transition_observe', 'findings_submit'].includes(name) && !unresolved.length)
      reason =
        'No applicable unresolved hypothesis; new issues can be registered during exploration'
    else if (name === 'rule_check' && input.phase === 'finalizing' && !unresolved.length)
      reason = 'Runtime permits only an existing investigation in finalization'
    if (reason) excluded.push({ tool: name, reason })
    return !reason
  })
  const refs = (input.observation?.elements ?? []).map((e: any) => e.ref)
  for (const tool of result.tools) {
    const name = tool.function.name
    const properties = tool.function.parameters.properties
    if (['transition_observe', 'findings_submit'].includes(name) && unresolved.length)
      properties.hypothesisId = {
        ...properties.hypothesisId,
        enum: unresolved.map((h: any) => h.id),
      }
    if (name === 'element_details' && refs.length)
      properties.refs.items = { ...properties.refs.items, enum: refs }
  }
  input.activeTools = result.tools.map((t: any) => t.function.name)
  const decisionContract = {
    version: 'capability-lifecycle-1',
    phase: input.phase,
    investigations,
    excluded,
    obligations: {
      pendingKnownRuleChecks: input.pendingKnownRuleChecks,
      recordedCoverageGaps: input.finishReadiness?.applicableGaps,
      savedFindings: input.submittedFindings,
    },
    limits:
      'This is an index of delivered facts, not a completion verdict or an exhaustive list of possible issues. A recorded measurement needs interpretation against the original hypothesis, condition, target and required window; it does not automatically prove the claim. Resolve supported/refuted/inconclusive with matching evidence. Missing history is unknown, not absent evidence. Repeat measurement only for a specific remaining question, changed facts or incomplete evidence. Resolved findings remain saved. Explore new observed anomalies; do not recreate a resolved investigation just to finish. Use run_finish when the requested scope is covered or honestly blocked. All original observations, history, retrieval and investigation tools remain authoritative.',
  }
  message.content = JSON.stringify({ decisionContract, ...input })
  return result
}
