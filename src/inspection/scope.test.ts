import { describe, expect, it } from 'vitest'
import { createInspectionScope, projectInspectionScope } from './scope.ts'
import type { RunEvent } from '../shared/types.ts'

/**
 * The bounded inspection ledger (plan 5.2).
 *
 * The property that matters most here is *authorship*: the executor creates and resolves items, the
 * model may only select from what was actually observed and record gaps. A ledger where the model
 * could write `verified: true`, delete an item, or clear its obligations would let a run claim
 * coverage it never measured, which is the failure this module exists to prevent.
 */
function ledger(goal = 'check the catalogue') {
  return createInspectionScope({ goal, entryUrl: 'https://example.org/catalog' })
}

const observation = {
  pageId: 'page-1',
  stateId: 'state-1',
  url: 'https://example.org/catalog',
  observationVersion: 'v1',
}

describe('item creation', () => {
  it('creates an entry-observation item for the entry page', () => {
    const scope = ledger()
    const item = scope.createItem({
      category: 'entry-observation',
      ...observation,
      basis: 'entry document observed after navigation',
      targetSource: 'executor',
    })
    expect(item.category).toBe('entry-observation')
    expect(item.status).toBe('pending')
    expect(item.selected).toBe(true)
    expect(scope.snapshot().items).toHaveLength(1)
  })

  it('requires a basis for every item', () => {
    expect(() =>
      ledger().createItem({
        ...observation,
        category: 'navigation',
        basis: '',
        targetSource: 'executor',
      }),
    ).toThrow(/basis/i)
  })

  it('records the observation version the item was created against', () => {
    const item = ledger().createItem({
      ...observation,
      category: 'automatic-check',
      basis: 'overlay rule applies to a visible action',
      targetSource: 'executor',
      ruleRevision: '2.0.0',
    })
    expect(item.observationVersion).toBe('v1')
    expect(item.ruleRevision).toBe('2.0.0')
  })
})

describe('resolution is executor-only', () => {
  it('resolves an item to verified with evidence', () => {
    const scope = ledger()
    const item = scope.createItem({
      ...observation,
      category: 'local-interaction',
      basis: 'tab selected',
      targetSource: 'executor',
    })
    const resolved = scope.resolveItem(item.itemId, {
      status: 'verified',
      evidenceRefs: ['artifact-1'],
      eventIds: ['event-1'],
      detail: 'panel content changed after the tab click',
    })
    expect(resolved.status).toBe('verified')
    expect(resolved.evidenceRefs).toEqual(['artifact-1'])
  })

  it('accepts failed as a completed measurement, not an incomplete one', () => {
    const scope = ledger()
    const item = scope.createItem({
      ...observation,
      category: 'automatic-check',
      basis: 'overlay rule',
      targetSource: 'executor',
    })
    scope.resolveItem(item.itemId, {
      status: 'failed',
      evidenceRefs: ['artifact-2'],
      eventIds: ['event-2'],
      detail: 'action intercepted at all sampled points',
    })
    expect(scope.snapshot().counts.failed).toBe(1)
    expect(scope.completionGaps()).toHaveLength(0)
  })

  it('refuses verified without evidence', () => {
    const scope = ledger()
    const item = scope.createItem({
      ...observation,
      category: 'local-interaction',
      basis: 'filter applied',
      targetSource: 'executor',
    })
    expect(() =>
      scope.resolveItem(item.itemId, {
        status: 'verified',
        evidenceRefs: [],
        eventIds: [],
        detail: 'looked fine',
      }),
    ).toThrow(/evidence/i)
  })

  it('refuses unverified without a reason code', () => {
    const scope = ledger()
    const item = scope.createItem({
      ...observation,
      category: 'navigation',
      basis: 'detail link',
      targetSource: 'executor',
    })
    expect(() =>
      scope.resolveItem(item.itemId, {
        status: 'unverified',
        evidenceRefs: [],
        eventIds: [],
        detail: 'could not reach',
      }),
    ).toThrow(/reason/i)
  })

  it('keeps an unverified selected item as a completion gap', () => {
    const scope = ledger()
    const item = scope.createItem({
      ...observation,
      category: 'navigation',
      basis: 'detail link',
      targetSource: 'executor',
    })
    scope.resolveItem(item.itemId, {
      status: 'unverified',
      reasonCode: 'target-not-found',
      evidenceRefs: [],
      eventIds: [],
      detail: 'the link left the document before it could be followed',
    })
    expect(scope.completionGaps()).toHaveLength(1)
    expect(scope.completionGaps()[0]).toMatchObject({ itemId: item.itemId, status: 'unverified' })
  })

  it('refuses to resolve an unknown item', () => {
    expect(() =>
      ledger().resolveItem('nope', {
        status: 'verified',
        evidenceRefs: ['a'],
        eventIds: [],
        detail: '',
      }),
    ).toThrow(/unknown item/i)
  })
})

describe('model-authored updates are constrained', () => {
  it('lets the agent select an observed item but not invent one', () => {
    const scope = ledger()
    const item = scope.createItem({
      ...observation,
      category: 'local-interaction',
      basis: 'visible tab',
      targetSource: 'executor',
      selected: false,
    })
    const selected = scope.selectItem(item.itemId, 'check the tab switch')
    expect(selected.selected).toBe(true)
    expect(selected.status).toBe('pending')
    // Selection is not verification.
    expect(scope.snapshot().counts.verified).toBe(0)
  })

  it('refuses selection of an item that does not exist', () => {
    expect(() => ledger().selectItem('invented-item', 'looks interesting')).toThrow(/unknown item/i)
  })

  it('refuses to select an already resolved item', () => {
    const scope = ledger()
    const item = scope.createItem({
      ...observation,
      category: 'local-interaction',
      basis: 'tab',
      targetSource: 'executor',
    })
    scope.resolveItem(item.itemId, {
      status: 'verified',
      evidenceRefs: ['a'],
      eventIds: [],
      detail: 'switched',
    })
    expect(() => scope.selectItem(item.itemId, 'again')).toThrow(/already resolved/i)
  })

  it('refuses model-authored exclusion', () => {
    const scope = ledger()
    const item = scope.createItem({
      ...observation,
      category: 'automatic-check',
      basis: 'rule',
      targetSource: 'executor',
    })
    // `excluded` comes from a frozen boundary, a sampling cap or a verifiable fact - never from the
    // model deciding an inconvenient item is out of scope.
    expect(() => scope.selectItem(item.itemId, 'x', { exclude: true })).toThrow()
  })

  it('records a gap as a new unverified item with its own reason', () => {
    const scope = ledger()
    scope.recordGap({
      category: 'investigation',
      ...observation,
      basis: 'async content appeared after the filter',
      targetSource: 'agent',
      reasonCode: 'not-verifiable-this-round',
      detail: 'the list re-rendered before a stable measurement could be taken',
    })
    const [item] = scope.snapshot().items
    expect(item).toMatchObject({ status: 'unverified', reasonCode: 'not-verifiable-this-round' })
    expect(scope.completionGaps()).toHaveLength(1)
  })

  it('requires a reason code for a recorded gap', () => {
    expect(() =>
      ledger().recordGap({
        ...observation,
        category: 'investigation',
        basis: 'something odd',
        targetSource: 'agent',
        reasonCode: '',
        detail: '',
      }),
    ).toThrow(/reason/i)
  })

  it('cannot have its executor-created obligations erased', () => {
    const scope = ledger()
    scope.createItem({
      ...observation,
      category: 'entry-observation',
      basis: 'entry observed',
      targetSource: 'executor',
    })
    // An empty exploration update is a no-op on the ledger, not a clear.
    scope.syncSelection([])
    expect(scope.snapshot().items).toHaveLength(1)
    expect(scope.completionGaps().length).toBeGreaterThan(0)
  })
})

describe('default obligations', () => {
  it('requires at least one local interaction when actionable controls exist', () => {
    const scope = ledger()
    scope.createItem({
      ...observation,
      category: 'entry-observation',
      basis: 'entry observed',
      targetSource: 'executor',
    })
    scope.recordCandidates({
      categories: ['local-interaction', 'navigation'],
      detail: 'three tabs, one same-origin detail link',
    })
    const gaps = scope.completionGaps().map((g) => g.reason)
    expect(gaps).toContain('no-local-interaction-selected')
    expect(gaps).toContain('no-navigation-selected')
  })

  it('does not require a local interaction on a page with no actionable controls', () => {
    const scope = ledger()
    const entry = scope.createItem({
      ...observation,
      category: 'entry-observation',
      basis: 'entry observed',
      targetSource: 'executor',
    })
    // The entry obligation is discharged by the observation that created it.
    scope.resolveItem(entry.itemId, {
      status: 'verified',
      evidenceRefs: ['snapshot-1'],
      eventIds: [],
      detail: 'entry document observed',
    })
    scope.recordCandidates({
      categories: [],
      detail: 'no interactive controls in the observed DOM',
    })
    expect(scope.completionGaps()).toHaveLength(0)
  })

  it('still owes the entry observation while it is unresolved', () => {
    const scope = ledger()
    scope.createItem({
      ...observation,
      category: 'entry-observation',
      basis: 'entry observed',
      targetSource: 'executor',
    })
    scope.recordCandidates({ categories: [], detail: 'no interactive controls' })
    expect(scope.completionGaps().map((g) => g.category)).toEqual(['entry-observation'])
  })

  it('treats a non-empty candidate list as an obligation that survives an empty update', () => {
    const scope = ledger()
    scope.recordCandidates({ categories: ['local-interaction'], detail: 'one button' })
    scope.syncSelection([])
    expect(scope.completionGaps().some((g) => g.reason === 'no-local-interaction-selected')).toBe(
      true,
    )
  })

  it('clears a candidate obligation once an item of that category is selected or resolved', () => {
    const scope = ledger()
    scope.recordCandidates({ categories: ['local-interaction'], detail: 'one button' })
    const item = scope.createItem({
      ...observation,
      category: 'local-interaction',
      basis: 'button observed',
      targetSource: 'executor',
    })
    scope.resolveItem(item.itemId, {
      status: 'verified',
      evidenceRefs: ['a'],
      eventIds: [],
      detail: 'clicked',
    })
    expect(scope.completionGaps()).toHaveLength(0)
  })
})

describe('sampling bounds and unsupported dimensions', () => {
  it('records truncation rather than pretending the list was complete', () => {
    const scope = ledger()
    scope.recordCandidates({
      categories: ['local-interaction'],
      detail: 'first 3 of 12 candidate controls',
      truncated: 9,
    })
    expect(scope.snapshot().candidates?.truncated).toBe(9)
  })

  it('records unsupported dimensions separately from the item list', () => {
    const scope = ledger()
    scope.recordUnsupported({ dimension: 'iframe-content', reasonCode: 'unsupported-channel' })
    scope.recordUnsupported({
      dimension: 'websocket-live-updates',
      reasonCode: 'unsupported-channel',
    })
    expect(scope.snapshot().unsupported.map((u) => u.dimension)).toEqual([
      'iframe-content',
      'websocket-live-updates',
    ])
  })
})

describe('projection from persisted events', () => {
  function event(seq: number, type: string, payload: Record<string, unknown>): RunEvent {
    return {
      id: `e${seq}`,
      runId: 'run-1',
      seq,
      type,
      timestamp: '2026-10-06T00:00:00.000Z',
      stepId: null,
      actionId: null,
      payload,
      evidenceRefs: [],
    }
  }

  it('rebuilds the same ledger from its own events', () => {
    const scope = ledger()
    const entry = scope.createItem({
      ...observation,
      category: 'entry-observation',
      basis: 'entry',
      targetSource: 'executor',
    })
    scope.resolveItem(entry.itemId, {
      status: 'verified',
      evidenceRefs: ['art-1'],
      eventIds: [],
      detail: 'observed',
    })
    scope.recordCandidates({ categories: ['local-interaction'], detail: 'one button' })
    scope.recordUnsupported({ dimension: 'iframe-content', reasonCode: 'unsupported-channel' })

    const rebuilt = projectInspectionScope(
      scope.events().map((e, i) => event(i, e.type, e.payload)),
    )
    expect(rebuilt.snapshot().items).toEqual(scope.snapshot().items)
    expect(rebuilt.snapshot().candidates).toEqual(scope.snapshot().candidates)
    expect(rebuilt.snapshot().unsupported).toEqual(scope.snapshot().unsupported)
  })

  it('reports an empty ledger for an event stream with no scope events', () => {
    const rebuilt = projectInspectionScope([event(0, 'run:started', {})])
    expect(rebuilt.snapshot().items).toEqual([])
  })

  it('ignores a later update for an item it never created', () => {
    // A truncated event history cannot fabricate an item by naming one.
    const rebuilt = projectInspectionScope([
      event(0, 'scope:item-updated', { itemId: 'ghost', status: 'verified' }),
    ])
    expect(rebuilt.snapshot().items).toEqual([])
  })
})
