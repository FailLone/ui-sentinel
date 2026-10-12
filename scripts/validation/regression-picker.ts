/** Built workbench with controlled local responses; no server, model, or old database. */
import { chromium } from 'playwright'
import { resolve } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { checkPickerResponses } from './regression-review.ts'
const root = resolve('data/regression-review', 'picker-' + Date.now())
await mkdir(root, { recursive: true })
console.log(root)
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const requests: string[] = []
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    requests.push(url.pathname)
    if (url.pathname === '/api/health')
      return route.fulfill({ json: { model: { ready: true }, features: { productSources: true } } })
    if (url.pathname === '/api/business-profiles') return route.fulfill({ json: { profiles: [] } })
    if (url.pathname === '/api/regression-baselines') {
      const entry = url.searchParams.get('entryUrl')
      if (entry === 'not-a-url')
        return route.fulfill({ status: 400, json: { error: 'invalid-entry-url' } })
      return route.fulfill({
        json: {
          candidates:
            entry === 'http://r4.test/'
              ? [
                  {
                    runId: 'old',
                    title: 'Old',
                    createdAt: '2026-10-12',
                    sourceVersion: '1',
                    steps: ['Preview'],
                    message: 'Review candidate',
                  },
                ]
              : [],
        },
      })
    }
    if (url.pathname === '/')
      return route.fulfill({ path: resolve('dist/web/index.html'), contentType: 'text/html' })
    if (url.pathname.startsWith('/assets/'))
      return route.fulfill({
        path: resolve('dist/web' + url.pathname),
        contentType: url.pathname.endsWith('.js') ? 'application/javascript' : 'text/css',
      })
    return route.abort()
  })
  await page.goto('http://r4.test/')
  await page.getByLabel('网址 UI 检查（匿名、有界，不需要业务适配器）').check()
  const result = await checkPickerResponses(page, 'http://r4.test')
  await writeFile(resolve(root, 'result.json'), JSON.stringify({ result, requests }, null, 2))
  assert.deepEqual(result, {
    oldAborted: true,
    staleOptions: 1,
    urlEditClearedSelection: true,
    failedOptions: 1,
  })
  assert.ok(!requests.includes('/api/runs'))
} finally {
  await browser.close()
}
