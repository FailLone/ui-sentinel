import { z } from 'zod'

/** A server-owned subtask; never changes the run's required checks or permissions. */
export const popupRequestSchema = z.object({ mode: z.literal('popup-viewport') }).strict()
export const POPUP_POLICY = Object.freeze({
  mode: 'popup-viewport',
  revision: 'popup-viewport-1',
  maxActions: 3,
  maxDecisions: 6,
  maxReads: 4,
  maxCandidates: 8,
} as const)
export type PopupPolicy = typeof POPUP_POLICY
export function validPopupPolicy(value: unknown): value is PopupPolicy {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.keys(value).length === Object.keys(POPUP_POLICY).length &&
    Object.entries(POPUP_POLICY).every(([k, v]) => (value as any)[k] === v)
  )
}
