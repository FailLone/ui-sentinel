import {
  createInspectionScope,
  type CreateItemInput,
  type InspectionCategory,
  type InspectionGap,
  type InspectionItem,
  type InspectionScope,
  type InspectionScopeSnapshot,
} from '../inspection/scope.ts'
import type { RunEvent } from '../shared/types.ts'
import { normalizePageUrl } from '../inspection/navigation-scope.ts'

/**
 * The executor-owned inspection ledger of one `ui-scan` run (plan 5.2, 8/B2).
 *
 * `inspection/scope.ts` holds the ledger's rules; this module is the *authorship boundary* between
 * the executor and the agent. Two surfaces exist and they are deliberately different sizes:
 *
 * - The executor records what actually happened - an observation with saved evidence, a rule verdict,
 *   a dispatched interaction, a navigation that landed - and each one creates or resolves an item.
 * - The agent selects among items that were really created, records gaps it genuinely has, and
 *   nothing else. It cannot mark work verified, cannot exclude an item, and an empty update cannot
 *   clear an obligation the executor owns.
 *
 * Keeping that boundary in its own module is what stops the executor's tool bodies from each having
 * an opinion about the ledger, and it is what makes the boundary testable without a browser.
 */

/** How many candidates the sampler is offered. The rest are counted, not silently dropped. */
export const MAX_CANDIDATE_ITEMS = 8

/** Reasons the executor may exclude an item. A model never supplies one of these. */
export const EXCLUSION_REASONS = [
  'sampling-cap',
  'unsupported-dimension',
  'not-applicable-fact',
] as const
export type ExclusionReason = (typeof EXCLUSION_REASONS)[number]

export interface CandidateItem {
  readonly itemId: string
  readonly ref: string
  readonly description: string
  readonly category: InspectionCategory
  /** The observation that offered this ref; a ref only means something while that document is shown. */
  readonly snapshotId: string
}

export interface InspectionHostOptions {
  readonly runId: string
  readonly entryUrl: string
  readonly goal: string
  /** The current snapshot id, so an item names the observation it belongs to. */
  readonly currentSnapshotId: () => string | undefined
  readonly currentUrl: () => string
  readonly currentObservationVersion: () => string | undefined
  readonly appendEvent: (
    type: string,
    payload: Record<string, unknown>,
    extra?: { stepId?: string; actionId?: string; evidenceRefs?: string[] },
  ) => Promise<RunEvent>
}

export interface RecordObservationInput {
  readonly url: string
  readonly evidenceRefs: readonly string[]
  readonly candidateDetail: string
  readonly candidateCategories: readonly InspectionCategory[]
  readonly candidateItems?: readonly {
    ref: string
    description: string
    category: InspectionCategory
  }[]
}

export interface CompletionFacts {
  readonly entryObserved: boolean
  readonly entryEvidenceRefs: readonly string[]
  readonly gaps: readonly InspectionGap[]
  readonly unsupportedRecorded: readonly string[]
  readonly scopeEventIds: readonly string[]
}

export function createInspectionHost(options: InspectionHostOptions) {
  const scope: InspectionScope = createInspectionScope({
    goal: options.goal,
    entryUrl: options.entryUrl,
  })
  let candidates: readonly CandidateItem[] = []
  /** Candidate refs from each observation, so an action's ref resolves against the snapshot it named. */
  const offeredBySnapshot = new Map<string, readonly CandidateItem[]>()
  /** Ids of the ledger events this run actually persisted, in order. */
  const scopeEventIds: string[] = []
  /** How many of the ledger's own events have already been written; the rest are pending. */
  let persistedCount = 0

  /**
   * Write the ledger events that have not reached the database yet.
   *
   * The counter is what keeps this honest under interleaving: several tools can run between two
   * writes, and re-sending an event would both duplicate a scope item in a projection and inflate the
   * event tail a completion check walks. Serialization is the executor's job, so this only has to be
   * correct per call.
   */
  const persist = async (): Promise<void> => {
    const pending = scope.events().slice(persistedCount)
    for (const event of pending) {
      const saved = await options.appendEvent(event.type, event.payload)
      scopeEventIds.push(saved.id)
      persistedCount++
    }
  }

  /** The identity every executor-created item carries: which page, which observation, which url. */
  const identity = () => ({
    pageId: options.currentSnapshotId() ?? 's0',
    stateId: options.currentSnapshotId() ?? 's0',
    url: options.currentUrl(),
    observationVersion: options.currentObservationVersion() ?? 'unobserved',
  })

  function create(
    input: Omit<CreateItemInput, 'pageId' | 'stateId' | 'url' | 'observationVersion'>,
  ) {
    return scope.createItem({ ...identity(), ...input })
  }

  const items = () => scope.snapshot().items
  const find = (category: InspectionCategory) => items().filter((i) => i.category === category)

  /** Close the envelope on a document: any selected item still pending is honestly unverified. */
  async function leavePage(pageId: string): Promise<void> {
    for (const item of items())
      if (item.pageId === pageId && item.selected && item.status === 'pending')
        scope.resolveItem(item.itemId, {
          status: 'unverified',
          reasonCode: 'navigation-left-target',
          evidenceRefs: [],
          eventIds: [],
          detail: 'the run navigated away before this item concluded',
        })
    // The candidates of the document being left stop being selectable refs: their `ref` only means
    // something while that document is displayed, so keeping them offered would let the sampler choose
    // a target that is no longer on screen. Selected items stay as obligations.
    candidates = candidates.filter((candidate) => {
      const item = items().find((i) => i.itemId === candidate.itemId)
      return item?.pageId !== pageId
    })
    await persist()
  }

  /**
   * Record that the entry document was reached, and what the observation actually offered.
   *
   * The observation item is created *and* resolved here because the executor is the only party that
   * knows whether a readable snapshot and screenshot exist. No evidence means `unverified`, not a
   * silent pass - the completion decision refuses a covered claim on exactly that fact (plan 6.2.1).
   */
  async function recordObservation(input: RecordObservationInput) {
    const entry = create({
      category: 'entry-observation',
      basis: 'the entry document was navigated and observed',
      targetSource: 'executor',
    })
    scope.resolveItem(
      entry.itemId,
      input.evidenceRefs.length
        ? {
            status: 'verified',
            evidenceRefs: [...input.evidenceRefs],
            eventIds: [],
            detail: `observed ${input.url}`,
          }
        : {
            status: 'unverified',
            reasonCode: 'entry-evidence-missing',
            evidenceRefs: [],
            eventIds: [],
            detail: 'the observation produced no readable snapshot or screenshot',
          },
    )

    // Candidate controls become real, unselected items. Being real is what makes the sampling
    // obligation concrete: the agent selects from these, and the ledger can tell "the page offered
    // an interaction" apart from "the agent said the page offered one".
    const offered = input.candidateItems ?? []
    const bounded = offered.slice(0, MAX_CANDIDATE_ITEMS)
    candidates = bounded.map((candidate) => {
      const item = create({
        category: candidate.category,
        basis: `observed candidate: ${candidate.description}`,
        targetSource: 'executor',
        selected: false,
      })
      return {
        itemId: item.itemId,
        ref: candidate.ref,
        description: candidate.description,
        category: candidate.category,
        snapshotId: identity().pageId,
      }
    })
    offeredBySnapshot.set(identity().pageId, candidates)
    await persist()
    scope.recordCandidates({
      categories: [...input.candidateCategories],
      detail: input.candidateDetail,
      truncated: Math.max(0, offered.length - bounded.length),
    })
    await persist()
  }

  /**
   * Resolve an automatic rule check by its verdict.
   *
   * A `pass` and a `fail` are both *completed measurements*; only `unknown` leaves an unfinished
   * obligation, and it keeps the rule's own reason code so the report can say why.
   *
   * The one exception is an `unknown` the rule itself attributes to *this run's contract having
   * nothing for it to judge* - a general site declares no performance requirement (plan 7). Plan 5.2
   * lists that as a recorded unchecked dimension rather than an obligation, so it is recorded as an
   * unsupported dimension and does not hold a bounded completion open. The reason is not lost: it is
   * in the item's own reason code and in the run's unsupported list.
   */
  async function recordAutomaticCheck(input: {
    ruleId: string
    revision: string
    verdict: 'pass' | 'fail' | 'unknown' | 'not-applicable'
    evidenceRefs: readonly string[]
    detail?: string
    unchecked?: { reasonCode: string }
  }) {
    const item = create({
      category: 'automatic-check',
      basis: `automatic rule ${input.ruleId} applies to the observed state`,
      targetSource: 'executor',
      ruleRevision: input.revision,
      // A check that was reached but that this contract gives nothing to judge is recorded, not
      // selected: it is a limit of this run rather than part of the scope it promised to cover.
      selected: !input.unchecked,
    })
    const detail = input.detail ?? `${input.ruleId} verdict: ${input.verdict}`
    if (input.verdict === 'pass')
      scope.resolveItem(item.itemId, {
        status: 'verified',
        evidenceRefs: [...input.evidenceRefs],
        eventIds: [],
        detail,
      })
    else if (input.verdict === 'fail')
      scope.resolveItem(item.itemId, {
        status: 'failed',
        evidenceRefs: [...input.evidenceRefs],
        eventIds: [],
        detail,
      })
    else if (input.verdict === 'not-applicable')
      scope.resolveItem(item.itemId, {
        status: 'excluded',
        reasonCode: 'not-applicable-fact',
        evidenceRefs: [...input.evidenceRefs],
        eventIds: [],
        detail,
      })
    else
      scope.resolveItem(item.itemId, {
        status: 'unverified',
        reasonCode: input.unchecked?.reasonCode ?? 'rule-unknown',
        evidenceRefs: [...input.evidenceRefs],
        eventIds: [],
        detail,
      })
    if (input.unchecked)
      scope.recordUnsupported({
        dimension: input.ruleId,
        reasonCode: input.unchecked.reasonCode,
      })
    await persist()
    return item
  }

  async function recordInteraction(input: {
    target: string
    basis: string
    url: string
    evidenceRefs: readonly string[]
    outcome: 'verified' | 'failed' | 'unverified'
    reasonCode?: string
    detail?: string
    category?: 'local-interaction' | 'navigation'
  }) {
    const item = create({
      category: input.category ?? 'local-interaction',
      basis: `${input.basis}: ${input.target}`,
      targetSource: 'executor',
    })
    scope.resolveItem(item.itemId, {
      status: input.outcome,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      evidenceRefs: [...input.evidenceRefs],
      eventIds: [],
      detail: input.detail ?? `${input.target} at ${input.url}`,
    })
    await persist()
    return items().find((i) => i.itemId === item.itemId)
  }

  /**
   * Resolve the ledger item an action actually acted on.
   *
   * This is the seam that turns a dispatched action into scope, and the linkage is resolved here in
   * three steps, most specific first:
   *
   * 1. The ref the action named. A model that quotes an element ref is naming a target of one
   *    observation, and that item is the one it acted on.
   * 2. The run's own outstanding obligation, when exactly one selected item in the action's category is
   *    still unresolved. An agent that used `role`/`name` - which is what the brief tells it to do -
   *    still performed the interaction it declared, and requiring it to also quote a ref would mean a
   *    run could never conclude the check it plainly did. The match is only made when it is
   *    unambiguous; with several candidates outstanding the action is recorded as its own item rather
   *    than attributed to a guess.
   * 3. Otherwise the action is recorded as an honest item of its own, resolved by the outcome it
   *    reports.
   */
  async function resolveInteraction(input: {
    ref: string
    target: string
    url: string
    evidenceRefs: readonly string[]
    outcome: 'verified' | 'failed' | 'unverified'
    reasonCode?: string
    detail?: string
    /** The kind of check this action performed; a link or a `navigate` is a navigation. */
    category: 'local-interaction' | 'navigation'
    /** The observation whose ref list the target was read from. */
    snapshotId?: string
  }) {
    const offered = input.snapshotId
      ? (offeredBySnapshot.get(input.snapshotId) ?? candidates)
      : candidates
    const byRef = input.ref ? offered.find((c) => c.ref === input.ref) : undefined
    const outstanding = items().filter(
      (i) => i.selected && i.status === 'pending' && i.category === input.category,
    )
    const matched =
      byRef ?? (outstanding.length === 1 ? { itemId: outstanding[0]!.itemId } : undefined)
    if (matched) {
      const current = items().find((i) => i.itemId === matched.itemId)
      if (current && !current.selected)
        await selectItems([{ itemId: matched.itemId, basis: input.target }])
      scope.resolveItem(matched.itemId, {
        status: input.outcome,
        ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
        evidenceRefs: [...input.evidenceRefs],
        eventIds: [],
        detail: input.detail ?? `${input.target} at ${input.url}`,
        // A link's item is created when the run is *offered* the link; the address it actually landed
        // on is only known afterwards, so it is written at resolution.
        ...(input.category === 'navigation' ? { url: input.url } : {}),
      })
      await persist()
      return items().find((i) => i.itemId === matched.itemId)
    }
    return recordInteraction({
      target: input.target,
      basis: 'executed target',
      url: input.url,
      evidenceRefs: input.evidenceRefs,
      outcome: input.outcome,
      reasonCode: input.reasonCode,
      detail: input.detail,
      category: input.category,
    })
  }

  async function recordNavigation(input: {
    url: string
    from: string
    evidenceRefs: readonly string[]
    outcome: 'verified' | 'failed' | 'unverified'
    reasonCode?: string
    detail?: string
  }) {
    const item = create({
      category: 'navigation',
      basis: `same-origin navigation from ${input.from} to ${input.url}`,
      targetSource: 'executor',
      parentNavigation: input.from,
    })
    scope.resolveItem(item.itemId, {
      status: input.outcome,
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      evidenceRefs: [...input.evidenceRefs],
      eventIds: [],
      detail: input.detail ?? `landed at ${input.url}`,
      // The item is created when the run is offered a destination; the address it actually landed on
      // is known only when the browser comes back, so it is written at resolution.
      url: input.url,
    })
    await persist()
    return items().find((i) => i.itemId === item.itemId)
  }

  /** Record a navigation the boundary refused: an unverified item, since the destination was never measured. */
  async function recordNavigationDenied(input: { url: string; reasonCode: string }) {
    const item = create({
      category: 'navigation',
      basis: `navigation to ${input.url} was not permitted by this run's policy`,
      targetSource: 'executor',
      selected: false,
    })
    scope.resolveItem(item.itemId, {
      status: 'unverified',
      reasonCode: input.reasonCode,
      evidenceRefs: [],
      eventIds: [],
      detail: `not visited: ${input.reasonCode}`,
    })
    await persist()
    return item
  }

  /** Record a dimension this release cannot measure, so it is reported rather than silently absent. */
  async function recordUnsupported(dimension: string, reasonCode: string) {
    const entry = scope.recordUnsupported({ dimension, reasonCode })
    await persist()
    return entry
  }

  /** Record the agent's own honestly-unfinished work as an unverified item with its reason. */
  async function recordGap(input: { reasonCode: string; detail: string; url?: string }) {
    const item = scope.recordGap({
      ...identity(),
      ...(input.url ? { url: input.url } : {}),
      category: 'investigation',
      basis: input.detail,
      targetSource: 'agent',
      reasonCode: input.reasonCode,
      detail: input.detail,
    })
    await persist()
    return item
  }

  /**
   * Apply the agent's selections.
   *
   * An empty update is explicitly inert rather than a clear: the obligation belongs to the executor,
   * and a model that never calls this tool still has to answer for the sampling the plan requires.
   */
  async function selectItems(entries: readonly { itemId: string; basis: string }[]) {
    for (const entry of entries) scope.selectItem(entry.itemId, entry.basis)
    scope.syncSelection(entries)
    await persist()
    return entries.map((entry) => scope.snapshot().items.find((i) => i.itemId === entry.itemId)!)
  }

  /**
   * Exclude an item. Executor-only, by construction: the reason must be one of the frozen boundaries,
   * and the agent's tool surface never reaches this function.
   */
  async function excludeItem(itemId: string, reason: string) {
    if (!(EXCLUSION_REASONS as readonly string[]).includes(reason))
      throw new Error(
        `Cannot exclude an item without a frozen-boundary reason (${EXCLUSION_REASONS.join(', ')}).`,
      )
    const item = scope.resolveItem(itemId, {
      status: 'excluded',
      reasonCode: reason,
      evidenceRefs: [],
      eventIds: [],
      detail: `excluded by the executor: ${reason}`,
    })
    await persist()
    return item
  }

  /** The bounded candidate list the sampler may choose from. */
  const candidateItems = (): readonly CandidateItem[] => candidates

  /**
   * The facts a completion decision is made from.
   *
   * Everything here is derived from the ledger rather than passed in by the caller, so a run cannot
   * assemble a favourable set of facts for its own finish request.
   */
  function completionFacts(): CompletionFacts {
    const snapshot = scope.snapshot()
    const entry = snapshot.items.filter((i) => i.category === 'entry-observation')
    const resolved = entry.filter((i) => i.status === 'verified' || i.status === 'failed')
    return {
      entryObserved: entry.length > 0,
      entryEvidenceRefs: resolved.flatMap((i) => i.evidenceRefs),
      gaps: scope.completionGaps(),
      unsupportedRecorded: snapshot.unsupported.map((u) => u.dimension),
      scopeEventIds: [...scopeEventIds],
    }
  }

  return {
    /** The underlying ledger, for the completion decision and the report projection. */
    scope,
    recordObservation,
    recordAutomaticCheck,
    recordInteraction,
    resolveInteraction,
    recordNavigation,
    recordNavigationDenied,
    recordUnsupported,
    recordGap,
    selectItems,
    excludeItem,
    leavePage,
    candidateItems,
    completionFacts,
    snapshot: (): InspectionScopeSnapshot => scope.snapshot(),
    completionGaps: () => scope.completionGaps(),
    events: () => scope.events(),
    scopeEventIds: () => [...scopeEventIds],
  }
}

export type InspectionHost = ReturnType<typeof createInspectionHost>
