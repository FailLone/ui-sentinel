export const EVALUATION_VERSION = 'r1-online-evaluation-2' as const
export const RESULT_VERSION = 'r1-online-result-2' as const

/** First evidence-linked measurement EVENT, never proof of a completed or useful check. */
export function firstMeasurementEvent(report: any, artifactIds: Set<string>) {
  const start = report.events.find((e: any) => e.type === 'run:started')?.timestamp
  const startMs = typeof start === 'string' ? Date.parse(start) : NaN
  const candidates = report.events
    .filter((e: any) => {
      if (!['interaction:generic-collected-v2', 'interaction:effect-measured-v2'].includes(e.type))
        return false
      const ref =
        e.type === 'interaction:generic-collected-v2'
          ? e.payload?.receiptRef
          : e.payload?.measurementRef
      const timestamp = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN
      return (
        Number.isFinite(startMs) &&
        Number.isFinite(timestamp) &&
        timestamp >= startMs &&
        typeof ref === 'string' &&
        artifactIds.has(ref) &&
        Array.isArray(e.evidenceRefs) &&
        e.evidenceRefs.includes(ref) &&
        e.evidenceRefs.every((id: string) => artifactIds.has(id))
      )
    })
    .sort((a: any, b: any) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.seq - b.seq)
  const first = candidates[0]
  return {
    firstMeasurementEventMs: first ? Date.parse(first.timestamp) - startMs : null,
    firstMeasurementEventSeq: first?.seq ?? null,
    firstMeasurementEventAt: first?.timestamp ?? null,
    measurementEventMeaning:
      'first evidence-linked generic/effect measurement event; not settled-check success or quality benefit',
  }
}
