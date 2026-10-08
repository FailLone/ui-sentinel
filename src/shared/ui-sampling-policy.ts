/** Public server policy, shared with the workbench; no fixture or oracle inputs. */
export const UI_SAMPLING_POLICY = Object.freeze({
  revision: 'bounded-ui-sampling-1',
  candidateLimit: 8,
  localSamplesPerVisitedPage: 3,
  navigationSamplesPerRun: 1,
  goalMode: 'focus',
} as const)
export type UiSamplingPolicy = typeof UI_SAMPLING_POLICY
export const UI_SAMPLING_DESCRIPTION =
  '每个实际访问页面从首批最多 8 个候选中固定检查最多 3 个不同本地控件（不足 3 个时全部纳入），并实际点击验证 1 条可用同源链接。目标指导选样和核验重点；其余控件、页面及目标细节如实列为未检查，不代表完整覆盖。'
export function validSamplingPolicy(value: unknown): value is UiSamplingPolicy {
  if (!value || typeof value !== 'object') return false
  const entries = Object.entries(value)
  return (
    entries.length === Object.keys(UI_SAMPLING_POLICY).length &&
    entries.every(([k, v]) => UI_SAMPLING_POLICY[k as keyof UiSamplingPolicy] === v)
  )
}
