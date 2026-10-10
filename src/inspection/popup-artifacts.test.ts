import { it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { popupArtifactIssues } from './popup-artifacts.ts'
import { popupReport } from '../server/reports/popup-report.ts'
it('malformed or missing receipt bytes always withdraw a persisted popup pass, even if the event still says measured', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'popup-corrupt-'))
  const path = join(dir, 'receipt.json'),
    run: any = { spec: { uiContract: { popupCheck: {}, hash: 'contract' } } }
  const events: any[] = [
    { type: 'popup:measurement', payload: { receiptRef: 'ref' }, evidenceRefs: ['ref'] },
    {
      type: 'popup:state',
      payload: { status: 'measured', measurement: { verdict: 'pass' }, receiptRef: 'ref' },
    },
  ]
  const artifacts = [
    {
      id: 'ref',
      type: 'popup-measurement',
      path,
      metadata: { evidenceIntegrity: { version: 1, status: 'clean', interventionIds: [] } },
    },
  ]
  try {
    await writeFile(path, '{invalid-json')
    let issues = await popupArtifactIssues(run, events, artifacts)
    expect(issues[0]).toMatch(/^popup-/)
    expect(popupReport(run, events, new Set(['ref']), issues)?.verdict).toBe('unknown')
    await rm(path)
    issues = await popupArtifactIssues(run, events, artifacts)
    expect(popupReport(run, events, new Set(['ref']), issues)?.verdict).toBe('unknown')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

it('verifies candidate receipt bytes independently and never upgrades a candidate-only result into a pass or attributed defect', async () => {
  const { hash } = await import('../agent/popup/contract.ts')
  const { judgePopup } = await import('../execution/popup/geometry.ts')
  const { createHash } = await import('node:crypto')
  const dir = await mkdtemp(join(tmpdir(), 'popup-candidate-'))
  const target: any = {
    id: 'candidate',
    description: 'Floating notice',
    kind: 'custom',
    visible: true,
    topLayer: false,
    url: 'https://example.org',
    rect: { x: 490, y: 10, width: 100, height: 100 },
    viewport: { x: 0, y: 0, width: 500, height: 400 },
    clips: [],
    unsupported: [],
  }
  const metadata = { evidenceIntegrity: { version: 1, status: 'clean', interventionIds: [] } }
  const run: any = { spec: { uiContract: { popupCheck: {}, hash: 'contract' } } }
  const body: any = {
    revision: 'popup-candidate-geometry-1',
    policy: 'popup-purpose-policy-2',
    taskId: 'task',
    contractHash: 'contract',
    association: 'unconfirmed',
    actionId: null,
    itemId: null,
    frame: { reusable: true, panels: [target] },
    targetId: target.id,
    measurement: judgePopup([target, target]),
    screenshotRef: 'screen',
    evidenceRefs: ['screen'],
    evidenceHashes: { screen: createHash('sha256').update('image').digest('hex') },
  }
  const artifacts = [
    { id: 'receipt', type: 'popup-candidate-geometry', path: join(dir, 'receipt.json'), metadata },
    { id: 'screen', type: 'screenshot', path: join(dir, 'screen.png'), metadata },
  ]
  const events: any[] = [
    {
      type: 'popup:candidate-geometry',
      seq: 1,
      payload: {
        taskId: 'task',
        receiptRef: 'receipt',
        receiptHash: hash(body),
        targetId: target.id,
        geometryVerdict: body.measurement.verdict,
        association: 'unconfirmed',
        reason: body.measurement.reason,
      },
      evidenceRefs: ['receipt', 'screen'],
    },
    { type: 'popup:state', payload: { status: 'handoff', reason: 'popup-target-ambiguous' } },
  ]
  const readable = new Set(['receipt', 'screen'])
  try {
    await writeFile(artifacts[0]!.path, JSON.stringify(body))
    await writeFile(artifacts[1]!.path, 'image')
    expect(await popupArtifactIssues(run, events, artifacts)).toEqual([])
    const report = popupReport(run, events, readable, [])
    expect(report).toMatchObject({
      verdict: 'unknown',
      candidateGeometry: [{ geometryVerdict: 'fail', association: 'unconfirmed' }],
    })
    events[1].payload = {
      status: 'measured',
      receiptRef: 'receipt',
      measurement: { verdict: 'pass' },
    }
    expect(popupReport(run, events, readable, [])?.verdict).toBe('unknown')
    expect(popupReport(run, events, new Set(['receipt']), [])?.candidateGeometry).toEqual([])
    body.actionId = 'invented-original-action'
    events[0].payload.receiptHash = hash(body)
    await writeFile(artifacts[0]!.path, JSON.stringify(body))
    let issues = await popupArtifactIssues(run, events, artifacts)
    expect(issues).toContain(
      'popup-evidence-invalid:popup-candidate-attribution-or-binding-invalid',
    )
    expect(popupReport(run, events, readable, issues)?.candidateGeometry).toEqual([])
    body.actionId = null
    events[0].payload.receiptHash = hash(body)
    await writeFile(artifacts[0]!.path, JSON.stringify(body))
    await writeFile(artifacts[1]!.path, 'tampered')
    issues = await popupArtifactIssues(run, events, artifacts)
    expect(issues).toContain('popup-evidence-invalid:popup-evidence-bytes-changed')
    expect(popupReport(run, events, readable, issues)?.verdict).toBe('unknown')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
it('keeps historical reports without candidate events in the original shape', () => {
  const run: any = { spec: { uiContract: { popupCheck: {}, hash: 'contract' } } }
  const events: any[] = [
    { type: 'popup:measurement', payload: { receiptRef: 'old' }, evidenceRefs: ['old'] },
    {
      type: 'popup:state',
      payload: { status: 'measured', measurement: { verdict: 'pass' }, receiptRef: 'old' },
    },
  ]
  expect(popupReport(run, events, new Set(['old']), [])?.verdict).toBe('pass')
  expect(popupReport(run, events, new Set(['old']), [])).not.toHaveProperty('candidateGeometry')
})
