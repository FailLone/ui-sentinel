import { matchTarget, validPathProgram, type PathProgram } from './library.ts'
import { productTarget } from '../../inspection/product-path.ts'
import type { PublicCheckPage } from '../../inspection/check-contract.ts'
import type { UiContractSnapshot } from '../../inspection/contract.ts'
import type { createProductPath } from '../product-path.ts'
import type { RunEvent } from '../../shared/types.ts'

type Status = Awaited<ReturnType<ReturnType<typeof createProductPath>['status']>>
export type ReuseResult = {
  programId: string
  status: 'reused' | 'handoff' | 'measured-failure'
  reason: string
  actions: { actionId?: string | null; type: unknown; completed: boolean }[]
  steps: {
    index: number
    state: string
    actionId?: string | null
    actual: unknown
    preconditionMeasurements: unknown
    reason: string
  }[]
  remainingSteps: number[]
  instruction: string
  readOnly: boolean
}
/** Bounded orchestration only: every tool goes through the original serialized executor. */
export async function runPathProgram(
  program: PathProgram | undefined,
  host: {
    programId: string
    contract: UiContractSnapshot
    guard(): void
    clean(): boolean
    remaining(): { actions: number; timeMs: number }
    observe(): Promise<unknown>
    page(): Promise<PublicCheckPage>
    ref(selector: string): Promise<string>
    install(plan: PathProgram['plan']): Promise<unknown>
    status(): Promise<Status>
    events(): Promise<readonly RunEvent[]>
    call(name: 'product_path_bind' | 'page_act', args: Record<string, unknown>): Promise<any>
    emit(type: string, payload: Record<string, unknown>): Promise<unknown>
  },
): Promise<ReuseResult> {
  let installed = false
  const finish = async (status: ReuseResult['status'], reason: string) => {
    const state = await host.status(),
      events = await host.events()
    const result: ReuseResult = {
      programId: host.programId,
      status,
      reason,
      actions: events
        .filter((e) => e.type === 'action:executing')
        .map((e) => ({
          actionId: e.actionId,
          type: e.payload.type,
          completed: events.some((c) => c.type === 'action:completed' && c.actionId === e.actionId),
        })),
      steps: state.steps.map((s) => ({
        index: s.index,
        state: s.state,
        actionId: s.actionId,
        actual: s.actual,
        preconditionMeasurements: s.preconditionMeasurements,
        reason: s.reason,
      })),
      remainingSteps: state.steps.filter((s) => s.state === 'unverified').map((s) => s.index),
      instruction: installed
        ? 'Continue from current facts using read-only tools and original verification references. Never replay issued actions or replace the frozen plan. Preserve failures and unfinished obligations.'
        : 'No reused action or plan was issued. Review current source and page using the ordinary Agent workflow.',
      readOnly: installed && status !== 'reused',
    }
    await host.emit('path-reuse:finished', result)
    return result
  }
  host.guard()
  await host.emit('path-reuse:started', { programId: host.programId })
  if (!program || !validPathProgram(program))
    return finish('handoff', 'program-unavailable-or-invalid')
  const source = host.contract.productSource
  if (program.entryUrl !== host.contract.entryUrl || program.origin !== host.contract.origin)
    return finish('handoff', 'entry-or-origin-mismatch')
  if (
    !source ||
    source.sourceId !== program.source.sourceId ||
    source.contentHash !== program.source.contentHash ||
    source.version !== program.source.version
  )
    return finish('handoff', 'source-version-mismatch')
  if (!host.clean()) return finish('handoff', 'original-executor-boundary')
  await host.install(program.plan)
  installed = true
  for (const [index, binding] of program.bindings.entries()) {
    host.guard()
    if (!host.clean()) return finish('handoff', 'original-executor-boundary')
    if (host.remaining().actions < program.bindings.length - index || host.remaining().timeMs <= 0)
      return finish('handoff', 'budget-insufficient')
    await host.observe()
    let ref: string
    let witnesses: { selector: string; identity: string }[]
    try {
      const page = await host.page()
      if (page.url !== program.entryUrl) throw Error('entry-or-origin-mismatch')
      const control = matchTarget(page, binding.control)
      productTarget(program.plan.steps[index]!, page, control.selector)
      witnesses = [binding.control, binding.result, ...binding.preconditions].map((target) => ({
        selector: target.selector,
        identity: matchTarget(page, target).identity!,
      }))
      ref = await host.ref(binding.control.selector)
    } catch (error) {
      host.guard()
      if (
        !(error instanceof Error) ||
        ![
          'entry-or-origin-mismatch',
          'target-missing-or-ambiguous',
          'target-description-changed',
          'target-not-visible-or-unidentified',
          'product-target-not-unique-source-match',
          'current-control-ref-missing-or-ambiguous',
        ].includes(error.message)
      )
        throw error
      return finish('handoff', error.message)
    }
    let bound: any
    try {
      bound = await host.call('product_path_bind', {
        step: index,
        ref,
        resultSelector: binding.result.selector,
        preconditionSelectors: binding.preconditions.map((p) => p.selector),
      })
    } catch (error) {
      host.guard()
      if (!(error instanceof Error) || !/^product-/.test(error.message)) throw error
      return finish('handoff', error.message)
    }
    host.guard()
    if (!bound?.bound) return finish('handoff', String(bound?.error ?? 'binding-refused'))
    const page = await host.page()
    if (
      page.url !== program.entryUrl ||
      witnesses.some((w) => {
        const nodes = page.nodes.filter((n) => n.selector === w.selector || n.path === w.selector)
        return nodes.length !== 1 || nodes[0]!.identity !== w.identity
      })
    )
      return finish('handoff', 'live-node-replaced')
    const next = (await host.status()).nextAction
    if (!next) return finish('handoff', 'original-action-unavailable')
    // Never catch/retry dispatch exceptions: cancellation, unknown writes and execution errors
    // retain their original terminal meaning in the outer executor.
    const result = await host.call('page_act', next.args)
    host.guard()
    const state = await host.status()
    if (state.steps[index]?.state === 'failed')
      return finish('measured-failure', 'new-measurement-failed')
    if (result?.error || state.steps[index]?.state !== 'verified')
      return finish('handoff', 'original-action-unverified-or-refused')
  }
  return finish('reused', 'path-remeasured')
}
