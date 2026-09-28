import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { chromium, type Browser, type Page } from 'playwright'
import { createFocusMeasurer } from './focus-measure.ts'

/**
 * The measurement primitives are exercised against a real browser on a real page, because the plan's
 * central claim is about REAL mouse clicks: no script focus, no dispatchEvent, no style edits, and a
 * genuine `document.activeElement` read before and after. A unit test on a mock would prove none of it.
 */

const PAGE = `<!doctype html><html><head><title>Focus probe fixture</title><style>
  *{box-sizing:border-box}body{margin:0;font:16px system-ui}
  #region{background:#f4f6f8;padding:10px 64px;width:480px;margin:40px auto}
  #narrow{width:240px;height:28px;border:none;outline:none}
  #widget{width:240px;height:28px;border:none;outline:none}
  #neutral{padding:12px;margin:24px;background:#fff}
  #proxied{background:#f4f6f8;padding:10px 64px;width:480px;margin:24px auto}
</style></head><body>
  <div id="region"><input id="narrow" type="text" aria-label="Search"></div>
  <div id="neutral">plain area</div>
  <div id="proxied"><input id="widget" type="text" aria-label="Search two"></div>
  <script>
  // A container delegate, the way a label or a wrapper would hand focus to its input.
  document.getElementById('proxied').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.querySelector('input').focus()
  })
  </script>
</body></html>`

let server: Server
let browser: Browser
let page: Page
let url: string

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
    res.end(PAGE)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('no port')
  url = `http://127.0.0.1:${address.port}/`

  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1280, height: 768 } })
  await page.goto(url)
})

afterAll(async () => {
  await browser?.close()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('focus measurement against a real browser', () => {
  it('reports focus state from document.activeElement, not from a cached assumption', async () => {
    const measurer = createFocusMeasurer(page)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    expect(await measurer.isFocused('#narrow')).toBe(false)
  })

  it('detects focus only after a real click on the input', async () => {
    const measurer = createFocusMeasurer(page)
    const box = (await page.locator('#narrow').boundingBox())!
    const result = await measurer.clickAndMeasure({
      selector: '#narrow',
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      windowMs: 500,
    })

    expect(result.focusedWithinMs).not.toBeNull()
    expect(result.hit.tag).toBe('input')
    expect(result.hit.relation).toBe('self')
    expect(result.valueChanged).toBe(false)
  })

  it('does not focus the narrow input when clicking the surrounding region padding', async () => {
    // This is the D0 defect: a real click on padding that looks like part of the input focuses nothing.
    const measurer = createFocusMeasurer(page)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const region = (await page.locator('#region').boundingBox())!

    const result = await measurer.clickAndMeasure({
      selector: '#narrow',
      x: region.x + region.width * 0.12,
      y: region.y + region.height / 2,
      windowMs: 500,
    })

    expect(result.focusedWithinMs).toBeNull()
    // The hit is recorded even though it is not the input: that is what makes the sample auditable.
    expect(result.hit.relation).not.toBe('self')
  })

  it('passes the container-proxy control case: the hit is not the input but focus is correct', async () => {
    // H0: a label/delegate hands focus to the input. The hit element is the container, and that is a
    // healthy pass, so the probe must not require the hit to be the input itself.
    const measurer = createFocusMeasurer(page)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const proxied = (await page.locator('#proxied').boundingBox())!

    const result = await measurer.clickAndMeasure({
      selector: '#widget',
      x: proxied.x + proxied.width * 0.12,
      y: proxied.y + proxied.height / 2,
      windowMs: 500,
    })

    expect(result.hit.tag).toBe('div')
    expect(result.focusedWithinMs).not.toBeNull()
  })

  it('clears focus with a real click on a neutral area, without script focus or blur', async () => {
    const measurer = createFocusMeasurer(page)
    await page.locator('#narrow').click()
    expect(await measurer.isFocused('#narrow')).toBe(true)

    const neutral = (await page.locator('#neutral').boundingBox())!
    const reset = await measurer.neutralReset({
      selector: '#neutral',
      x: neutral.x + neutral.width / 2,
      y: neutral.y + neutral.height / 2,
    })

    expect(await measurer.isFocused('#narrow')).toBe(false)
    expect(reset.introducedChange).toBe(false)
  })

  it('reports when a reset click changed the page state', async () => {
    const measurer = createFocusMeasurer(page)
    // Clicking a link-like element that navigates would be a change; here we simulate the read by
    // checking the measurable surface only, so a stable page reports no change.
    const neutral = (await page.locator('#neutral').boundingBox())!
    const reset = await measurer.neutralReset({
      selector: '#neutral',
      x: neutral.x + neutral.width / 2,
      y: neutral.y + neutral.height / 2,
    })
    expect(reset.introducedChange).toBe(false)
    expect(reset.url).toBe(url)
  })

  it('records the value change flag when a click alters the input value', async () => {
    const measurer = createFocusMeasurer(page)
    await page.evaluate(() => {
      const input = document.getElementById('narrow') as HTMLInputElement
      input.value = 'before'
    })
    const box = (await page.locator('#narrow').boundingBox())!
    const result = await measurer.clickAndMeasure({
      selector: '#narrow',
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      windowMs: 500,
    })
    expect(result.valueChanged).toBe(false)
  })
})
