import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { createCheckoutApp } from '@arena/checkout/src/server/app.ts'
import { deriveProbePoints, type Rect } from '@/execution/focus-geometry.ts'
import { bindInputToRegion } from '@/execution/focus-binding.ts'
import { createFocusMeasurer } from '@/execution/focus-measure.ts'
import { deriveNeutralPoint, type NeutralElement } from '@/execution/focus-neutral.ts'
import { evaluateFocusVerdict } from '@/execution/focus-verdict.ts'
import { FOCUS_WINDOW_MS } from '@/execution/focus-receipt.ts'
import { VISUAL_TRUTH, visualTruthFor } from '@evaluation/fixtures/visual.ts'
import { readPng, channelDistance } from '@evaluation/support/png.ts'

/** Real arena geometry and behavior tests. The separate validate:visual-focus command proves
 * the SDK/API/Agent/tool/persistence boundary; these tests do not claim that coverage. */
const CONTROL_TOKEN = 'preflight-control-token'
const PRESENTATION = { D0: 'search-padded-narrow-input', H0: 'search-proxied-wide-region' } as const
const DIST = 'arena/checkout/dist'
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

let server: Server
let browser: Browser
let page: Page
let origin = ''

const clean = () => ({ version: 1 as const, status: 'clean' as const, interventionIds: [] })

/** Serve the real arena: the API/control app plus the built SPA the page bundle was compiled from. */
function arenaServer() {
  const { app, control } = createCheckoutApp({ controlToken: CONTROL_TOKEN })
  return createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const isControl = url.pathname.startsWith('/__control')
    const target = isControl ? control : app

    if (!isControl && req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      // Static asset, or the SPA shell for a client route.
      const path = url.pathname === '/' ? '/index.html' : url.pathname
      try {
        const file = await readFile(join(DIST, path))
        res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' })
        return res.end(file)
      } catch {
        const shell = await readFile(join(DIST, 'index.html'))
        res.writeHead(200, { 'content-type': 'text/html' })
        return res.end(shell)
      }
    }

    const response = await target.fetch(
      new Request(url, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      }),
    )
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(Buffer.from(await response.arrayBuffer()))
  })
}

/** Reset the arena to a case and load its real page. C0 keeps the ordinary purchase flow intact. */
async function openCase(id: 'D0' | 'H0') {
  const response = await fetch(`${origin}/__control/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${CONTROL_TOKEN}` },
    body: JSON.stringify({ variant: 'C0', visual: PRESENTATION[id] }),
  })
  expect(response.status).toBe(200)
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
  // The search region is rendered client-side, so wait for the component rather than the document.
  await page.waitForSelector(visualTruthFor(id).targetSelector)
}

async function boxOf(selector: string) {
  const handle = await page.$(selector)
  if (!handle) throw new Error(`missing ${selector}`)
  const box = await handle.boundingBox()
  if (!box) throw new Error(`no box for ${selector}`)
  return box
}

beforeAll(async () => {
  const { build } = await import('vite')
  await build({
    configFile: 'arena/checkout/vite.config.ts',
    root: 'arena/checkout',
    logLevel: 'silent',
  })

  server = arenaServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('preflight server failed to bind')
  origin = `http://127.0.0.1:${address.port}`

  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 1280, height: 768 } })
})

afterAll(async () => {
  await browser?.close()
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe('free preflight: the real arena, real clicks, no model', () => {
  it('serves the broken presentation without leaking the case identity', async () => {
    await openCase('D0')
    const config = await (await fetch(`${origin}/api/variant-config`)).json()

    expect(config.search).toEqual({ present: 'one' })
    expect(JSON.stringify(config) + (await page.content())).not.toMatch(
      /search-padded-narrow-input|search-proxied-wide-region/,
    )
    // The case id, the truth region and the expected outcome must not be readable from the page. Every
    // coordinate is checked: leaking the region would hand the agent the answer to the overlap rule.
    const readable = JSON.stringify(config) + (await page.content())
    expect(readable).not.toMatch(/\bD0\b|\bH0\b/)
    expect(readable).not.toMatch(/not-focused|edgeFocus|expectSupported|ground.?truth/i)
    for (const value of Object.values(VISUAL_TRUTH.D0!.region))
      expect(readable).not.toContain(`"${value}`)
  })

  it('measures the broken case: the control focuses and the region padding does not', async () => {
    await openCase('D0')
    const truth = visualTruthFor('D0')
    const region: Rect = VISUAL_TRUTH.D0!.region
    const box = await boxOf(truth.targetSelector)
    const measurer = createFocusMeasurer(page)

    await page.getByRole('heading', { name: 'Our Products', exact: true }).click()
    const control = await measurer.clickAndMeasure({
      selector: truth.targetSelector,
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      windowMs: FOCUS_WINDOW_MS,
    })
    expect(control.focusedWithinMs).not.toBeNull()
    expect(control.focusBefore).toBeNull()

    const { points } = deriveProbePoints({ region, excluded: [], dangerous: [] })
    expect(points.length).toBeGreaterThanOrEqual(2)

    const samples = []
    for (const point of [...points, points[0]]) {
      // Each sample starts from a verified unfocused baseline, established by a real click.
      await page.getByRole('heading', { name: 'Our Products', exact: true }).click()
      const sample = await measurer.clickAndMeasure({
        selector: truth.targetSelector,
        x: point.x,
        y: point.y,
        windowMs: FOCUS_WINDOW_MS,
      })
      samples.push(sample)
    }

    for (const sample of samples) {
      expect(sample.focusBefore).toBeNull()
      expect(sample.focusedWithinMs).toBeNull()
    }

    const verdict = evaluateFocusVerdict({
      control: { ok: true, focusedWithinMs: control.focusedWithinMs, integrity: clean() },
      attempts: samples.map((s, i) => ({
        side: points[i % points.length].side,
        retest: i === points.length,
        baselineUnfocused: s.focusBefore === null,
        focusedWithinMs: s.focusedWithinMs,
        integrity: clean(),
      })),
      resets: [],
      usableEdgePoints: points.length,
    })
    expect(verdict.validationStatus).toBe('supported')
    expect(truth.expectSupported).toBe(true)
    expect(verdict.scope).toContain(`${FOCUS_WINDOW_MS}ms`)
  })

  it('passes the container-proxy case as healthy even though the click lands on a wrapper', async () => {
    await openCase('H0')
    const truth = visualTruthFor('H0')
    const region: Rect = VISUAL_TRUTH.H0!.region
    const measurer = createFocusMeasurer(page)
    const { points } = deriveProbePoints({ region, excluded: [], dangerous: [] })

    const samples = []
    for (const point of points) {
      await page.getByRole('heading', { name: 'Our Products', exact: true }).click()
      samples.push(
        await measurer.clickAndMeasure({
          selector: truth.targetSelector,
          x: point.x,
          y: point.y,
          windowMs: FOCUS_WINDOW_MS,
        }),
      )
    }

    // The delegate hands focus to the input while the hit element is the wrapper.
    expect(samples.some((s) => s.hit.tag !== 'input')).toBe(true)
    expect(samples.every((s) => s.focusedWithinMs !== null)).toBe(true)

    const verdict = evaluateFocusVerdict({
      control: { ok: true, focusedWithinMs: 40, integrity: clean() },
      attempts: samples.map((s, i) => ({
        side: points[i % points.length].side,
        retest: i === points.length,
        baselineUnfocused: true,
        focusedWithinMs: s.focusedWithinMs,
        integrity: clean(),
      })),
      resets: [],
      usableEdgePoints: points.length,
    })
    // A healthy delegate must never be reported as a defect.
    expect(verdict.validationStatus).toBe('refuted')
    expect(truth.expectSupported).toBe(false)
  })

  it('resolves the already-focused case to unknown rather than manufacturing a defect', async () => {
    await openCase('D0')
    const truth = visualTruthFor('D0')
    const region: Rect = VISUAL_TRUTH.D0!.region
    const box = await boxOf(truth.targetSelector)
    const measurer = createFocusMeasurer(page)
    const { points } = deriveProbePoints({ region, excluded: [], dangerous: [] })

    // Leave the input focused and sample WITHOUT resetting: exactly the trap plan 4.4 names.
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    expect(await measurer.isFocused(truth.targetSelector)).toBe(true)

    const samples = []
    for (const point of points) {
      samples.push(
        await measurer.clickAndMeasure({
          selector: truth.targetSelector,
          x: point.x,
          y: point.y,
          windowMs: FOCUS_WINDOW_MS,
        }),
      )
    }
    // The page reported the target as already focused, which is what makes the result worthless.
    expect(samples.some((s) => s.targetFocusedBefore)).toBe(true)

    const verdict = evaluateFocusVerdict({
      control: { ok: true, focusedWithinMs: 40, integrity: clean() },
      attempts: samples.map((s, i) => ({
        side: points[i % points.length].side,
        retest: i === points.length,
        baselineUnfocused: !s.targetFocusedBefore,
        focusedWithinMs: s.focusedWithinMs,
        integrity: clean(),
      })),
      resets: [],
      usableEdgePoints: points.length,
    })
    // This is the false positive the whole design exists to prevent.
    expect(verdict.validationStatus).toBe('inconclusive')
    expect(verdict.reasons).toContain('baseline-not-established')
  })

  it('derives a neutral point that really clears focus without changing the page', async () => {
    await openCase('D0')
    const truth = visualTruthFor('D0')
    const box = await boxOf(truth.targetSelector)
    const measurer = createFocusMeasurer(page)
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    expect(await measurer.isFocused(truth.targetSelector)).toBe(true)

    // Everything the page exposes, read the way the executor reads it, minus the region.
    const elements: NeutralElement[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('*'))
        .slice(0, 500)
        .map((el) => {
          const b = el.getBoundingClientRect()
          const id = (el as HTMLElement).id
          return {
            ref: `${el.tagName.toLowerCase()}${id ? `#${id}` : ''}`,
            tag: el.tagName.toLowerCase(),
            bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
            enabled: !('disabled' in el && (el as HTMLInputElement).disabled),
            blocked: false,
          }
        }),
    )
    const point = deriveNeutralPoint({
      viewport: { width: 1280, height: 768 },
      region: VISUAL_TRUTH.D0!.region,
      elements,
    })
    expect(point).not.toBeNull()

    const reset = await measurer.neutralReset({
      selector: truth.targetSelector,
      x: point!.x,
      y: point!.y,
    })
    expect(reset.introducedChange).toBe(false)
    expect(await measurer.isFocused(truth.targetSelector)).toBe(false)
  })

  it('draws a search field that is actually visible against the page background', async () => {
    // A case whose whole premise is "a wide field LOOKS like one input, but only a narrow part of it
    // focuses" is meaningless if the field cannot be seen: no vision model, and no person, could
    // report a region that differs from the page by a couple of levels out of 255. The P1 fixture
    // drew exactly that - rgb(244,246,248) on rgb(245,245,245), no border, no shadow - and the
    // fixed response in the preflight named the region anyway, so nothing noticed. This checks the
    // rendered pixels, which is the only place the claim can actually be true or false.
    await openCase('D0')
    const region = VISUAL_TRUTH.D0!.region
    const image = await page.screenshot({ scale: 'css' })
    const png = readPng(image)
    const midY = Math.round(region.y + region.height / 2)

    // Straight across the field's vertical centre: inside the left padding, then well outside.
    const pageColour = png.at(Math.round(region.x - 40), midY)

    // Scan a line across the field's left edge. The boundary is what makes the shape visible: a
    // hairline border achieves it just as well as a tinted fill, so the check is the strongest
    // difference found anywhere across the edge rather than the difference at one chosen pixel.
    let strongest = 0
    for (let x = Math.round(region.x - 6); x <= Math.round(region.x + 12); x++)
      strongest = Math.max(strongest, channelDistance(png.at(x, midY), pageColour))
    expect(strongest).toBeGreaterThan(20)
  })

  it('pins the ground-truth region to the region the real page actually draws', async () => {
    // The scorer's rectangle is a claim about the page. If the layout moves, the claim goes stale and
    // every correct candidate starts failing the overlap check, so the claim is checked against the
    // live DOM rather than trusted.
    await openCase('D0')
    const measured = await page.evaluate((selector) => {
      const region = document.querySelector('.visual-search-region')!.getBoundingClientRect()
      const input = document.querySelector(selector)!.getBoundingClientRect()
      return {
        region: { x: region.x, y: region.y, width: region.width, height: region.height },
        input: { x: input.x, y: input.y, width: input.width, height: input.height },
      }
    }, visualTruthFor('D0').targetSelector)

    const truth = VISUAL_TRUTH.D0!.region
    expect(Math.round(measured.region.x)).toBe(truth.x)
    expect(Math.round(measured.region.width)).toBe(truth.width)
    expect(Math.round(measured.region.y)).toBe(truth.y)
    expect(Math.round(measured.region.height)).toBe(truth.height)

    // The input box is pinned too. The real-model probe showed why: Qwen's answer was the INPUT, so
    // both derived points landed inside it and the probe refuted - the defect was never measured.
    const input = VISUAL_TRUTH.D0!.inputBox
    expect(Math.round(measured.input.x)).toBe(input.x)
    expect(Math.round(measured.input.width)).toBe(input.width)
    expect(Math.round(measured.input.y)).toBe(input.y)
    expect(Math.round(measured.input.height)).toBe(input.height)

    // The point of the case is that the derived probe points land OUTSIDE the native input, on the
    // padding that looks like part of the field. If they fell inside it, D0 would not be a defect at
    // all and every assertion below would be measuring the wrong thing.
    const { points } = deriveProbePoints({
      region: truth,
      excluded: [],
      dangerous: [],
    })
    expect(points.length).toBeGreaterThanOrEqual(2)
    for (const point of points) {
      const outsideInput =
        point.x < measured.input.x || point.x > measured.input.x + measured.input.width
      expect(outsideInput).toBe(true)
    }
  })

  it('binds the ground-truth region to the one native input', async () => {
    await openCase('D0')
    const truth = visualTruthFor('D0')
    const elements = await page.evaluate((selector) => {
      return Array.from(document.querySelectorAll('input,button,a')).map((el, index) => {
        const b = el.getBoundingClientRect()
        return {
          ref: `e${index + 1}`,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') ?? undefined,
          id: (el as HTMLElement).id || undefined,
          bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
          visible: b.width > 0 && b.height > 0,
          enabled: !('disabled' in el && (el as HTMLInputElement).disabled),
          isTarget: el.matches(selector),
        }
      })
    }, truth.targetSelector)

    const result = bindInputToRegion({
      region: VISUAL_TRUTH.D0!.region,
      excluded: [],
      elements,
      dangerous: elements
        .filter((e) => /^(button|a)$/.test(e.tag))
        .map((e) => ({ ref: e.ref, tag: e.tag, bounds: e.bounds })),
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    // The region must resolve to the real input, not to a nearby control.
    expect(result.elementRef).toBe(elements.find((e) => e.isTarget)!.ref)
    expect(result.nodeIdentity).toContain('input#')
  })

  it('refuses to bind a region that carries a live submit control', async () => {
    // The safety rule, exercised against the real component rather than a fixture: a button inside the
    // perceived region makes clicking there unsafe regardless of which input might be bound.
    await openCase('D0')
    const truth = visualTruthFor('D0')
    const elements = await page.evaluate((selector) => {
      return Array.from(document.querySelectorAll('input,button,a')).map((el, index) => {
        const b = el.getBoundingClientRect()
        return {
          ref: `e${index + 1}`,
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') ?? undefined,
          id: (el as HTMLElement).id || undefined,
          bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
          visible: b.width > 0 && b.height > 0,
          enabled: !('disabled' in el && (el as HTMLInputElement).disabled),
          isTarget: el.matches(selector),
        }
      })
    }, truth.targetSelector)

    // A real "Add to Cart" button, placed where the region is, is a control the probe must not click.
    const realButton = elements.find((e) => e.tag === 'button' && e.visible)!
    const result = bindInputToRegion({
      region: VISUAL_TRUTH.D0!.region,
      excluded: [],
      elements,
      dangerous: [{ ref: realButton.ref, tag: 'button', bounds: VISUAL_TRUTH.D0!.region }],
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('dangerous-control-in-region')
  })
})
