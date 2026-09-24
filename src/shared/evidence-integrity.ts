/** A captured receipt, not a claim that the site's behavior is correct. */
export interface EvidenceIntegrity {
  readonly version: 1
  readonly status: 'clean' | 'intervened'
  readonly interventionIds: readonly string[]
}

export const interventionLimitation =
  'inspection-intervention: the executor blocked a request or closed a page. Subsequent browser state may reflect this intervention, so it cannot establish a defect or a healthy result for the unmodified business flow. Prior clean evidence remains valid. Reobserving, scrolling or navigating does not restore validity; report this scope as unverified. A fresh trusted run is required.'

export function cleanEvidenceIntegrity(value: unknown): value is EvidenceIntegrity {
  if (!value || typeof value !== 'object') return false
  const receipt = value as EvidenceIntegrity
  return (
    receipt.version === 1 &&
    receipt.status === 'clean' &&
    Array.isArray(receipt.interventionIds) &&
    receipt.interventionIds.length === 0
  )
}
