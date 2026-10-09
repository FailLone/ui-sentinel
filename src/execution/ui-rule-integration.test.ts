import { it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { clearRules, getEnabledRules, runChecks } from '../rules/engine.ts'
import { registerBuiltinRules } from '../rules/builtin/index.ts'
import { projectUiRuleReports } from '../server/reports/ui-rule-report.ts'
import type { RunEvent } from '../shared/types.ts'
it('business default registry and rule context do not acquire UI-only candidates', async () => {
  clearRules()
  registerBuiltinRules()
  expect(
    getEnabledRules()
      .map((r) => r.id)
      .sort(),
  ).toEqual(['business-outcome', 'overlay-blocking', 'response-time'])
  const result = await runChecks({
    runId: 'business',
    currentUrl: 'http://local.test/',
    pageTitle: 'fixture',
    timestamp: new Date().toISOString(),
    events: [],
    snapshot: {
      url: 'http://local.test/',
      title: 'fixture',
      viewport: { width: 1280, height: 768 },
      elements: [],
      evidenceIntegrity: { version: 1, status: 'clean', interventionIds: [] },
    },
  })
  expect(
    result.results.some(
      (r) => r.ruleId === 'control-text-disappearance' || r.ruleId === 'image-shape-distortion',
    ),
  ).toBe(false)
  clearRules()
})
it('history projection refuses missing or changed screenshot rather than displaying stale conclusions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ui-rule-report-'))
  try {
    const screenshot = join(dir, 'shot'),
      artifact = join(dir, 'body'),
      sha = (s: string) => createHash('sha256').update(s).digest('hex')
    await writeFile(screenshot, 'original')
    const body = JSON.stringify({
      version: 'ui-rule-observation-1',
      runId: 'run',
      screenshotRef: 'shot',
      screenshotSha256: sha('original'),
      evidenceRefs: ['shot'],
      controls: { rows: [] },
      images: { rows: [] },
    })
    await writeFile(artifact, body)
    const event = {
      id: 'event',
      type: 'ui-rules:observed',
      payload: { artifactRef: 'body', sha256: sha(body) },
    } as unknown as RunEvent
    const files = [
      { id: 'body', file_path: artifact },
      { id: 'shot', file_path: screenshot },
    ]
    expect((await projectUiRuleReports('run', [event], files))[0]!.available).toBe(true)
    await writeFile(screenshot, 'changed')
    expect((await projectUiRuleReports('run', [event], files))[0]!.available).toBe(false)
    await rm(screenshot)
    expect((await projectUiRuleReports('run', [event], files))[0]!.available).toBe(false)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
