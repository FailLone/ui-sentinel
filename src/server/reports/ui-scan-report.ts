import { productPathReport } from '../../inspection/product-path.ts'
import { checkTaskReport } from '../../execution/check-tasks/report.ts'
import { popupReport } from './popup-report.ts'
import { r1Report } from './r1-report.ts'
import { summary as checkSummary } from '../../execution/default-check-runtime.ts'
import type { ItemChecks } from '../../inspection/check-contract.ts'
import { samplingFrames } from '../../inspection/sampling-history.ts'
import { verifyUiContractSnapshot, type UiContractSnapshot } from '../../inspection/contract.ts'
import { inspectionHistoryIssues } from '../../inspection/proof-history.ts'
import { resolveRunKind } from '../../inspection/run-kind.ts'
import {
  verifyInspectionProof,
  type InspectionProof,
  type InspectionReason,
} from '../../inspection/completion.ts'
import { projectInspectionScope, type InspectionCandidateSummary } from '../../inspection/scope.ts'
import type { Run, RunEvent } from '../../shared/types.ts'

/**
 * The `ui-scan` section of a report (plan 6.3).
 *
 * Everything here is projected from the run's own persisted events and spec, never re-derived from
 * the live registry or from today's configuration: a report has to describe the run that executed, so
 * a queued run's frozen contract is what is shown even if the address policy has since changed.
 *
 * Coverage is reconciled against the persisted scope, full spec, terminal state and readable
 * artifacts. A self-consistent proof hash cannot establish coverage without those facts.
 */

export type UiCoverage = 'covered' | 'partial' | 'not-started'

export interface UiScanReport {
  readonly productSource?: ReturnType<typeof productPathReport>
  readonly checkTasks?: ReturnType<typeof checkTaskReport>
  readonly functionalChecks?: {
    itemId: string
    actionId?: string
    requirementId: string
    source: string
    expectation: string
    state: string
    evidenceRefs: string[]
  }[]
  readonly popupCheck?: ReturnType<typeof popupReport>
  readonly exploration?: ReturnType<typeof r1Report>
  readonly reportRevision?: 'ui-check-report-2'
  readonly checkCounts?: {
    effectUnspecifiedCount: number
    requiredEffectPendingCount: number
    genericIncompleteCount: number
    requiredEffectVerifiedCount: number
    requiredEffectFailedCount: number
    sourceUnresolvedCount: number
  }
  readonly kind: 'ui-scan'
  readonly businessResult: 'not-applicable'
  readonly contract: {
    readonly hash: string
    readonly integrity: 'verified' | 'hash-mismatch'
    /** The address as submitted, and the address the browser executed - both, kept distinct. */
    readonly requestedUrl: string
    readonly entryUrl: string
    readonly origin: string
    readonly goal: string
    readonly goalSource: 'user' | 'default'
    readonly requestedGoal?: string
    readonly checkPolicy?: UiContractSnapshot['checkPolicy']
    readonly requiredChecks?: UiContractSnapshot['requiredChecks']
    readonly samplingPolicy?: UiContractSnapshot['samplingPolicy']
    readonly session: 'anonymous'
    readonly scope: { readonly maxPages: number; readonly maxDepth: number }
    readonly access: {
      readonly resourceOrigins: readonly string[]
      readonly dataOrigins: readonly string[]
    }
    readonly businessWrites: 'none'
    readonly availableCapabilities: readonly string[]
    readonly unsupportedCapabilities: readonly string[]
    readonly schemaVersion: string
    readonly policyRevision: string
  }
  readonly inspection: {
    readonly sampling?: ReturnType<typeof samplingFrames>
    readonly coverage: UiCoverage
    readonly counts: ReturnType<ReturnType<typeof projectInspectionScope>['snapshot']>['counts']
    readonly items: readonly {
      readonly checks?: ReturnType<typeof checkSummary>
      readonly itemId: string
      readonly category: string
      readonly url: string
      readonly status: string
      readonly selected: boolean
      readonly basis: string
      readonly targetSource: 'executor' | 'agent'
      readonly reasonCode: string | null
      readonly detail: string | null
      readonly evidenceRefs: readonly string[]
      readonly ruleRevision: string | null
      readonly parentNavigation: string | null
    }[]
    readonly gaps: readonly {
      readonly itemId: string
      readonly category: string
      readonly status: string
      readonly reason: string
      readonly reasonCode: string | null
    }[]
    readonly candidates: InspectionCandidateSummary | null
    readonly unsupported: readonly { readonly dimension: string; readonly reasonCode: string }[]
  }
  readonly proof: InspectionProof | null
  readonly proofVerified: boolean
  /** The reason the run named when it asked to finish, whether or not it was accepted. */
  readonly finishReasonCode: InspectionReason | string | null
  /** Every executor intervention that touched the admissibility of a site verdict. */
  readonly interventions: readonly {
    readonly eventId: string
    readonly seq: number
    readonly kind: string
    readonly reasonCode: string | null
    readonly detail: string | null
  }[]
}

/**
 * The report's `ui-scan` section, or `undefined` for a run that is not a UI scan.
 *
 * A record with no `kind` is a legacy business run and gets no section here: absence is not a new
 * meaning (plan 11.1), so an old row is never presented as a partial UI scan that never started.
 */
export function uiScanSummary(
  run: Run,
  events: readonly RunEvent[],
  readable?: ReadonlySet<string>,
  additionalIssues: readonly string[] = [],
): UiScanReport | undefined {
  const resolved = resolveRunKind(run.spec)
  if (resolved.kind !== 'ui-scan') return undefined
  const contract: UiContractSnapshot = resolved.contract

  const scope = projectInspectionScope(events)
  const snapshot = scope.snapshot()
  const accepted = [...events].reverse().find((e) => e.type === 'finish:accepted')
  const proof = (accepted?.payload.inspectionProof as InspectionProof | undefined) ?? null
  const proofVerified =
    additionalIssues.length === 0 &&
    (proof?.claim !== 'scope-covered' || checkTaskReport(events, readable).issues.length === 0) &&
    inspectionHistoryIssues(run, events, readable).length === 0
  const finishReasonCode = (accepted?.payload.reasonCode as string | undefined) ?? null

  const coverage: UiCoverage =
    proofVerified && proof!.claim === 'scope-covered' && proof!.outcome === 'goal-reached'
      ? 'covered'
      : snapshot.counts.total > 0
        ? 'partial'
        : 'not-started'

  const interventions = events
    .filter((e) => e.type === 'execution:intervention')
    .map((e) => ({
      eventId: e.id,
      seq: e.seq,
      kind: String(e.payload.kind ?? 'intervention'),
      reasonCode: (e.payload.reasonCode as string | null) ?? null,
      detail: (e.payload.detail as string | null) ?? null,
    }))

  return {
    ...(contract.popupCheck?.revision === 'popup-viewport-2'
      ? {
          functionalChecks: snapshot.items.flatMap((i) =>
            (i.checks?.effects ?? [])
              .filter((e) => e.predicate.condition === 'popup-visible')
              .map((e) => ({
                itemId: i.itemId,
                actionId: i.checks?.generic.actionId,
                requirementId: e.requirementId,
                source: e.sourceText,
                expectation: e.predicate.expected ?? '',
                state: proofVerified
                  ? e.state
                  : ['verified', 'failed'].includes(e.state)
                    ? 'unverified'
                    : e.state,
                evidenceRefs: e.measurementRefs,
              })),
          ),
        }
      : {}),
    ...(events.some((e) => e.type.startsWith('check-task:'))
      ? { checkTasks: checkTaskReport(events, readable, additionalIssues) }
      : {}),
    ...(contract.popupCheck
      ? { popupCheck: popupReport(run, events, readable, additionalIssues) }
      : {}),
    ...(contract.exploration
      ? { exploration: r1Report(run, events, snapshot.items, readable) }
      : {}),
    ...(contract.checkPolicy
      ? {
          reportRevision: 'ui-check-report-2' as const,
          checkCounts: {
            effectUnspecifiedCount: snapshot.items.filter(
              (i) =>
                i.selected &&
                i.checks?.sourceReview.state === 'sealed' &&
                i.checks.effects.length === 0,
            ).length,
            requiredEffectPendingCount:
              snapshot.items.filter(
                (i) =>
                  i.selected &&
                  i.basis.startsWith('public-required:') &&
                  ['pending', 'unverified'].includes(i.status) &&
                  !events.some(
                    (e) =>
                      e.type === 'scope:required-bound' && e.payload.requiredItemId === i.itemId,
                  ),
              ).length +
              snapshot.items
                .flatMap((i) => (i.selected ? (i.checks?.effects ?? []) : []))
                .filter((e) => ['pending', 'unverified'].includes(e.state)).length,
            genericIncompleteCount: snapshot.items.filter(
              (i) =>
                i.selected && i.checks && !['collected', 'failed'].includes(i.checks.generic.state),
            ).length,
            requiredEffectVerifiedCount: snapshot.items
              .flatMap((i) => (i.selected ? (i.checks?.effects ?? []) : []))
              .filter((e) => e.state === 'verified').length,
            requiredEffectFailedCount: snapshot.items
              .flatMap((i) => (i.selected ? (i.checks?.effects ?? []) : []))
              .filter((e) => e.state === 'failed').length,
            sourceUnresolvedCount:
              snapshot.items.filter(
                (i) =>
                  i.basis === 'default-checks:goal-source-registration' &&
                  ['pending', 'unverified'].includes(i.status),
              ).length +
              snapshot.items.filter(
                (i) => i.selected && i.checks?.sourceReview.state !== 'sealed' && i.checks,
              ).length,
          },
        }
      : {}),
    ...(contract.productSource
      ? {
          productSource: productPathReport(
            contract.productSource,
            events,
            readable,
            additionalIssues,
          ),
        }
      : {}),
    kind: 'ui-scan',
    businessResult: 'not-applicable',
    contract: {
      hash: contract.hash,
      integrity: verifyUiContractSnapshot(contract) ? 'verified' : 'hash-mismatch',
      requestedUrl: contract.requestedUrl,
      entryUrl: contract.entryUrl,
      origin: contract.origin,
      goal: contract.goal,
      goalSource: contract.goalSource,
      ...(contract.checkPolicy
        ? { checkPolicy: contract.checkPolicy, requestedGoal: contract.requestedGoal }
        : {}),
      ...(contract.requiredChecks === undefined ? {} : { requiredChecks: contract.requiredChecks }),
      ...(contract.samplingPolicy ? { samplingPolicy: contract.samplingPolicy } : {}),
      session: contract.session,
      scope: contract.scope,
      access: contract.access,
      businessWrites: contract.businessWrites,
      availableCapabilities: contract.availableCapabilities,
      unsupportedCapabilities: contract.unsupportedCapabilities,
      schemaVersion: contract.schemaVersion,
      policyRevision: contract.policyRevision,
    },
    inspection: {
      ...(contract.samplingPolicy ? { sampling: samplingFrames(events, snapshot) } : {}),
      coverage,
      counts: snapshot.counts,
      items: snapshot.items.map((item) => ({
        ...(item.checks ? { checks: checkSummary(item.checks) } : {}),
        itemId: item.itemId,
        category: item.category,
        url: item.url,
        status: item.status,
        selected: item.selected,
        basis: item.basis,
        targetSource: item.targetSource,
        reasonCode: item.reasonCode,
        detail: item.detail,
        evidenceRefs: item.evidenceRefs,
        ruleRevision: item.ruleRevision,
        parentNavigation: item.parentNavigation,
      })),
      gaps: scope.completionGaps().map((gap) => ({
        itemId: gap.itemId,
        category: gap.category,
        status: gap.status,
        reason: gap.reason,
        reasonCode: gap.reasonCode,
      })),
      candidates: snapshot.candidates,
      unsupported: snapshot.unsupported.map((u) => ({
        dimension: u.dimension,
        reasonCode: u.reasonCode,
      })),
    },
    proof,
    proofVerified,
    finishReasonCode,
    interventions,
  }
}
