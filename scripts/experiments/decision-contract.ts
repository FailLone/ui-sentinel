/** Experimental input projection. Uses only facts already in this exact decision input. */
export function investigationDigest(input: any, maxBytes = 6000) {
  const snapshotId = input.inspection?.snapshotId ?? null
  const currentRefs = new Set((input.observation?.elements ?? []).map((e: any) => e.ref))
  const receipts = [...(input.history ?? []), input.latestToolResults]
    .filter(Boolean)
    .flatMap((entry: any) => entry.tools ?? [])
  const digest: any = {
    contract: 'investigation-digest-1',
    snapshotId,
    source: 'existing decision input only; raw facts and read tools remain available',
    limits:
      'An index, not a completion verdict. Historical evidence is not a fresh measurement. Discrete snapshots do not establish continuous actionability. Open questions still require investigation.',
    currentTargets: (input.observation?.elements ?? [])
      .filter((e: any) => ['button', 'a', 'input', 'select', 'textarea'].includes(e.tag))
      .map((e: any) => ({
        ref: e.ref,
        text: e.text,
        enabled: e.enabled,
        visible: e.visible,
        blockedPoints: e.blockedPoints,
      })),
    rules: (input.knownRules ?? []).map((rule: any) => ({
      id: rule.id,
      description: rule.description,
      execution: rule.execution,
      applicability: rule.applicability,
      savedChecks: (input.inspection?.automaticChecks ?? [])
        .filter((c: any) => c.ruleId === rule.id)
        .map((c: any) => ({ verdict: c.verdict, actual: c.actual, evidenceRefs: c.evidenceRefs })),
    })),
    catalog: input.ruleCatalog,
    businessResponse: input.businessOutcomeObserved?.response,
    writePolicy: input.businessOutcomeObserved?.writePolicy,
    hypotheses: input.task?.hypotheses,
    gaps: input.finishReadiness?.applicableGaps,
    historicalReceipts: receipts
      .filter((r: any) =>
        [
          'rules_search',
          'element_details',
          'page_act',
          'transition_observe',
          'findings_submit',
        ].includes(r.tool),
      )
      .map((r: any) => ({
        tool: r.tool,
        receiptRef: r.receiptRef ?? r.resultRef,
        args: r.args,
        status: r.status,
        // Exact existing error facts, without inventing a classification or reading future results.
        error:
          typeof r.error === 'string'
            ? [
                ...new Set(
                  r.error
                    .replace(/\u001b\[[0-9;]*m/g, '')
                    .split('\n')
                    .map((s: string) => s.trim())
                    .filter((s: string) =>
                      /Timeout|intercepts pointer|disabled|not visible/.test(s),
                    ),
                ),
              ].join('\n')
            : undefined,
        matching: r.matching,
        nextOffset: r.nextOffset,
        evidenceRefs: r.evidenceRefs,
        sampleSummary: r.sampleSummary,
        evidenceStatus: r.evidenceStatus,
        details:
          r.tool === 'element_details'
            ? r.results?.filter(
                (e: any) =>
                  currentRefs.has(e.ref) &&
                  !e.stale &&
                  (!e.snapshotId || e.snapshotId === snapshotId),
              )
            : undefined,
      })),
    omitted: [] as string[],
  }
  // Drop whole optional entries, never slice JSON or fabricate completeness.
  const bytes = () => Buffer.byteLength(JSON.stringify(digest))
  for (const section of ['historicalReceipts', 'currentTargets', 'rules']) {
    while (bytes() > maxBytes && digest[section].length) {
      if (!digest.omitted.includes(section)) digest.omitted.push(section)
      digest[section].shift()
    }
  }
  if (bytes() > maxBytes)
    return {
      contract: digest.contract,
      snapshotId,
      omitted: ['digest-size-limit'],
      source: digest.source,
    }
  return digest
}

export function withInvestigationDigest(body: any) {
  const result = structuredClone(body)
  const message = result.messages.find((m: any) => m.role === 'user')
  if (!message || typeof message.content !== 'string')
    throw Error('Missing structured decision input')
  const input = JSON.parse(message.content)
  message.content = JSON.stringify({ investigationDigest: investigationDigest(input), ...input })
  return result
}
