import { createHash } from 'node:crypto'
import type { RunKind } from './run-kind.ts'
import type { InspectionItem, InspectionScope } from './scope.ts'

/**
 * The UI completion decision and its persisted proof (plan 6.2, 6.3).
 *
 * The model asks to finish and names a reason; this module decides whether the facts on hand make
 * that reason true. It is a pure function over a fact bundle so the same check runs at finish time,
 * in the completion verifier and in tests - there is no second, weaker path.
 *
 * Two of the reasons are about *ending*, not about *quality*: a run that measured a defect has
 * covered its scope and completes, and only an unfinished obligation or an inadmissible page state
 * holds completion back. The proof it returns is hashed so a report can show that the terminal row
 * and the scope it claims came from one decision.
 */

export const INSPECTION_PROOF_VERSION = 'inspection-proof-2' as const

export type InspectionReason = 'scope-covered' | 'observed-blocker' | 'unverified-scope'

export type CompletionRefusal =
  | 'url-scan-disabled'
  | 'not-a-ui-scan'
  | 'contract-unverified'
  | 'entry-not-observed'
  | 'entry-evidence-missing'
  | 'evidence-intervened'
  | 'rules-pending'
  | 'hypotheses-open'
  | 'scope-incomplete'
  | 'no-unverified-scope'
  | 'blocker-unsubstantiated'

export interface InspectionProof {
  readonly version: typeof INSPECTION_PROOF_VERSION
  readonly kind: 'ui-scan'
  readonly claim: InspectionReason
  readonly outcome: 'goal-reached' | 'blocked'
  readonly contractHash: string
  readonly scopeDigest: string
  readonly specDigest: string
  readonly items: readonly Pick<
    InspectionItem,
    'itemId' | 'category' | 'status' | 'reasonCode' | 'evidenceRefs' | 'basis'
  >[]
  readonly counts: {
    readonly total: number
    readonly verified: number
    readonly failed: number
    readonly unverified: number
    readonly excluded: number
  }
  readonly unsupported: readonly string[]
  readonly decidedAt: string
  readonly hash: string
}

export interface InspectionCompletionFacts {
  readonly kind: RunKind
  readonly featureEnabled: boolean
  readonly spec?: unknown
  readonly contractValid: boolean
  readonly contractHash: string
  readonly entryObserved: boolean
  readonly entryEvidenceRefs: readonly string[]
  readonly integrityEpoch: number
  readonly scope: InspectionScope
  /** Ids of the scope events this run persisted; a covered claim must cite at least one. */
  readonly scopeEventIds: readonly string[]
  readonly pendingRules: number
  readonly openHypotheses: number
  readonly unsupportedRecorded: readonly string[]
  /** Measured blocking facts, e.g. a navigation or tool failure with its error. */
  readonly blockerEvidence?: readonly string[]
}

export interface InspectionCompletionDecision {
  readonly accepted: boolean
  readonly outcome: 'goal-reached' | 'blocked' | 'rejected'
  readonly reasonCode: InspectionReason | CompletionRefusal
  readonly missingFacts?: readonly string[]
  readonly missingItems?: readonly string[]
  readonly partialAdvice?: {
    readonly reason: 'unverified-scope'
    readonly gaps: readonly string[]
    readonly missingItems: readonly string[]
  }
  readonly proof?: InspectionProof
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export function proofDigest(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex')
}

function buildProof(input: {
  spec?: unknown
  claim: InspectionReason
  outcome: 'goal-reached' | 'blocked'
  contractHash: string
  scope: InspectionScope
  unsupported: readonly string[]
}): InspectionProof {
  const snapshot = input.scope.snapshot()
  const items = snapshot.items.map((item) => ({
    itemId: item.itemId,
    category: item.category,
    status: item.status,
    reasonCode: item.reasonCode,
    evidenceRefs: item.evidenceRefs,
    basis: item.basis,
  }))
  const body = {
    version: INSPECTION_PROOF_VERSION,
    kind: 'ui-scan' as const,
    claim: input.claim,
    outcome: input.outcome,
    contractHash: input.contractHash,
    scopeDigest: proofDigest({
      items: snapshot.items,
      candidates: snapshot.candidates,
      unsupported: snapshot.unsupported,
    }),
    specDigest: proofDigest(input.spec ?? null),
    items,
    counts: {
      total: snapshot.counts.total,
      verified: snapshot.counts.verified,
      failed: snapshot.counts.failed,
      unverified: snapshot.counts.unverified,
      excluded: snapshot.counts.excluded,
    },
    unsupported: [...input.unsupported],
    decidedAt: new Date().toISOString(),
  }
  return { ...body, hash: createHash('sha256').update(canonical(body)).digest('hex') }
}

export function verifyInspectionProof(proof: InspectionProof | null | undefined): boolean {
  if (!proof || typeof proof !== 'object') return false
  if (proof.version !== INSPECTION_PROOF_VERSION) return false
  const { hash, ...body } = proof
  if (typeof hash !== 'string') return false
  return createHash('sha256').update(canonical(body)).digest('hex') === hash
}

/**
 * Decide whether the claimed reason is supported.
 *
 * The refusal path always carries a usable partial suggestion, because the plan requires an honest
 * partial ending to remain available - a run refused a covered claim is not left with no way to
 * finish, only with no way to finish *as covered*.
 */
export function decideInspectionCompletion(input: {
  reason: InspectionReason
  facts: InspectionCompletionFacts
}): InspectionCompletionDecision {
  const { facts, reason } = input
  if (facts.kind !== 'ui-scan')
    return { accepted: false, outcome: 'rejected', reasonCode: 'not-a-ui-scan' }
  if (!facts.featureEnabled)
    return { accepted: false, outcome: 'rejected', reasonCode: 'url-scan-disabled' }

  const gaps = facts.scope.completionGaps()
  const gapText = [
    ...gaps.map((g) => `${g.category}:${g.reason}`),
    ...facts.scope.snapshot().unsupported.map((u) => `unsupported:${u.dimension}`),
    ...(facts.integrityEpoch > 0
      ? ['intervention: browser state is not admissible for a site verdict']
      : []),
  ]
  const missingItems = gaps.map((g) => g.itemId)

  if (reason === 'observed-blocker') {
    // A blocker is a measured fact, not a quality finding: an ordinary defect that does not stop the
    // next check does not make the run blocked.
    if (!facts.blockerEvidence?.length)
      return {
        accepted: false,
        outcome: 'rejected',
        reasonCode: 'blocker-unsubstantiated',
        missingFacts: ['observed-blocker requires a measured navigation, page or tool failure'],
        partialAdvice: {
          reason: 'unverified-scope',
          gaps: gapText.length ? gapText : ['blocker-unsubstantiated'],
          missingItems,
        },
      }
    return {
      accepted: true,
      outcome: 'blocked',
      reasonCode: 'observed-blocker',
      proof: buildProof({
        spec: facts.spec,
        claim: reason,
        outcome: 'blocked',
        contractHash: facts.contractHash,
        scope: facts.scope,
        unsupported: facts.unsupportedRecorded,
      }),
    }
  }

  if (reason === 'unverified-scope') {
    // A partial ending needs something to be partial *about*. An unfinished obligation, an
    // unsupported dimension the run actually recorded, or a state the executor cannot vouch for all
    // qualify; a fully covered run asking to be reported as incomplete does not.
    const partialAbout = [
      ...gapText,
      ...facts.unsupportedRecorded.map((dimension) => `unsupported:${dimension}`),
    ]
    if (partialAbout.length === 0)
      return {
        accepted: false,
        outcome: 'rejected',
        reasonCode: 'no-unverified-scope',
        missingFacts: [
          'unverified-scope was requested but no obligation or unsupported dimension remains',
        ],
      }
    return {
      accepted: true,
      outcome: 'blocked',
      reasonCode: 'unverified-scope',
      proof: buildProof({
        spec: facts.spec,
        claim: reason,
        outcome: 'blocked',
        contractHash: facts.contractHash,
        scope: facts.scope,
        unsupported: facts.unsupportedRecorded,
      }),
    }
  }

  // scope-covered: the six conditions of plan 6.2, in the order a reader would check them.
  const refusals: { reasonCode: CompletionRefusal; missingFacts: string[] }[] = []
  if (!facts.contractValid)
    refusals.push({
      reasonCode: 'contract-unverified',
      missingFacts: ['the UI contract does not verify'],
    })
  if (!facts.entryObserved)
    refusals.push({
      reasonCode: 'entry-not-observed',
      missingFacts: ['the entry document was never navigated and observed'],
    })
  else if (facts.entryEvidenceRefs.length === 0)
    refusals.push({
      reasonCode: 'entry-evidence-missing',
      missingFacts: ['the entry observation has no readable snapshot or screenshot'],
    })
  if (facts.integrityEpoch > 0)
    refusals.push({
      reasonCode: 'evidence-intervened',
      missingFacts: [
        'the executor blocked a request or closed a page; the browser state cannot establish a site result',
      ],
    })
  if (facts.pendingRules > 0)
    refusals.push({
      reasonCode: 'rules-pending',
      missingFacts: [`${facts.pendingRules} applicable automatic rule check(s) not yet executed`],
    })
  if (facts.openHypotheses > 0)
    refusals.push({
      reasonCode: 'hypotheses-open',
      missingFacts: [
        `${facts.openHypotheses} applicable hypothesis/hypotheses remain open or inconclusive`,
      ],
    })
  if (facts.scopeEventIds.length === 0)
    refusals.push({
      reasonCode: 'scope-incomplete',
      missingFacts: [
        'no inspection scope events were recorded; an empty queue is not proof of coverage',
      ],
    })
  if (missingItems.length > 0)
    refusals.push({
      reasonCode: 'scope-incomplete',
      missingFacts: gapText,
    })

  if (refusals.length) {
    const [first] = refusals
    return {
      accepted: false,
      outcome: 'rejected',
      reasonCode: first!.reasonCode,
      missingFacts: refusals.flatMap((r) => r.missingFacts),
      missingItems,
      partialAdvice: {
        reason: 'unverified-scope',
        gaps: gapText.length ? gapText : refusals.flatMap((r) => r.missingFacts),
        missingItems,
      },
    }
  }

  return {
    accepted: true,
    outcome: 'goal-reached',
    reasonCode: 'scope-covered',
    proof: buildProof({
      spec: facts.spec,
      claim: reason,
      outcome: 'goal-reached',
      contractHash: facts.contractHash,
      scope: facts.scope,
      unsupported: facts.unsupportedRecorded,
    }),
  }
}
