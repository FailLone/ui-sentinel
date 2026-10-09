import { it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { recoveryHistoryIssues, recoveryArtifactIssues } from './recovery-history.ts'
import { recoveryDigest } from '../execution/interaction-recovery.ts'
function history() {
  const input = {
    selector: '#result',
    condition: 'text-equals',
    expected: 'Ready',
    basis: 'Public feedback',
  }
  const check = {
    checkRef: 'check',
    actionId: 'action',
    itemId: 'item',
    actionVersion: 1,
    url: 'http://fixture/',
    input,
    evidenceHashes: { original: 'hash' },
  }
  const source = { ...check, sourceHash: recoveryDigest(check) }
  const body = {
    input,
    checkRef: 'check',
    actionId: 'action',
    itemId: 'item',
    sourceHash: source.sourceHash,
    observationRefs: ['fresh'],
    outcome: 'verified',
  }
  const rows: any[] = [
    ['scope:item-created', { itemId: 'item', category: 'local-interaction' }, []],
    ['action:executing', { verification: input }, []],
    ['action:completed', {}, []],
    ['scope:item-updated', { itemId: 'item', status: 'unverified' }, ['original']],
    ['interaction:verification-opened', source, ['original']],
    ['page:observed', {}, ['fresh']],
    [
      'interaction:recovered',
      { ...body, receiptRef: 'receipt', receiptHash: recoveryDigest(body) },
      ['original', 'fresh', 'receipt'],
    ],
    [
      'scope:item-updated',
      {
        itemId: 'item',
        reasonCode: 'interaction-recovery-measured',
        status: 'verified',
        eventIds: ['e6'],
      },
      ['receipt'],
    ],
  ]
  return rows.map(([type, payload, evidenceRefs], seq) => ({
    id: 'e' + seq,
    seq,
    type,
    payload,
    evidenceRefs,
    actionId: 'action',
    stepId: null,
    runId: 'run',
    timestamp: 'now',
  }))
}
it('rejects wrong association, changed expectation, missing original gap and intervening actions', () => {
  expect(recoveryHistoryIssues(history())).toEqual([])
  for (const mutate of [
    (e: any[]) => {
      e[6].payload.itemId = 'other'
    },
    (e: any[]) => {
      e[4].runId = 'other-run'
    },
    (e: any[]) => {
      e[6].payload.observationRefs = 'malformed'
    },
    (e: any[]) => {
      delete e[1].payload.verification
    },
    (e: any[]) => {
      e[5].type = 'unrelated:event'
    },
    (e: any[]) => {
      e[4].payload.input = { ...e[4].payload.input, expected: 'Wrong' }
    },
    (e: any[]) => {
      e[3].payload.status = 'verified'
    },
    (e: any[]) => {
      e[5].type = 'action:executing'
    },
    (e: any[]) => {
      e[7].payload.eventIds = []
    },
    (e: any[]) => {
      e[5].evidenceRefs = []
    },
  ]) {
    const events = history()
    mutate(events)
    expect(recoveryHistoryIssues(events).length).toBeGreaterThan(0)
  }
})
it('checks original and recovered artifact bytes, including missing files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'recovery-proof-'))
  try {
    const source = join(directory, 'source'),
      receipt = join(directory, 'receipt')
    await writeFile(source, 'original')
    const body = { measured: 'Ready' }
    await writeFile(receipt, JSON.stringify(body))
    const events: any[] = [
      {
        type: 'interaction:verification-opened',
        payload: {
          evidenceHashes: { source: createHash('sha256').update('original').digest('hex') },
        },
      },
      {
        type: 'interaction:recovered',
        payload: { receiptRef: 'receipt', receiptHash: recoveryDigest(body) },
      },
    ]
    const paths = new Map([
      ['source', source],
      ['receipt', receipt],
    ])
    expect(await recoveryArtifactIssues(events, paths)).toEqual([])
    await writeFile(source, 'changed')
    expect(await recoveryArtifactIssues(events, paths)).toContain('recovery-artifact-unverified')
    await rm(receipt)
    expect(await recoveryArtifactIssues(events, paths)).toContain('recovery-artifact-unverified')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
