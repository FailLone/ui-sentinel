import { describe, it, expect, afterAll } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {
  launchBrowser,
  saveScreenshot,
  sampleElementCondition,
  sampleBoundElementCondition,
  type BrowserWorker,
} from './browser.ts'

/**
 * Budget for Playwright's own trial-click cross-check in the actionability test.
 *
 * The product sampler (`sampleElementCondition`) is what the assertion is really about, and it is
 * synchronous and instant. This trial click only exists so the test does not grade the sampler
 * against itself. Playwright polls for actionability internally, so a tight budget here measures
 * browser startup contention rather than the behaviour under test - under full-suite concurrency
 * (one Chromium per worker, 14 on this host) the same actionable button needed up to ~3.7s. Generous
 * by design: it is only a ceiling, so a slower machine cannot turn a correct page into a failure.
 * The falsifying half is unaffected and runs before it - against the covering overlay the click must
 * still reject, and slowness only makes that rejection more certain.
 */
const ACTIONABILITY_CROSS_CHECK_MS = 15_000

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
    // This trial click is an independent cross-check of the sampler above: Playwright must agree the
    // button is actionable. It polls internally, so the budget is a ceiling on *how long we wait for
    // that agreement*, not a measurement of click latency - therefore it must clear the worst case of
    // the machine, not the best. Measured on a 14-core host: with 14 Chromium instances launching at
    // once this call needs up to ~3.7s even though the element is genuinely actionable, whereas the
    // same page settles in ~30ms when the suite is not saturated. A 500ms ceiling made the assertion
    // fail ~60% of full-suite runs while the product sampler on the line above passed every time -
    // i.e. it graded browser startup contention, not actionability.
    await page.locator('button').click({ trial: true, timeout: ACTIONABILITY_CROSS_CHECK_MS })
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

it('keeps a bound measurement on its physical element rather than following a replacement selector', async () => {
  const worker = await launchBrowser({ headless: true })
  try {
    await worker.page.setContent('<button disabled>Try Again</button>')
    const handle = await worker.page.locator('button').elementHandle()
    expect(handle).toBeTruthy()
    expect(await sampleBoundElementCondition(handle!, 'element-actionable')).toBe(false)
    await worker.page.locator('button').evaluate((el) => {
      el.outerHTML = '<button>Other retry</button>'
    })
    expect(await sampleBoundElementCondition(handle!, 'element-actionable')).toBeNull()
    expect(await sampleElementCondition(worker.page, 'button', 'element-actionable')).toBe(true)
    await handle!.dispose()
  } finally {
    await worker.close()
  }
})
