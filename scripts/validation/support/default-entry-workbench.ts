/** Actual ordinary workbench path; records the browser POST, never submits through a hidden API. */
import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
const meta = JSON.parse(await readFile('data/r0-default-entry-delivery/live.json', 'utf8'))
const browser = await chromium.launch({ headless: true }),
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
process.once('SIGTERM', async () => {
  await browser.close()
  process.exit(0)
})
const errors: string[] = [],
  requests: any[] = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('request', (r) => {
  if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/runs')
    requests.push({ url: r.url(), body: r.postDataJSON() })
})
try {
  await page.goto(meta.base)
  await page
    .getByRole('radio', { name: '网址 UI 检查（匿名、有界，不需要业务适配器）', exact: true })
    .check()
  await page.getByRole('textbox', { name: '网址', exact: true }).fill(meta.entry)
  await page.getByRole('textbox', { name: /^检查目标/ }).fill('')
  await page.screenshot({
    path: 'data/r0-default-entry-delivery/workbench-before-native.png',
    fullPage: true,
  })
  await page.getByRole('button', { name: '开始检查', exact: true }).click()
  await page.getByText('已完成（已验证范围）', { exact: false }).waitFor({ timeout: 30000 })
  await page.screenshot({
    path: 'data/r0-default-entry-delivery/workbench-report-native.png',
    fullPage: true,
  })
  let r: any
  for (let i = 0; i < 100; i++) {
    r = await readFile('data/r0-default-entry-delivery/workbench-result.json', 'utf8')
      .then(JSON.parse)
      .catch(() => undefined)
    if (r && r.root === meta.root) break
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!r || r.root !== meta.root) throw Error('workbench-result metadata missing')
  await page.reload()
  await page.getByRole('textbox', { name: '恢复历史运行', exact: true }).fill(r.runId)
  await page.getByRole('button', { name: '打开运行', exact: true }).click()
  await page.getByText('已完成（已验证范围）', { exact: false }).waitFor({ timeout: 10000 })
  await page.screenshot({
    path: 'data/r0-default-entry-delivery/workbench-restored.png',
    fullPage: true,
  })
  if (
    requests.length !== 1 ||
    requests[0].body.requiredChecks !== undefined ||
    requests[0].body.goal !== undefined
  )
    throw Error('ordinary form added hidden checks/goal or created duplicate run')
  await writeFile(
    'data/r0-default-entry-delivery/workbench-proof.json',
    JSON.stringify(
      {
        passed: true,
        runId: r.runId,
        requests,
        errors,
        reportText: await page.locator('body').innerText(),
        historyRestored: true,
        driver: 'repository-native Playwright actual form path',
      },
      null,
      2,
    ) + '\n',
  )
  await writeFile('data/r0-default-entry-delivery/workbench-continue', 'captured')
} finally {
  await writeFile(
    'data/r0-default-entry-delivery/workbench-driver-errors.json',
    JSON.stringify({ errors, requests }, null, 2),
  )
  await browser.close()
}
