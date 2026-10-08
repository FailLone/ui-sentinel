import { expect, it } from 'vitest'
import { createInspectionHost } from './inspection-host.ts'
import { UI_SAMPLING_POLICY } from '../shared/ui-sampling-policy.ts'
import { projectInspectionScope } from '../inspection/scope.ts'
import { samplingHistoryIssues } from '../inspection/sampling-history.ts'
import {
  resolveUiScanContract,
  buildUiContractSnapshot,
  verifyUiContractSnapshot,
} from '../inspection/contract.ts'
import type { RunEvent } from '../shared/types.ts'
function harness(policy = true) {
  const events: RunEvent[] = []
  let url = 'https://example.org/',
    snap = 's1'
  const h = createInspectionHost({
    runId: 'r',
    entryUrl: url,
    goal: '',
    ...(policy ? { samplingPolicy: UI_SAMPLING_POLICY } : {}),
    currentUrl: () => url,
    currentSnapshotId: () => snap,
    currentObservationVersion: () => snap,
    appendEvent: async (type, payload, extra) => {
      const e = {
        id: String(events.length),
        seq: events.length,
        runId: 'r',
        type,
        payload,
        evidenceRefs: extra?.evidenceRefs ?? [],
        timestamp: new Date().toISOString(),
        stepId: null,
        actionId: null,
      } as RunEvent
      events.push(e)
      return e
    },
  })
  const observe = async (n: number, link = false, continued = false, clean = true) =>
    h.recordObservation({
      url,
      evidenceRefs: ['shot', 'snap'],
      clean,
      candidateDetail: 'public',
      candidateCategories: link
        ? ['local-interaction', 'navigation']
        : n
          ? ['local-interaction']
          : [],
      candidateItems: [
        ...Array.from({ length: n }, (_, i) => ({
          ref: `e${i}`,
          description: `public ${i}`,
          category: 'local-interaction' as const,
          samplingKey: `${url}:${i}`,
          continuedItemId: continued
            ? h.candidateItems().find((c) => c.ref === `e${i}`)?.itemId
            : undefined,
        })),
        ...(link ? [{ ref: 'nav', description: 'info', category: 'navigation' as const }] : []),
      ],
    })
  return {
    h,
    events,
    observe,
    move: (u: string) => {
      url = u
      snap += 'x'
    },
  }
}
it('ordinary requests install hashed policy, no empty checks, while legacy snapshots remain legacy', () => {
  const r = resolveUiScanContract(
    { kind: 'ui-scan', entryUrl: 'https://example.org/', goal: '' },
    { reachableOrigins: [] },
  )
  if (r.kind !== 'resolved') throw Error('contract')
  expect(r.contract.samplingPolicy).toEqual(UI_SAMPLING_POLICY)
  expect(r.contract.requiredChecks).toBeUndefined()
  expect(verifyUiContractSnapshot(r.contract)).toBe(true)
  expect(
    resolveUiScanContract(
      { kind: 'ui-scan', entryUrl: 'https://example.org/', samplingPolicy: {} },
      { reachableOrigins: [] },
    ).kind,
  ).toBe('refused')
  const old = buildUiContractSnapshot({
    entryUrl: 'https://example.org/',
    origin: 'https://example.org',
    scope: { maxPages: 3, maxDepth: 1 },
    access: { resourceOrigins: [], dataOrigins: [] },
    budget: { totalTimeoutMs: 300000, maxActions: 20, maxModelCalls: 30 },
  })
  expect(old.samplingPolicy).toBeUndefined()
  expect(old.policyRevision).toBe('url-scan-1')
  expect(verifyUiContractSnapshot(old)).toBe(true)
})
it('all <=3 local targets are selected but remain unfinished; a positive probe cannot close them', async () => {
  const { h, observe } = harness()
  await observe(3, true)
  expect(
    h
      .candidateItems()
      .filter((c) => c.category === 'local-interaction')
      .every((c) => h.snapshot().items.find((i) => i.itemId === c.itemId)?.selected),
  ).toBe(true)
  expect(h.completionGaps().filter((g) => g.category === 'local-interaction')).toHaveLength(3)
  expect(h.completionGaps().some((g) => g.itemId === h.defaultSampling().navigation!.itemId)).toBe(
    true,
  )
})
it('>3 must select full sample before dispatch, then failure cannot buy replacement', async () => {
  const { h, observe } = harness()
  await observe(5)
  const pool = h.candidateItems()
  expect(h.assertSamplingSelectionReady()).toContain('no action dispatched')
  await h.selectItems(pool.slice(0, 2).map((c) => ({ itemId: c.itemId, basis: 'goal focus' })))
  expect(h.assertSamplingSelectionReady()).toBeDefined()
  await h.selectItems([{ itemId: pool[2]!.itemId, basis: 'third public target' }])
  expect(h.assertSamplingSelectionReady()).toBeUndefined()
  await h.resolveInteraction({
    ref: 'e0',
    snapshotId: 's1',
    target: 'public',
    url: 'https://example.org/',
    category: 'local-interaction',
    outcome: 'failed',
    evidenceRefs: ['receipt'],
  })
  await expect(
    h.selectItems([{ itemId: pool[3]!.itemId, basis: 'replace failed' }]),
  ).rejects.toThrow('frozen')
  expect(h.snapshot().items.find((i) => i.itemId === pool[0]!.itemId)?.status).toBe('failed')
})
it('overlarge selection is atomic and cannot drop a pending obligation with empty updates', async () => {
  const { h, observe } = harness()
  await observe(4)
  await expect(
    h.selectItems(h.candidateItems().map((c) => ({ itemId: c.itemId, basis: 'all' }))),
  ).rejects.toThrow('batch exceeds')
  expect(
    h.candidateItems().some((c) => h.snapshot().items.find((i) => i.itemId === c.itemId)?.selected),
  ).toBe(false)
  await h.selectItems([])
  expect(h.assertSamplingSelectionReady()).toBeDefined()
})
it('revisits and new nodes never resample; added gaps remain outstanding', async () => {
  const { h, events, observe, move } = harness()
  await observe(2)
  const first = h.defaultSampling().pages[0]!
  await h.recordGap({
    reasonCode: 'extra-question',
    detail: 'Public observation needs more evidence',
  })
  await h.leavePage('s1')
  move('https://example.org/info')
  await observe(0)
  move('https://example.org/')
  await observe(4)
  expect(h.defaultSampling().pages.find((p) => p.url === 'https://example.org/')).toEqual(first)
  expect(
    events.filter(
      (e) => e.type === 'scope:sampling-frozen' && e.payload.url === 'https://example.org/',
    ),
  ).toHaveLength(1)
  expect(h.completionGaps().some((g) => g.reason === 'extra-question')).toBe(true)
  expect(
    h.snapshot().items.filter((i) => i.selected && i.reasonCode === 'navigation-left-target'),
  ).toHaveLength(2)
})
it('absence uses saved clean observation; dirty observations cannot discharge registration', async () => {
  const { h, observe } = harness()
  await observe(0, false, false, false)
  expect(h.defaultSampling().pages).toHaveLength(0)
  expect(h.completionGaps().length).toBeGreaterThan(0)
  await observe(0)
  expect(h.defaultSampling().pages[0]!.count).toBe(0)
  expect(h.completionGaps()).toEqual([])
})
it('historical host stays open-choice and new frozen history cannot lose its source', async () => {
  const old = harness(false)
  await old.observe(3)
  expect(old.h.defaultSampling().pages).toEqual([])
  expect(old.h.snapshot().items.some((i) => i.selected && i.category === 'local-interaction')).toBe(
    false,
  )
  const { h, events, observe } = harness()
  await observe(0)
  expect(samplingHistoryIssues(events, h.snapshot(), UI_SAMPLING_POLICY, true)).toEqual([])
  const erased = events.filter((e) => e.type !== 'scope:sampling-frozen')
  expect(
    samplingHistoryIssues(
      erased,
      projectInspectionScope(erased).snapshot(),
      UI_SAMPLING_POLICY,
      true,
    ),
  ).toContain('default-sampling-page-missing')
})
