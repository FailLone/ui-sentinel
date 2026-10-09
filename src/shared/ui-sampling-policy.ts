/** Public server policy, shared with the workbench; no fixture or oracle inputs. */
export const UI_SAMPLING_POLICY = Object.freeze({
  revision: 'bounded-ui-sampling-1',
  candidateLimit: 8,
  localSamplesPerVisitedPage: 3,
  navigationSamplesPerRun: 1,
  goalMode: 'focus',
} as const)
export const UI_SAMPLING_POLICY_V2 = Object.freeze({
  ...UI_SAMPLING_POLICY,
  revision: 'bounded-ui-sampling-2',
} as const)
export type UiSamplingPolicy = typeof UI_SAMPLING_POLICY | typeof UI_SAMPLING_POLICY_V2
export const UI_CHECK_POLICY = Object.freeze({
  revision: 'default-check-contract-2',
  sourceProfile: 'public-effect-sources-1',
  feedbackSampleOffsetsMs: [0, 1000] as readonly [0, 1000],
  maxExploratoryDispatches: 1,
  maxReadOnlyRecoveries: 2,
} as const)
export type UiCheckPolicy = typeof UI_CHECK_POLICY
export function validCheckPolicy(value: unknown): value is UiCheckPolicy {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    Object.keys(v).length === 5 &&
    v.revision === UI_CHECK_POLICY.revision &&
    v.sourceProfile === UI_CHECK_POLICY.sourceProfile &&
    v.maxExploratoryDispatches === 1 &&
    v.maxReadOnlyRecoveries === 2 &&
    JSON.stringify(v.feedbackSampleOffsetsMs) === '[0,1000]'
  )
}
export const UI_CHECK_DESCRIPTION =
  '在限定页面内观察界面、执行适用规则，从首批候选中固定检查最多三个本地控件，并实际检查一条可用同源链接。通用检查记录操作、反馈和异常；只有具备明确依据的功能要求才作效果验证。功能语义未知、未检查范围和未完成要求分别列出。检查完成不代表全部功能正确或整站无缺陷。'
export const UI_SAMPLING_DESCRIPTION =
  '每个实际访问页面从首批最多 8 个候选中固定检查最多 3 个不同本地控件（不足 3 个时全部纳入），并实际点击验证 1 条可用同源链接。目标指导选样和核验重点；其余控件、页面及目标细节如实列为未检查，不代表完整覆盖。'
export function validSamplingPolicy(value: unknown): value is UiSamplingPolicy {
  if (!value || typeof value !== 'object') return false
  const entries = Object.entries(value)
  return (
    entries.length === Object.keys(UI_SAMPLING_POLICY).length &&
    [UI_SAMPLING_POLICY, UI_SAMPLING_POLICY_V2].some((policy) =>
      entries.every(([k, v]) => policy[k as keyof UiSamplingPolicy] === v),
    )
  )
}
