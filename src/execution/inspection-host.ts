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
    /** Executor-only proof of the same connected DOM node, never a text/selector match. */
    continuedItemId?: string
    /** Public affordance key for sampling quota ONLY; never proves node/evidence identity. */
    samplingKey?: string
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
  const samplingKeys = new Map<string, string>()
  const recordedBindings = new Set<string>()
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
    const leavingItems = new Set((offeredBySnapshot.get(pageId) ?? []).map((c) => c.itemId))
    for (const item of items())
      if (
        (item.pageId === pageId || leavingItems.has(item.itemId)) &&
        item.selected &&
        item.status === 'pending'
      )
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
      return item?.pageId !== pageId && !leavingItems.has(candidate.itemId)
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
      const previous = items().find((item) => item.itemId === candidate.continuedItemId)
      const continued =
        previous?.status === 'pending' &&
        previous.category === candidate.category &&
        previous.url === input.url &&
        (!candidate.samplingKey || samplingKeys.get(previous.itemId) === candidate.samplingKey)
      const item = continued
        ? previous
        : create({
            category: candidate.category,
            basis: `observed candidate: ${candidate.description}`,
            targetSource: 'executor',
            selected: false,
          })
      samplingKeys.set(item.itemId, candidate.samplingKey ?? item.itemId)
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
    for (const candidate of candidates) {
      const item = items().find((item) => item.itemId === candidate.itemId)!
      if (!recordedBindings.has(item.itemId)) {
        await options.appendEvent(
          'scope:candidate-bound',
          {
            itemId: item.itemId,
            snapshotId: candidate.snapshotId,
            ref: candidate.ref,
            samplingKey: samplingKeys.get(item.itemId),
            quotaOnly: true,
          },
          { evidenceRefs: [...input.evidenceRefs] },
        )
        recordedBindings.add(item.itemId)
      }
      if (item.pageId !== candidate.snapshotId)
        await options.appendEvent(
          'scope:candidate-reobserved',
          {
            itemId: item.itemId,
            originalSnapshotId: item.pageId,
            snapshotId: candidate.snapshotId,
            ref: candidate.ref,
            basis: 'same-connected-node',
          },
          { evidenceRefs: [...input.evidenceRefs] },
        )
    }
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
    samplingKey?: string
  }) {
    const item = create({
      category: input.category ?? 'local-interaction',
      basis: `${input.basis}: ${input.target}`,
      targetSource: 'executor',
    })
    samplingKeys.set(item.itemId, input.samplingKey ?? item.itemId)
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
   * Only an exact ref in its recorded observation can discharge an existing obligation.
   * Role/selector actions without that binding remain separate measurements.
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
    const offered = input.snapshotId ? (offeredBySnapshot.get(input.snapshotId) ?? []) : candidates
    const byRef = input.ref ? offered.find((c) => c.ref === input.ref) : undefined
    // Never guess identity from the number of pending checks. A stale ref is not a match.
    const matched = byRef?.category === input.category ? byRef : undefined
    if (matched && items().find((i) => i.itemId === matched.itemId)?.status === 'pending') {
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
      samplingKey: matched ? samplingKeys.get(matched.itemId) : undefined,
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
    for (const entry of entries) {
      const item = items().find((i) => i.itemId === entry.itemId)
      if (
        item?.category === 'local-interaction' &&
        !item.selected &&
        !sampledKeys(item.url).has(samplingKeys.get(item.itemId) ?? item.itemId) &&
        sampledKeys(item.url).size >= 3
      )
        throw Error('local-interaction-sampling-cap')
      scope.selectItem(entry.itemId, entry.basis)
    }
    scope.syncSelection(entries)
    await persist()
    return entries.map((entry) => scope.snapshot().items.find((i) => i.itemId === entry.itemId)!)
  }

  const sampledKeys = (url: string) =>
    new Set(
      items()
        .filter((i) => i.selected && i.category === 'local-interaction' && i.url === url)
        .map((i) => samplingKeys.get(i.itemId) ?? i.itemId),
    )
  function assertMayNavigate(destination: string) {
    const current = options.currentUrl()
    normalizePageUrl(destination) // Validate the navigation target without changing route identity.
    const pending = items().filter(
      (item) =>
        item.selected &&
        item.status === 'pending' &&
        item.category === 'local-interaction' &&
        normalizePageUrl(item.url) === normalizePageUrl(current),
    )
    if (pending.length)
      throw Error(
        `pending-local-checks-before-navigation: no action dispatched. Resolve selected local checks before leaving this document, or finish partial: ${pending.map((item) => item.itemId).join(', ')}`,
      )
  }
  const localSampling = () => {
    const selected = sampledKeys(options.currentUrl()).size
    return {
      unit: 'distinct-public-controls',
      limit: 3,
      selected,
      remaining: Math.max(0, 3 - selected),
    }
  }

  function assertActionSelectable(ref: string, snapshotId: string, local = false) {
    const candidate = offeredBySnapshot.get(snapshotId)?.find((c) => c.ref === ref)
    if (!candidate) {
      if (local && !localSampling().remaining)
        throw Error('local-interaction-sampling-cap: no action dispatched; finish existing checks')
      return
    }
    if (candidate.category !== 'local-interaction') return
    const item = items().find((i) => i.itemId === candidate.itemId)
    if (
      item &&
      !sampledKeys(item.url).has(samplingKeys.get(item.itemId) ?? item.itemId) &&
      !localSampling().remaining
    )
      throw Error('local-interaction-sampling-cap: no action dispatched; finish existing checks')
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
    selectedCandidates: () =>
      [...offeredBySnapshot.values()]
        .flat()
        .filter((candidate) =>
          items().some(
            (item) =>
              item.itemId === candidate.itemId && item.selected && item.status === 'pending',
          ),
        ),
    localSampling,
    assertActionSelectable,
    assertMayNavigate,
    completionFacts,
    snapshot: (): InspectionScopeSnapshot => scope.snapshot(),
    completionGaps: () => scope.completionGaps(),
    events: () => scope.events(),
    scopeEventIds: () => [...scopeEventIds],
    flush: persist,
  }
}

export type InspectionHost = ReturnType<typeof createInspectionHost>
