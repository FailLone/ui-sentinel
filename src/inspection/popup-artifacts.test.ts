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
