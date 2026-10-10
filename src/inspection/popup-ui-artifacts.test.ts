import { it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { popupArtifactIssues } from './popup-artifacts.ts'
import { popupReport } from '../server/reports/popup-report.ts'
import { hash } from '../agent/popup/contract.ts'
import { judgePopup } from '../execution/popup/geometry.ts'
it('independently replays visible UI receipts and summary, rejects invented attribution, changed geometry, omitted panels and damaged evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'popup-ui-'))
  const metadata = { evidenceIntegrity: { version: 1, status: 'clean', interventionIds: [] } }
  const artifacts: any[] = [],
    events: any[] = []
  const save = async (id: string, type: string, body: any) => {
    const path = join(dir, id)
    await writeFile(path, typeof body === 'string' ? body : JSON.stringify(body))
    if (!artifacts.some((a) => a.id === id)) artifacts.push({ id, type, path, metadata })
  }
  const sha = (bytes: string) => createHash('sha256').update(bytes).digest('hex')
  const panel: any = {
    id: 'panel',
    kind: 'custom',
    description: 'Unrelated notice',
    visible: true,
    topLayer: false,
    url: 'https://example.org',
    rect: { x: 20, y: 20, width: 100, height: 100 },
    viewport: { x: 0, y: 0, width: 320, height: 480 },
    clips: [],
    unsupported: [],
    surface: { position: 'fixed', opaque: true, border: true, shadow: false },
  }
  const frame = { binding: 'frame', reusable: true, panels: [panel] }
  const run: any = {
    spec: { uiContract: { hash: 'contract', popupCheck: { revision: 'popup-viewport-2' } } },
  }
  const body: any = {
    revision: 'popup-ui-measurement-2',
    ruleRevision: 'popup-visible-viewport-2',
    taskId: 'task',
    contractHash: 'contract',
    relation: 'observed-visible-surface',
    actionId: null,
    itemId: null,
    reproduction: null,
    frame,
    targetId: 'panel',
    applicable: true,
    measurement: judgePopup([panel, panel]),
    screenshotRef: 'screen',
    evidenceRefs: ['screen'],
    evidenceHashes: { screen: sha('image') },
  }
  const summary: any = {
    revision: 'popup-ui-summary-2',
    taskId: 'task',
    contractHash: 'contract',
    actionId: null,
    itemId: null,
    frame,
    checks: [
      {
        targetId: 'panel',
        verdict: 'pass',
        reason: body.measurement.reason,
        receiptRef: 'measure',
      },
    ],
    unchecked: [],
    verdict: 'pass',
    reason: 'observed-floating-surfaces-fit',
    evidenceRefs: ['screen', 'measure'],
    evidenceHashes: { screen: sha('image'), measure: sha(JSON.stringify(body)) },
  }
  const record = (type: string, ref: string, b: any) => ({
    type,
    payload: {
      taskId: 'task',
      receiptRef: ref,
      receiptHash: hash(b),
      targetId: b.targetId,
      verdict: b.verdict ?? b.measurement.verdict,
      reason: b.reason ?? b.measurement.reason,
    },
    evidenceRefs: [...b.evidenceRefs, ref],
  })
  async function reset() {
    await save('screen', 'screenshot', 'image')
    await save('measure', 'popup-ui-measurement', body)
    summary.evidenceHashes.measure = sha(JSON.stringify(body))
    await save('summary', 'popup-ui-summary', summary)
    events.splice(
      0,
      events.length,
      record('popup:ui-measurement', 'measure', body),
      record('popup:ui-summary', 'summary', summary),
      {
        type: 'popup:state',
        payload: { status: 'measured', receiptRef: 'summary', measurement: { verdict: 'pass' } },
      },
    )
  }
  const issues = () => popupArtifactIssues(run, events, artifacts)
  try {
    await reset()
    expect(await issues()).toEqual([])
    expect(popupReport(run, events, new Set(artifacts.map((a) => a.id)), [])?.verdict).toBe('pass')
    body.actionId = 'invented'
    await reset()
    expect((await issues()).join()).toContain('receipt-invalid')
    body.actionId = null
    body.measurement.verdict = 'fail'
    await reset()
    expect((await issues()).join()).toContain('geometry-invalid')
    body.measurement = judgePopup([panel, panel])
    summary.frame = { ...frame, panels: [panel, { ...panel, id: 'omitted' }] }
    await reset()
    expect((await issues()).length).toBeGreaterThan(0)
    summary.frame = frame
    await reset()
    await save('screen', 'screenshot', 'changed')
    const damaged = await issues()
    expect(damaged.join()).toContain('evidence-changed-or-unowned')
    expect(popupReport(run, events, new Set(artifacts.map((a) => a.id)), damaged)?.verdict).toBe(
      'unknown',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
