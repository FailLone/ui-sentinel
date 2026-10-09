import type { PageSnapshot } from '../rules/types.ts'
import { it, expect } from 'vitest'
import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { createUiRuleObservation } from './ui-rule-observation.ts'
import { observePage } from './browser.ts'
import { createRun, getEvents } from './run-manager.ts'
import { getDbClient } from '../storage/database.ts'
import { projectUiRuleReports } from '../server/reports/ui-rule-report.ts'
import { controlLayoutFixture } from '../../evaluation/fixtures/control-layout.ts'

it('ordinary adapter binds evidence, invalidates live changes, reuses only unchanged checks, restores and rejects changed history', async () => {
  const run = await createRun({
    entryUrl: 'http://local.test/',
    environmentId: 'test',
    goal: 'bounded layout adapter',
  })
  const browser = await chromium.launch({ headless: true }),
    page = await browser.newPage({ viewport: run.spec.viewport })
  const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }
  const adapter = createUiRuleObservation(page, run.id, () => clean)
  const capture = async () => {
    const prepared = await adapter.prepare()
    const observed = await observePage(page, run.id, () => ({ evidenceIntegrity: clean }), [], {
      caret: 'initial',
    })
    await adapter.complete(prepared, observed, 0)
    return {
      runId: run.id,
      currentUrl: observed.snapshot.url,
      pageTitle: '',
      timestamp: new Date().toISOString(),
      events: [],
      snapshot: observed.snapshot as PageSnapshot,
    }
  }
  try {
    await page.setContent(controlLayoutFixture('clipped'))
    let context = await capture()
    const first = await adapter.evaluate(context)
    expect(first.layoutResults[0]!.verdict).toBe('fail')
    expect((await adapter.evaluate(context)).reused).toBe(true)
    expect((await getEvents(run.id)).filter((e) => e.type === 'ui-rules:observed')).toHaveLength(1)
    await page
      .locator('button')
      .first()
      .evaluate((e) => e.replaceWith(e.cloneNode(true)))
    let changed = await adapter.evaluate(context)
    expect(changed.reused).toBe(false)
    expect(changed.layoutResults.every((r) => r.verdict === 'unknown')).toBe(true)
    expect(changed.layoutResults.every((r) => !r.unchecked)).toBe(true)
    await page
      .locator('button')
      .first()
      .evaluate((e) => ((e as HTMLElement).style.height = '40px'))
    context = await capture()
    const healthy = await adapter.evaluate(context)
    expect(healthy.layoutResults.every((r) => r.verdict === 'pass')).toBe(true)
    // CSSOM edits need not produce DOM mutation records; measured styles still reject stale facts.
    await page.evaluate(() =>
      (document.styleSheets[0] as CSSStyleSheet).insertRule(
        'button { font-size: 22px !important }',
      ),
    )
    expect(
      (await adapter.evaluate(context)).layoutResults.every((r) => r.verdict === 'unknown'),
    ).toBe(true)
    context = await capture()
    await adapter.evaluate(context)
    await page.setViewportSize({ width: 1000, height: 768 })
    expect(
      (await adapter.evaluate(context)).layoutResults.every((r) => r.verdict === 'unknown'),
    ).toBe(true)
    await page.setContent(
      controlLayoutFixture('overlap').replace('pointer-events:none', 'pointer-events:auto'),
    )
    context = await capture()
    const associated = await adapter.evaluate(context)
    expect(associated.layoutResults[1]!.verdict).toBe('fail')
    expect(
      associated.body.layout!.results[1]!.rows.some(
        (r) => r.verdict === 'fail' && r.relatedRuleIds.includes('overlay-blocking'),
      ),
    ).toBe(true)
    await page.evaluate(() => {
      const img = document.createElement('img')
      img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
      document.body.append(img)
    })
    expect(
      (await adapter.evaluate(context)).layoutResults.every((r) => r.verdict === 'unknown'),
    ).toBe(true)
    context = await capture()
    await page
      .locator('img')
      .evaluate(
        (e) =>
          ((e as HTMLImageElement).src =
            'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"/>'),
      )
    expect(
      (await adapter.evaluate(context)).layoutResults.every((r) => r.verdict === 'unknown'),
    ).toBe(true)
    await page.setContent(controlLayoutFixture('healthy'))
    context = await capture()
    await adapter.evaluate(context)
    const files = (
      await getDbClient().execute({
        sql: 'SELECT id,file_path FROM artifacts WHERE run_id=?',
        args: [run.id],
      })
    ).rows as unknown as { id: string; file_path: string }[]
    const events = await getEvents(run.id)
    expect((await projectUiRuleReports(run.id, events, files)).every((r) => r.available)).toBe(true)
    const ref = Object.keys(first.body.layout!.evidenceDigests).find(
      (id) => id !== first.body.screenshotRef,
    )!
    const path = files.find((f) => f.id === ref)!.file_path,
      original = await readFile(path)
    await writeFile(path, 'changed layout reference')
    expect((await projectUiRuleReports(run.id, events, files))[0]!.available).toBe(false)
    await writeFile(path, original)
    // New evidence can be removed from the lookup without borrowing another run's reference.
    expect(
      (
        await projectUiRuleReports(
          run.id,
          events,
          files.filter((f) => f.id !== ref),
        )
      )[0]!.available,
    ).toBe(false)
    const latest = await capture(),
      result = await adapter.evaluate(latest)
    const liveRef = Object.keys(result.body.layout!.evidenceDigests).find(
      (id) => id !== result.body.screenshotRef,
    )!
    const liveFile = (
      await getDbClient().execute({
        sql: 'SELECT file_path FROM artifacts WHERE id=? AND run_id=?',
        args: [liveRef, run.id],
      })
    ).rows[0]!
    const livePath = String(liveFile.file_path),
      saved = await readFile(livePath)
    await writeFile(livePath, 'changed')
    const refused = await adapter.evaluate(latest)
    expect(refused.layoutResults.every((r) => r.verdict === 'unknown' && !r.unchecked)).toBe(true)
    await writeFile(livePath, saved)
  } finally {
    adapter.close()
    await browser.close()
  }
})
