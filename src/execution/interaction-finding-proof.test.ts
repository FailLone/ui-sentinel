import { it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  assertInteractionFindingProof,
  interactionFindingIssues,
  digestBytes,
} from './interaction-finding-proof.ts'

it('replays sealed predicates and rejects wrong targets, associations, stale or intervened evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ui-finding-'))
  try {
    const input = {
      selector: '#result span',
      condition: 'numeric-ascending',
      basis: 'Public ascending order',
    }
    const receipt = {
      input,
      actionId: 'action',
      target: 'Apply',
      sourceSnapshot: 's1',
      outcome: 'failed',
      binding: { mode: 'post-action-current', selector: input.selector, url: 'http://fixture/' },
      measured: { supported: true, count: 3, values: ['20', '5', '12'] },
      evidenceRefs: ['shot'],
    }
    const sources: Record<string, string> = {
      receipt: JSON.stringify(receipt),
      shot: 'screenshot bytes',
      observed: 'fresh observation',
    }
    for (const [id, body] of Object.entries(sources)) await writeFile(join(dir, id), body)
    const artifacts = Object.keys(sources).map((id) => ({
      id,
      path: join(dir, id),
      type:
        id === 'receipt' ? 'interaction-measurement' : id === 'shot' ? 'screenshot' : 'snapshot',
      metadata: { evidenceIntegrity: { version: 1, status: 'clean', interventionIds: [] } },
    }))
    const rows: any[] = [
      ['scope:item-created', { itemId: 'item', category: 'local-interaction' }, []],
      ['action:executing', { target: 'Apply', verification: input }, []],
      ['action:completed', {}, []],
      ['page:observed', {}, ['observed']],
      [
        'interaction:measured',
        { target: 'Apply', sourceSnapshot: 's1' },
        ['receipt', 'shot', 'observed'],
      ],
      [
        'scope:item-updated',
        { itemId: 'item', status: 'failed', evidenceRefs: ['receipt', 'shot', 'observed'] },
        [],
      ],
      [
        'interaction:finding-measured',
        {
          hypothesisId: 'hyp',
          actionId: 'action',
          itemId: 'item',
          receiptRef: 'receipt',
          measurementEventId: 'e4',
          resolutionEventId: 'e5',
          evidenceHashes: Object.fromEntries(
            Object.entries(sources).map(([id, body]) => [id, digestBytes(body)]),
          ),
        },
        ['receipt', 'shot', 'observed'],
      ],
    ]
    const history = () =>
      rows.map(([type, payload, evidenceRefs], seq) => ({
        id: 'e' + seq,
        type,
        payload: structuredClone(payload),
        evidenceRefs,
        seq,
        runId: 'run',
        actionId: 'action',
        stepId: null,
        timestamp: 'now',
      }))
    const check = (events = history(), refs = Object.keys(sources)) =>
      assertInteractionFindingProof('run', events, artifacts, 'hyp', refs)
    await expect(check()).resolves.toBeUndefined()
    for (const mutation of [
      (e: any[]) => {
        e[1].payload.verification.selector = '#unrelated'
      },
      (e: any[]) => {
        e[6].payload.itemId = 'other'
      },
      (e: any[]) => {
        e[4].actionId = 'other'
      },
      (e: any[]) => {
        e[4].runId = 'other'
      },
      (e: any[]) => {
        e[3].seq = 9
      },
      (e: any[]) => {
        e[3].type = 'execution:intervention'
      },
      (e: any[]) => {
        e[4].payload.target = 'Other control'
      },
      (e: any[]) => {
        e[5].payload.status = 'verified'
      },
      (e: any[]) => {
        delete e[6].payload.evidenceHashes.shot
      },
      (e: any[]) => {
        e[6].payload.measurementEventId = 'e3'
      },
      (e: any[]) => {
        e.push({ ...e[1], id: 'new-action', seq: 3.5 })
      },
    ]) {
      const events = history()
      mutation(events)
      await expect(check(events)).rejects.toThrow()
    }
    await expect(check(history(), ['receipt', 'observed'])).rejects.toThrow()
    artifacts[1]!.metadata.evidenceIntegrity.status = 'intervened'
    await expect(check()).rejects.toThrow()
    artifacts[1]!.metadata.evidenceIntegrity.status = 'clean'
    // Even a newly sealed receipt cannot turn a pass/unknown or malformed measurement into failure.
    for (const replacement of [
      { ...receipt, measured: { ...receipt.measured, values: ['5', '12', '20'] } },
      { ...receipt, measured: { ...receipt.measured, supported: false } },
      { ...receipt, measured: { ...receipt.measured, count: 1 } },
      { ...receipt, actionId: 'other' },
    ]) {
      const body = JSON.stringify(replacement),
        events = history()
      await writeFile(join(dir, 'receipt'), body)
      events[6]!.payload.evidenceHashes.receipt = digestBytes(body)
      await expect(check(events)).rejects.toThrow()
    }
    await writeFile(join(dir, 'receipt'), sources.receipt!)
    expect(await interactionFindingIssues('run', history(), artifacts)).toEqual([])
    await writeFile(join(dir, 'shot'), 'modified')
    expect(await interactionFindingIssues('run', history(), artifacts)).toEqual([
      'interaction-finding-unverified',
    ])
    expect(await interactionFindingIssues('old-run', [], [])).toEqual([])
    expect(
      await interactionFindingIssues(
        'run',
        [
          {
            ...history()[0]!,
            type: 'hypothesis:created',
            payload: { kind: 'ui-interaction', hypothesisId: 'missing-seal' },
          },
        ],
        [],
      ),
    ).toEqual(['interaction-finding-unverified'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
