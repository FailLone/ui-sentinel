import type { Run, RunEvent } from '../../shared/types.ts'
import type { PopupState } from '../../execution/popup/runtime.ts'
/** Measurements are historical snapshots. Subtask success never implies whole-run coverage. */
export function popupReport(
  run: Run,
  events: readonly RunEvent[],
  readable?: ReadonlySet<string>,
  issues: readonly string[] = [],
) {
  if (!run.spec.uiContract?.popupCheck) return undefined
  if (
    !events.some((e) => e.type === 'popup:started') &&
    events.some((e) => e.type === 'check-task:submitted')
  )
    return undefined
  const event = events.filter((e) => e.type === 'popup:state').at(-1)
  const state = event?.payload as (PopupState & { taskId: string }) | undefined
  const receipt = events
    .filter((e) => e.type === 'popup:measurement' && e.payload.receiptRef === state?.receiptRef)
    .at(-1)
  const readableEvidence =
    !issues.some((i) => i.startsWith('popup-')) &&
    !!receipt &&
    !!readable &&
    receipt.evidenceRefs.length > 0 &&
    receipt.evidenceRefs.every((r) => readable.has(r))
  return {
    revision: 'popup-viewport-1',
    taskId: state?.taskId ?? null,
    status: state?.status ?? 'not-started',
    verdict:
      readableEvidence && state?.status === 'measured'
        ? (state.measurement?.verdict ?? 'unknown')
        : 'unknown',
    reason: state?.reason ?? 'subtask-not-started',
    attempts: state?.attempts ?? [],
    missing: state?.missing ?? ['popup-inspection'],
    evidenceRefs: state?.evidenceRefs ?? [],
    receiptRef: state?.receiptRef ?? null,
    decisions: state?.decisions ?? 0,
    reads: state?.reads ?? 0,
    scope: 'Measured popup at the recorded state only; required/default checks remain independent.',
  }
}
