/** Focused free review probes. Uses a fresh baseline from the existing R3/R4 harness. */
import type { Page } from 'playwright'
import { rename } from 'node:fs/promises'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
export async function checkPickerResponses(page: Page, origin: string) {
  // Delay an already decoded reply across a URL change. Abort cannot retract decoded data.
  await page.evaluate(`(() => {
    const original = window.fetch.bind(window);
    let held = false;
    window.fetch = async (...args) => {
      const response = await original(...args);
      if (!held && String(args[0]).includes('/api/regression-baselines?')) {
        held = true;
        const data = await response.json();
        const signal = args[1]?.signal;
        return { ok: response.ok, json: () => new Promise(resolve => {
          window.__r4Held = true;
          window.__r4Release = () => {
            window.__r4OldAborted = signal?.aborted;
            resolve(data);
          };
        }) };
      }
      return response;
    };
  })()`)
  const url = page.getByPlaceholder('https://example.org/catalog?category=books#items')
  await url.fill(origin + '/')
  await page.waitForFunction(() => (window as any).__r4Held === true)
  await url.fill(origin + '/other')
  await page
    .getByText('最近 20 个同入口已完成检查中暂无可用健康路径；可先完成一次检查。', { exact: true })
    .waitFor()
  await page.evaluate(async () => {
    ;(window as any).__r4Release()
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
  const staleOptions = await page.getByLabel('沿用历史检查（可选）').locator('option').count()
  const oldAborted = await page.evaluate(() => (window as any).__r4OldAborted)
  await url.fill(origin + '/')
  await page
    .getByLabel('沿用历史检查（可选）')
    .locator('option')
    .nth(1)
    .waitFor({ state: 'attached' })
  const selected = await page
    .getByLabel('沿用历史检查（可选）')
    .locator('option')
    .nth(1)
    .getAttribute('value')
  await page.getByLabel('沿用历史检查（可选）').selectOption(selected!)
  await url.fill(origin + '/other')
  await page
    .getByText('最近 20 个同入口已完成检查中暂无可用健康路径；可先完成一次检查。', { exact: true })
    .waitFor()
  const cleared = (await page.getByLabel('沿用历史检查（可选）').inputValue()) === ''
  await url.fill('not-a-url')
  await page.getByText('历史检查读取失败，请核对网址或服务连接。', { exact: true }).waitFor()
  const failedOptions = await page.getByLabel('沿用历史检查（可选）').locator('option').count()
  return { oldAborted, staleOptions, urlEditClearedSelection: cleared, failedOptions }
}
export async function checkBaselineReadmission(
  api: (path: string, body?: unknown) => Promise<any>,
  baseline: any,
  request: any,
) {
  const id = baseline.runId
  const saved = await api(`/api/runs/${id}/path-program`, {})
  assert.equal(saved.status, 201)
  assert.deepEqual(await api(`/api/runs/${id}/path-program`, {}), saved)
  const badEntry = await api('/api/runs', {
    ...request,
    baselineRunId: id,
    entryUrl: request.entryUrl + '?changed=1',
  })
  assert.equal(badEntry.status, 400)
  const conflict = await api('/api/runs', {
    ...request,
    baselineRunId: id,
    pathProgramId: saved.body.program.id,
  })
  assert.equal(conflict.status, 400)
  const ref = baseline.uiScan.productSource.steps[0].evidenceRefs[0]
  const path = resolve('data/artifacts', id, ref)
  await rename(path, path + '.review-held')
  try {
    const downgraded = await api(`/api/runs/${id}/report`)
    const candidates = await api(
      '/api/regression-baselines?entryUrl=' + encodeURIComponent(request.entryUrl),
    )
    const refused = await api('/api/runs', { ...request, baselineRunId: id })
    const resave = await api(`/api/runs/${id}/path-program`, {})
    assert.notEqual(downgraded.body.uiScan.productSource.state, 'verified')
    if (downgraded.body.uiScan.regression)
      assert.ok(
        downgraded.body.uiScan.regression.steps.every((s: any) => s.state !== 'newly-verified'),
      )
    assert.ok(!candidates.body.candidates.some((c: any) => c.runId === id))
    assert.equal(refused.status, 409)
    assert.equal(resave.status, 409)
    assert.equal(refused.body.runId, undefined)
    return {
      savedId: saved.body.program.id,
      conflict: conflict.status,
      mismatchedEntry: badEntry.status,
      invalidEvidence: {
        ref,
        report: downgraded.body,
        candidates: candidates.body,
        refused,
        resave,
      },
    }
  } finally {
    await rename(path + '.review-held', path)
  }
}
