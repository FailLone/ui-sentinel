import { randomUUID } from 'node:crypto'
import type { RunEvent } from '../shared/types.ts'

/**
 * The bounded inspection ledger of one `ui-scan` run (plan 5.2).
 *
 * This is the authoritative record of *what was checked*, and it exists because none of the cheaper
 * signals answer that question: an empty rule queue, a successful tool call and the model saying it
 * is finished are all compatible with having inspected nothing.
 *
 * Authorship is the whole design. The executor creates items and resolves them from saved tool
 * receipts. The model may select among items that were actually created and record gaps; it cannot
 * mark its own work verified, drop an obligation, or exclude an item it finds inconvenient. Nothing
 * is dropped without a reason code, and an unverified item stays in the snapshot rather than being
 * deleted, so a partial run reports a partial run.
 */

export const INSPECTION_CATEGORIES = [
  'entry-observation',
  'automatic-check',
  'local-interaction',
  'navigation',
  'investigation',
] as const
export type InspectionCategory = (typeof INSPECTION_CATEGORIES)[number]

export type InspectionStatus = 'pending' | 'verified' | 'failed' | 'unverified' | 'excluded'

export const INSPECTION_SCOPE_EVENT = 'scope:item-created' as const
export const INSPECTION_SCOPE_UPDATE_EVENT = 'scope:item-updated' as const
export const INSPECTION_SCOPE_SUMMARY_EVENT = 'inspection:summary' as const

export interface InspectionItem {
  readonly itemId: string
  readonly category: InspectionCategory
  readonly pageId: string
  readonly stateId: string
  readonly url: string
  /** The document/observation version this item was created against. */
  readonly observationVersion: string
  readonly documentVersion: string
  readonly basis: string
  readonly targetSource: 'executor' | 'agent'
  readonly selected: boolean
  readonly selectionBasis: string | null
  readonly status: InspectionStatus
  readonly reasonCode: string | null
  readonly detail: string | null
  readonly evidenceRefs: readonly string[]
  readonly eventIds: readonly string[]
  readonly ruleRevision: string | null
  readonly parentNavigation: string | null
  readonly createdAt: string
  readonly resolvedAt: string | null
}

export interface InspectionCandidateSummary {
  readonly categories: readonly InspectionCategory[]
  readonly detail: string
  readonly truncated: number
  readonly observedAt: string
}

export interface InspectionUnsupported {
  readonly dimension: string
  readonly reasonCode: string
  readonly observedAt: string
}

/** A selected item still outstanding at finish time. */
export interface InspectionGap {
  readonly itemId: string
  readonly category: InspectionCategory
  readonly status: InspectionStatus
  readonly reason: string
  readonly reasonCode: string | null
}

export interface InspectionScopeSnapshot {
  readonly goal: string
  readonly entryUrl: string
  readonly items: readonly InspectionItem[]
  readonly candidates: InspectionCandidateSummary | null
  readonly unsupported: readonly InspectionUnsupported[]
  readonly counts: {
    readonly total: number
    readonly selected: number
    readonly pending: number
    readonly verified: number
    readonly failed: number
    readonly unverified: number
    readonly excluded: number
  }
}

export interface CreateItemInput {
  readonly category: InspectionCategory
  readonly pageId: string
  readonly stateId: string
  readonly url: string
  readonly observationVersion: string
  readonly documentVersion?: string
  readonly basis: string
  readonly targetSource: 'executor' | 'agent'
  readonly ruleRevision?: string
  readonly parentNavigation?: string | null
  readonly selected?: boolean
  readonly selectionBasis?: string
}

export interface ResolveItemInput {
  readonly status: Exclude<InspectionStatus, 'pending'>
  readonly reasonCode?: string
  readonly evidenceRefs: readonly string[]
  readonly eventIds: readonly string[]
  readonly detail: string
  /**
   * The address the item was executed against, when that is only known at resolution time.
   *
   * A navigation is the case this exists for: the item is created when the run is *offered* a link,
   * and the address it actually landed on comes back from the browser afterwards. Recording it here
   * keeps one item per move rather than an offer item beside a landing item.
   */
  readonly url?: string
}

export interface RecordGapInput extends CreateItemInput {
  readonly reasonCode: string
  readonly detail: string
}

export interface ScopeEvent {
  readonly type:
    | typeof INSPECTION_SCOPE_EVENT
    | typeof INSPECTION_SCOPE_UPDATE_EVENT
    | typeof INSPECTION_SCOPE_SUMMARY_EVENT
  readonly payload: Record<string, unknown>
}

export interface InspectionScopeOptions {
  readonly goal?: string
  readonly entryUrl?: string
  /** Rebuilt state, installed without emitting events so a projection stays idempotent. */
  readonly initial?: {
    readonly items: readonly InspectionItem[]
    readonly candidates: InspectionCandidateSummary | null
    readonly unsupported: readonly InspectionUnsupported[]
  }
}

/**
 * A status that concludes a measurement.
 *
 * `failed` is a *completed* check that found a defect - the measurement happened, so it does not hold
 * completion back. Only `pending` and `unverified` are unfinished.
 */
function isComplete(status: InspectionStatus): boolean {
  return status === 'verified' || status === 'failed' || status === 'excluded'
}

export function createInspectionScope(options: InspectionScopeOptions = {}) {
  const goal = options.goal ?? ''
  const entryUrl = options.entryUrl ?? ''
  const items = new Map<string, InspectionItem>()
  let candidates: InspectionCandidateSummary | null = options.initial?.candidates ?? null
  const unsupported: InspectionUnsupported[] = [...(options.initial?.unsupported ?? [])]
  for (const item of options.initial?.items ?? []) items.set(item.itemId, item)
  const recorded: ScopeEvent[] = []
  const now = () => new Date().toISOString()

  const record = (event: ScopeEvent) => {
    recorded.push(event)
  }

  const apply = (item: InspectionItem) => {
    items.set(item.itemId, item)
  }

  function createItem(input: CreateItemInput): InspectionItem {
    if (!input.basis.trim())
      throw new Error(
        'An inspection item requires a basis: a claim of scope with no reason is not a check.',
      )
    const at = now()
    const item: InspectionItem = {
      itemId: `item-${randomUUID()}`,
      category: input.category,
      pageId: input.pageId,
      stateId: input.stateId,
      url: input.url,
      observationVersion: input.observationVersion,
      documentVersion: input.documentVersion ?? input.observationVersion,
      basis: input.basis,
      targetSource: input.targetSource,
      selected: input.selected ?? true,
      selectionBasis: input.selectionBasis ?? (input.selected === false ? null : input.basis),
      status: 'pending',
      reasonCode: null,
      detail: null,
      evidenceRefs: [],
      eventIds: [],
      ruleRevision: input.ruleRevision ?? null,
      parentNavigation: input.parentNavigation ?? null,
      createdAt: at,
      resolvedAt: null,
    }
    apply(item)
    record({ type: INSPECTION_SCOPE_EVENT, payload: { ...item } })
    return item
  }

  function resolveItem(itemId: string, input: ResolveItemInput): InspectionItem {
    const current = items.get(itemId)
    if (!current) throw new Error(`Cannot resolve an unknown item: ${itemId}`)
    if (input.status === 'verified' && input.evidenceRefs.length === 0)
      throw new Error(
        'A verified item requires at least one saved evidence reference; the executor resolves items from tool receipts.',
      )
    if (input.status === 'failed' && input.evidenceRefs.length === 0)
      throw new Error('A failed item requires saved evidence for the defect it records.')
    if (input.status === 'unverified' && !input.reasonCode?.trim())
      throw new Error(
        'An unverified item requires a reason code explaining why it was not verified.',
      )
    if (input.status === 'excluded' && !input.reasonCode?.trim())
      throw new Error(
        'An excluded item requires a reason code from a frozen boundary or sampling cap.',
      )
    const resolved: InspectionItem = {
      ...current,
      ...(input.url ? { url: input.url } : {}),
      status: input.status,
      reasonCode: input.reasonCode ?? null,
      detail: input.detail,
      evidenceRefs: [...input.evidenceRefs],
      eventIds: [...input.eventIds],
      resolvedAt: now(),
    }
    apply(resolved)
    record({
      type: INSPECTION_SCOPE_UPDATE_EVENT,
      payload: {
        itemId,
        status: resolved.status,
        reasonCode: resolved.reasonCode,
        detail: resolved.detail,
        evidenceRefs: resolved.evidenceRefs,
        eventIds: resolved.eventIds,
        ...(input.url ? { url: input.url } : {}),
        // Carried in the payload so a projection rebuilds the same item rather than guessing a time
        // from the delivery timestamp.
        resolvedAt: resolved.resolvedAt,
      },
    })
    return resolved
  }

  /**
   * Select an already-observed item as part of this run's obligation.
   *
   * There is deliberately no argument for `verified` or `status`: selection is a scope decision, and
   * only the executor concludes a measurement. `exclude` is not offered either - exclusion comes from
   * a frozen boundary, a sampling cap or a verifiable fact, so the model cannot clear an item by
   * declaring it out of scope.
   */
  function selectItem(
    itemId: string,
    basis: string,
    options?: { exclude?: boolean },
  ): InspectionItem {
    if (options?.exclude)
      throw new Error(
        'Items cannot be excluded by selection; exclusion is decided by the executor.',
      )
    const current = items.get(itemId)
    if (!current) throw new Error(`Cannot select an unknown item: ${itemId}`)
    if (isComplete(current.status) || current.status === 'unverified')
      throw new Error(`Cannot select an already resolved item: ${itemId}`)
    const updated: InspectionItem = {
      ...current,
      selected: true,
      selectionBasis: basis,
    }
    apply(updated)
    record({
      type: INSPECTION_SCOPE_UPDATE_EVENT,
      payload: { itemId, selected: true, selectionBasis: basis },
    })
    return updated
  }

  /** Record a gap the model genuinely has, as an unverified item with its own reason. */
  function recordGap(input: RecordGapInput): InspectionItem {
    if (!input.reasonCode.trim()) throw new Error('A recorded gap requires a reason code.')
    const item = createItem({ ...input, selected: true })
    return resolveItem(item.itemId, {
      status: 'unverified',
      reasonCode: input.reasonCode,
      evidenceRefs: [],
      eventIds: [],
      detail: input.detail,
    })
  }

  /**
   * Record the candidate controls the current observation actually offered.
   *
   * This is what makes "there was nothing to interact with" a fact rather than an assertion: the
   * summary - including how many candidates were truncated away - is the evidence the eventual
   * completion claim cites.
   */
  function recordCandidates(input: {
    categories: readonly InspectionCategory[]
    detail: string
    truncated?: number
  }): InspectionCandidateSummary {
    candidates = {
      categories: [...input.categories],
      detail: input.detail,
      truncated: input.truncated ?? 0,
      observedAt: now(),
    }
    record({ type: INSPECTION_SCOPE_UPDATE_EVENT, payload: { candidates: { ...candidates } } })
    return candidates
  }

  function recordUnsupported(input: {
    dimension: string
    reasonCode: string
  }): InspectionUnsupported {
    const entry = { ...input, observedAt: now() }
    if (!unsupported.some((u) => u.dimension === entry.dimension)) unsupported.push(entry)
    record({ type: INSPECTION_SCOPE_UPDATE_EVENT, payload: { unsupported: entry } })
    return entry
  }

  /**
   * The obligations a fresh `exploration_update` cannot clear.
   *
   * Two kinds are counted. Every selected item that never concluded is a gap, and a default sampling
   * obligation is a gap until an item of that category is *selected* - which is why an Agent that
   * never calls `selectItems` still has to answer for the interaction and navigation the plan
   * requires (plan 5.2). An observation that offered no candidate of that category discharges it.
   */
  function completionGaps(): InspectionGap[] {
    const gaps: InspectionGap[] = []
    for (const item of items.values())
      if (item.selected && (item.status === 'pending' || item.status === 'unverified'))
        gaps.push({
          itemId: item.itemId,
          category: item.category,
          status: item.status,
          reason:
            item.reasonCode ?? (item.status === 'pending' ? 'selected-not-resolved' : 'unverified'),
          reasonCode: item.reasonCode,
        })
    const offered = candidates?.categories ?? []
    const selectedCategory = (category: InspectionCategory) =>
      [...items.values()].some((i) => i.category === category && i.selected)
    for (const category of ['local-interaction', 'navigation'] as const)
      if (offered.includes(category) && !selectedCategory(category))
        gaps.push({
          itemId: `obligation:${category}`,
          category,
          status: 'pending',
          reason: `no-${category}-selected`,
          reasonCode: null,
        })
    return gaps
  }

  function syncSelection(_entries: readonly { itemId: string; basis: string }[]): void {
    // Selection is applied through `selectItem`. This exists so an empty model update is explicitly a
    // no-op on executor-owned obligations rather than a clear.
  }

  function snapshot(): InspectionScopeSnapshot {
    const all = [...items.values()]
    return {
      goal,
      entryUrl,
      items: all,
      candidates,
      unsupported: [...unsupported],
      counts: {
        total: all.length,
        selected: all.filter((i) => i.selected).length,
        pending: all.filter((i) => i.status === 'pending').length,
        verified: all.filter((i) => i.status === 'verified').length,
        failed: all.filter((i) => i.status === 'failed').length,
        unverified: all.filter((i) => i.status === 'unverified').length,
        excluded: all.filter((i) => i.status === 'excluded').length,
      },
    }
  }

  return {
    createItem,
    resolveItem,
    selectItem,
    recordGap,
    recordCandidates,
    recordUnsupported,
    completionGaps,
    syncSelection,
    snapshot,
    events: () => [...recorded],
  }
}

export type InspectionScope = ReturnType<typeof createInspectionScope>

/**
 * Rebuild a ledger from persisted events, so a report or a restart reads the scope the run actually
 * recorded rather than a re-derivation from today's state (plan 5.3, 6.3).
 *
 * An update naming an item that was never created is ignored: a truncated history cannot fabricate
 * scope, which is the same rule that keeps a deleted prefix from certifying coverage.
 */
export function projectInspectionScope(events: readonly RunEvent[]): InspectionScope {
  const items = new Map<string, InspectionItem>()
  let candidates: InspectionCandidateSummary | null = null
  const unsupported: InspectionUnsupported[] = []

  for (const event of events) {
    if (event.type === INSPECTION_SCOPE_EVENT) {
      const item = event.payload as unknown as InspectionItem
      if (item?.itemId) items.set(item.itemId, { ...item })
      continue
    }
    if (event.type !== INSPECTION_SCOPE_UPDATE_EVENT) continue
    const payload = event.payload as Record<string, any>
    if (payload.candidates) {
      candidates = payload.candidates as InspectionCandidateSummary
      continue
    }
    if (payload.unsupported) {
      const entry = payload.unsupported as InspectionUnsupported
      if (!unsupported.some((u) => u.dimension === entry.dimension)) unsupported.push(entry)
      continue
    }
    const itemId = payload.itemId
    if (typeof itemId !== 'string') continue
    const current = items.get(itemId)
    if (!current) continue
    items.set(itemId, {
      ...current,
      ...(payload.url === undefined ? {} : { url: String(payload.url) }),
      ...(payload.selected === undefined
        ? {}
        : { selected: true, selectionBasis: String(payload.selectionBasis ?? '') }),
      ...(payload.status === undefined
        ? {}
        : {
            status: payload.status as InspectionStatus,
            reasonCode: (payload.reasonCode as string | null) ?? null,
            detail: (payload.detail as string | null) ?? null,
            evidenceRefs: (payload.evidenceRefs as string[]) ?? [],
            eventIds: (payload.eventIds as string[]) ?? [],
            resolvedAt: (payload.resolvedAt as string | null) ?? event.timestamp,
          }),
    })
  }

  return createInspectionScope({ initial: { items: [...items.values()], candidates, unsupported } })
}
