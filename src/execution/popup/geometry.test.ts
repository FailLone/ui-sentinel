import { describe, it, expect } from 'vitest'
import { chromium } from 'playwright'
import { popupCollector } from './geometry.ts'

describe('popup geometry in Chromium', () => {
  it('measures a native panel border, ignores internal scroll, detects actual clipping, refuses transformed and replaced nodes', async () => {
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage({ viewport: { width: 640, height: 480 } })
    const collector = popupCollector(page),
      signal = new AbortController().signal
    try {
      await page.setContent(
        '<dialog style="position:fixed;width:200px;height:100px;overflow:auto"><div style="height:800px">Scrollable content</div></dialog>',
      )
      await page.locator('dialog').evaluate((n: HTMLDialogElement) => n.showModal())
      const native = (await collector.capture()).facts.find((f) => f.kind === 'native')!
      expect((await collector.measure(native.id, signal)).verdict).toBe('pass')
      await page.locator('dialog').evaluate((n) => {
        n.style.left = '600px'
        n.style.margin = '0'
        n.style.maxWidth = 'none'
      })
      expect((await collector.measure(native.id, signal)).verdict).toBe('fail')
      await page.locator('dialog').evaluate((n) => {
        n.style.transform = 'translateX(0px)'
      })
      expect((await collector.measure(native.id, signal)).verdict).toBe('unknown')
      await page.locator('dialog').evaluate((n) => {
        n.outerHTML = n.outerHTML
      })
      expect((await collector.measure(native.id, signal)).verdict).toBe('unknown')
      await page.setContent(
        '<div style="contain:paint;overflow:hidden;width:100px;height:100px"><div role="dialog" style="position:fixed;left:30px;top:30px;width:200px;height:100px">Clipped custom popup</div></div>',
      )
      const custom = (await collector.capture()).facts.find((f) => f.kind === 'dialog-role')!
      expect((await collector.measure(custom.id, signal)).verdict).toBe('fail')
      await page.locator('[role=dialog]').evaluate((n) => {
        n.parentElement!.style.contain = 'none'
      })
      expect((await collector.measure(custom.id, signal)).verdict).toBe('pass')
      await page.locator('[role=dialog]').evaluate((n) => {
        n.style.position = 'absolute'
        n.style.top = '800px'
      })
      expect((await collector.measure(custom.id, signal)).verdict).toBe('unknown')
    } finally {
      await collector.dispose()
      await browser.close()
    }
  })
})
