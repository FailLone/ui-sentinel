import type { CheckResult, CheckTask, MeasurementReceipt } from './contract.ts'

/** Structural boundary; the committed popup module owns semantics and geometry. */
export interface PopupAdapterState {
  status: 'active' | 'handoff' | 'measured'
  reason: string
  missing: string[]
  evidenceRefs: string[]
  receiptRef?: string
  measurement?: { verdict: 'pass' | 'fail' | 'unknown'; reason: string }
}

/**
 * A trusted host must validate the ORIGINAL popup receipt and bind its actual measurement.
 * Neither a model choice nor copied parent action/item hints can supply that callback.
 * Not registered by the read-only production host until its original action/resource adapter exists.
 */
export async function popupCheckResult(
  task: CheckTask,
  state: PopupAdapterState,
  bindOriginalReceipt: (receiptRef: string) => Promise<MeasurementReceipt>,
): Promise<CheckResult> {
  if (
    state.status !== 'measured' ||
    !state.receiptRef ||
    !state.measurement ||
    state.measurement.verdict === 'unknown'
  )
    return {
      status: 'unverified',
      measurements: [],
      evidenceRefs: [...state.evidenceRefs],
      unchecked: state.missing.length ? [...state.missing] : [state.reason],
    }
  const receipt = await bindOriginalReceipt(state.receiptRef)
  if (
    receipt.childTaskId !== task.childTaskId ||
    receipt.taskHash !== task.taskHash ||
    !receipt.verified ||
    receipt.measuredAt > task.deadlineAt ||
    !receipt.evidenceRefs.includes(state.receiptRef)
  )
    throw Error('popup-original-receipt-unbound')
  return {
    status: state.measurement.verdict === 'fail' ? 'defect' : 'completed',
    measurements: [receipt],
    evidenceRefs: [...new Set([...state.evidenceRefs, ...receipt.evidenceRefs])],
    unchecked: [],
  }
}
