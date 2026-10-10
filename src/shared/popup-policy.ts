import { z } from 'zod'

/** A server-owned subtask; never changes the run's required checks or permissions. */
export const popupRequestSchema = z.object({ mode: z.literal('popup-viewport') }).strict()
export const LEGACY_POPUP_POLICY = Object.freeze({
  mode: 'popup-viewport',
  revision: 'popup-viewport-1',
  maxActions: 3,
  maxDecisions: 6,
  maxReads: 4,
  maxCandidates: 8,
} as const)
export const POPUP_POLICY = Object.freeze({
  ...LEGACY_POPUP_POLICY,
  revision: 'popup-viewport-2',
} as const)
export type PopupPolicy = typeof POPUP_POLICY | typeof LEGACY_POPUP_POLICY
export function validPopupPolicy(value: unknown): value is PopupPolicy {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.keys(value).length === Object.keys(POPUP_POLICY).length &&
    [POPUP_POLICY, LEGACY_POPUP_POLICY].some((policy) =>
      Object.entries(policy).every(([k, v]) => (value as any)[k] === v),
    )
  )
}

/** Explicit geometry focus is not a functional effect assertion. Other goals retain source review. */
export function popupFocusIntent(text: string) {
  return ['检查弹窗是否超出视口', 'Check whether popups exceed the viewport'].includes(
    text.trim().replace(/[.!。]$/, ''),
  )
}
