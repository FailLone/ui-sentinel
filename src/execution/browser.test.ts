import { describe, it, expect, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  launchBrowser,
  saveScreenshot,
  sampleElementCondition,
  type BrowserWorker,
} from './browser.ts'

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

it('samples pointer actionability without clicks, scrolling or confusing enabled with unoccluded', async () => {
  const worker = await launchBrowser({ headless: true })
  try {
    const page = worker.page
    await page.setContent(
      `<style>button{position:absolute;left:40px;top:40px;width:200px;height:80px}#cover{position:fixed;inset:0;z-index:10;background:gray}</style><button onclick="document.body.dataset.clicked='yes'"><span>Pay</span></button><div id="cover"></div>`,
    )
    expect(await page.locator('button').isEnabled()).toBe(true)
    expect(await sampleElementCondition(page, 'button', 'element-visible')).toBe(true)
    expect(await sampleElementCondition(page, 'button', 'element-actionable')).toBe(false)
    await expect(page.locator('button').click({ trial: true, timeout: 150 })).rejects.toThrow()
    await page.locator('#cover').evaluate((el) => el.remove())
    expect(await sampleElementCondition(page, 'button', 'element-actionable')).toBe(true)
    await page.locator('button').click({ trial: true, timeout: 500 })
    await page.locator('button').evaluate((el: HTMLButtonElement) => {
      el.disabled = true
    })
    expect(await sampleElementCondition(page, 'button', 'element-actionable')).toBe(false)
    await page.locator('button').evaluate((el: HTMLButtonElement) => {
      el.disabled = false
      el.style.top = '2000px'
    })
    expect(await sampleElementCondition(page, 'button', 'element-actionable')).toBe(false)
    expect(await sampleElementCondition(page, '.absent', 'element-actionable')).toBeNull()
    expect(
      await page.evaluate(() => ({ scroll: scrollY, clicked: document.body.dataset.clicked })),
    ).toEqual({ scroll: 0, clicked: undefined })
  } finally {
    await worker.close()
  }
})
