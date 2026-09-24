/** Reject inherited navigation memory before forwarding a cold-start decision to a paid model. */
export function assertColdDecisionInput(body: Record<string, any>): void {
  const texts = (body.messages ?? [])
    .filter((m: any) => m.role === 'user')
    .flatMap((m: any) =>
      typeof m.content === 'string'
        ? [m.content]
        : (m.content ?? []).filter((p: any) => p.type === 'text').map((p: any) => p.text),
    )
  let decisions = 0
  for (const text of texts) {
    let input: any
    try {
      input = JSON.parse(text)
    } catch {
      continue
    }
    if (!input || !Array.isArray(input.activeTools)) continue
    decisions++
    if (!Array.isArray(input.availableJourneys) || input.availableJourneys.length)
      throw Error('cross-run-history-detected: cold trial received inherited navigation')
  }
  if (decisions !== 1) throw Error('cold-trial-input-contract-missing')
}
