// Trusted adapter shape; NOT a claim that the popup branch is integrated.
// Import paths are relative to this document.
import type { CheckHandler } from '../../src/execution/check-tasks/contract.ts'

export const measurementAdapter: CheckHandler = async (task, resources) => {
  // Uses original executor measurement; resources serialize every page operation.
  const receipt = await resources.measure(task.target.selector)
  return {
    status: receipt.verified ? 'completed' : 'unverified',
    evidenceRefs: receipt.evidenceRefs,
    measurements: [receipt],
    unchecked: receipt.verified ? [] : ['target measurement unsupported or ambiguous'],
  }
}
// Popup adapter must preserve its original action/item/measurement receipt and
// return unverified on handoff; it must NOT translate a Jev choice into coverage.
// V1 resources intentionally offer no click or paid-model capability.
