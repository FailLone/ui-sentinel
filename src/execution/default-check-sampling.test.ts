import { expect, it } from 'vitest'
import { createInspectionHost } from './inspection-host.ts'
import { UI_SAMPLING_POLICY_V2, UI_CHECK_POLICY } from '../shared/ui-sampling-policy.ts'
import { UI_DEFAULT_GOAL } from '../shared/ui-goal.ts'
import { projectInspectionScope } from '../inspection/scope.ts'
import { samplingHistoryIssues } from '../inspection/sampling-history.ts'
import type { RunEvent } from '../shared/types.ts'

it('F08 advanced fourth obligation cannot replace the fixed default three, and a target beyond eight is still registered', async () => {
  const events: RunEvent[] = []
  const h = createInspectionHost({
    runId: 'r',
    entryUrl: 'https://example.org/',
    goal: UI_DEFAULT_GOAL,
    samplingPolicy: UI_SAMPLING_POLICY_V2,
    checkPolicy: UI_CHECK_POLICY,
    requiredChecks: [
      {
        id: 'extra',
        description: 'Independent caller check',
        selector: '#extra',
        action: 'click',
        verify: { selector: '#out', condition: 'text-equals', expected: 'Ready', basis: 'caller' },
      },
    ],
    currentSnapshotId: () => 's1',
    currentUrl: () => 'https://example.org/',
    currentObservationVersion: () => 'v1',
    appendEvent: async (type, payload, extra) => {
      const event = {
        id: 'e' + events.length,
        runId: 'r',
        seq: events.length,
        type,
        payload,
        evidenceRefs: extra?.evidenceRefs ?? [],
        timestamp: 't',
        actionId: null,
        stepId: null,
      }
      events.push(event)
      return event
    },
  })
  await h.recordObservation({
    url: 'https://example.org/',
    evidenceRefs: ['shot', 'snapshot'],
    clean: true,
    candidateDetail: 'nine public controls',
    candidateCategories: ['local-interaction'],
    candidateItems: Array.from({ length: 9 }, (_, i) => ({
      ref: 'r' + i,
      description: 'button "' + i + '"',
      category: 'local-interaction' as const,
      samplingKey: 'key' + i,
      ...(i === 8 ? { requiredCheckIds: ['extra'] } : {}),
    })),
  })
  const candidates = h.candidateItems()
  expect(candidates).toHaveLength(9)
  const extra = candidates[8]!,
    pool = candidates.slice(0, 3)
  expect(h.snapshot().items.find((i) => i.itemId === extra.itemId)?.selected).toBe(true)
  await h.selectItems(pool.map((c) => ({ itemId: c.itemId, basis: 'frozen default sample' })))
  expect(h.assertSamplingSelectionReady()).toBeUndefined()
  expect(
    h.snapshot().items.filter((i) => i.selected && i.category === 'local-interaction'),
  ).toHaveLength(4)
  await expect(
    h.selectItems([{ itemId: candidates[3]!.itemId, basis: 'replace' }]),
  ).rejects.toThrow('frozen')
  const projected = projectInspectionScope(events).snapshot()
  expect(samplingHistoryIssues(events, projected, UI_SAMPLING_POLICY_V2, false)).toEqual([])
  expect(h.completionGaps().filter((g) => g.category === 'local-interaction')).toHaveLength(4)
})
