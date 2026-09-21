import { describe, it, expect, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { launchBrowser, saveScreenshot, type BrowserWorker } from './browser.ts'

describe('browser worker', () => {
  let worker: BrowserWorker | null = null

  afterAll(async () => {
    if (worker) await worker.close()
  })

  it('launches chromium and navigates to a data URL', async () => {
    worker = await launchBrowser({ headless: true })
    await worker.page.goto('data:text/html,<h1>UI Sentinel Test</h1>')
    const title = await worker.page.textContent('h1')
    expect(title).toBe('UI Sentinel Test')
  })

  it('saves a viewport screenshot', async () => {
    if (!worker) throw new Error('browser not launched')

    await worker.page.goto('data:text/html,<h1 style="color:red">Screenshot Test</h1>')
    const filepath = await saveScreenshot(worker.page, 'test-run', 'viewport')

    const stat = await fs.stat(filepath)
    expect(stat.size).toBeGreaterThan(0)

    // cleanup
    await fs.rm(path.dirname(filepath), { recursive: true })
  })

  it('respects viewport dimensions', async () => {
    const custom = await launchBrowser({
      headless: true,
      viewport: { width: 375, height: 812 },
    })

    await custom.page.goto('data:text/html,<h1>Mobile</h1>')
    const size = await custom.page.viewportSize()
    expect(size).toEqual({ width: 375, height: 812 })

    await custom.close()
  })
})
