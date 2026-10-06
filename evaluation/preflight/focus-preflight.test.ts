import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { readFile, readdir, mkdir } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'
import { createCheckoutApp } from '@arena/checkout/src/server/app.ts'
import { VISUAL_PRESENTS } from '@arena/checkout/src/server/state.ts'
import { deriveProbePoints, type Rect } from '@/execution/focus-geometry.ts'
import { bindInputToRegion } from '@/execution/focus-binding.ts'
import { createFocusMeasurer } from '@/execution/focus-measure.ts'
import { deriveNeutralPoint, type NeutralElement } from '@/execution/focus-neutral.ts'
import { evaluateFocusVerdict } from '@/execution/focus-verdict.ts'
import { FOCUS_WINDOW_MS } from '@/execution/focus-receipt.ts'
import {
  VISUAL_TRUTH,
  VISUAL_VIEWPORTS,
  visualTruthFor,
  isVisualCaseId,
  type VisualCaseId,
} from '@evaluation/fixtures/visual.ts'
import regression from '@evaluation/fixtures/visual-regression-1.json'
import { readPng, channelDistance } from '@evaluation/support/png.ts'

/** Real arena geometry and behavior tests. The separate validate:visual-focus command proves
 * the SDK/API/Agent/tool/persistence boundary; these tests do not claim that coverage. */
const CONTROL_TOKEN = 'preflight-control-token'
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

/**
 * Matches any presentation's own name, built from the list the server actually uses.
 *
 * A hand-written alternation silently goes stale the moment a presentation is added or renamed, and
 * a stale pattern fails open - it reports "no leak" because it is looking for names nothing uses.
 */
function presentationNamePattern(): RegExp {
  expect(VISUAL_PRESENTS.length).toBeGreaterThan(0)
  return new RegExp(VISUAL_PRESENTS.join('|'))
}

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

/**
 * Reset the arena to a case and load its real page. C0 keeps the ordinary purchase flow intact.
 *
 * The viewport comes from the private truth, because the narrow holdouts are deliberately run at a
 * different size; running them at the diagnostic viewport would silently test a different layout
 * from the one their truth describes.
 */
async function openCase(id: VisualCaseId, previous = false) {
  const viewport = previous ? regression.viewports[id] : VISUAL_VIEWPORTS[id]
  const truth = previous ? regression.truth[id] : visualTruthFor(id)
  await page.setViewportSize(viewport)
  const response = await fetch(`${origin}/__control/reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${CONTROL_TOKEN}` },
    body: JSON.stringify({ variant: 'C0', visual: truth.presentation }),
  })
  expect(response.status).toBe(200)
  await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
  // The search region is rendered client-side, so wait for the component rather than the document.
  await page.waitForSelector(truth.targetSelector)
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
  it('keeps the scenario table out of the actual public build', async () => {
    const assets = await readdir(join(DIST, 'assets'))
    const scripts = await Promise.all(
      assets.filter((a) => a.endsWith('.js')).map((a) => readFile(join(DIST, 'assets', a), 'utf8')),
    )
    expect(scripts.length).toBeGreaterThan(0)
    const code = scripts.join('\n')
    for (const name of VISUAL_PRESENTS) expect(code).not.toContain(name)
    expect(code).not.toMatch(/proxy:"(?:none|field|label)"|delegate:!|v1:\{/)
    await openCase('D0')
    const response = await fetch(
      `${origin}/api/variant-config?present=v2&visual=search-proxied-wide-region`,
    )
    expect((await response.json()).search.html).toContain('<div class="visual-search-region"')
  })

  it('checks all six real behaviours, including the adjacent button and changed wording', async () => {
    await mkdir('data/visual-fixtures', { recursive: true })
    for (const id of Object.keys(VISUAL_TRUTH) as VisualCaseId[]) {
      await openCase(id)
      const truth = visualTruthFor(id)
      const measurer = createFocusMeasurer(page)
      const { points } = deriveProbePoints({
        region: truth.region,
        excluded: truth.excludedRegions,
        dangerous: [],
      })
      if (id === 'D1')
        await expect
          .poll(() => page.locator(truth.targetSelector).getAttribute('placeholder'))
          .toBe('Look up an item')
      if (id === 'H2') {
        const button = page.getByRole('button', { name: 'Clear search', exact: true })
        expect(await button.isVisible()).toBe(true)
        const box = await button.boundingBox()
        expect(box!.x).toBeGreaterThan(truth.region.x + truth.region.width)
        expect(box!.x + box!.width).toBeLessThan(VISUAL_VIEWPORTS[id].width)
        await page.evaluate(() => {
          ;(window as any).adjacentClicks = 0
          document
            .querySelector('.visual-search-clear')!
            .addEventListener('click', () => (window as any).adjacentClicks++)
        })
      }
      for (const point of [...points, points[0]]) {
        await page.getByRole('heading', { name: 'Our Products', exact: true }).click()
        const sample = await measurer.clickAndMeasure({ selector: truth.targetSelector, ...point })
        expect(sample.targetFocusedBefore).toBe(false)
        expect(sample.stable).toBe(true)
        expect(sample.focusedWithinMs === null, `${id}: ${point.side}`).toBe(
          truth.edgeFocus === 'not-focused',
        )
      }
      await page.screenshot({ path: `data/visual-fixtures/${id}.png`, scale: 'css' })
      if (id === 'H2') {
        expect(await page.evaluate(() => (window as any).adjacentClicks)).toBe(0)
        await page.locator(truth.targetSelector).fill('no such product')
        expect(await page.locator('.product-card').count()).toBe(0)
        await page.getByRole('button', { name: 'Clear search', exact: true }).click()
        await expect.poll(() => page.locator('.product-card').count()).toBe(3)
        expect(await page.locator(truth.targetSelector).inputValue()).toBe('')
      }
    }
  })

  it('retains the three retired holdouts as real-browser regression cases', async () => {
    for (const id of ['D1', 'D2', 'H2'] as const) {
      await openCase(id, true)
      const truth = regression.truth[id]
      const measured = await boxOf(truth.targetSelector)
      for (const key of ['x', 'y', 'width', 'height'] as const)
        expect(Math.abs(measured[key] - truth.inputBox[key])).toBeLessThanOrEqual(1)
      const { points } = deriveProbePoints({
        region: truth.region,
        excluded: truth.excludedRegions,
        dangerous: [],
      })
      const measurer = createFocusMeasurer(page)
      for (const point of points) {
        await page.getByRole('heading', { name: 'Our Products', exact: true }).click()
        const sample = await measurer.clickAndMeasure({ selector: truth.targetSelector, ...point })
        expect(sample.targetFocusedBefore).toBe(false)
        expect(sample.focusedWithinMs === null).toBe(truth.edgeFocus === 'not-focused')
      }
    }
  })

  it('checks for every real presentation name, including the ones a hand-list missed', () => {
    // The regression guard for the leak pattern. `search-warm-offset-field`,
    // `search-label-icon-field` and `search-labelled-proxy-field` were all absent from the version
    // a human wrote, so the leak assertions were passing while looking for names that did not exist.
    const pattern = presentationNamePattern()
    for (const name of VISUAL_PRESENTS) expect(pattern.test(name), `unmatched "${name}"`).toBe(true)
  })

  it('serves the broken presentation without leaking the case identity', async () => {
    await openCase('D0')
    const config = await (await fetch(`${origin}/api/variant-config`)).json()

    expect(Object.keys(config.search)).toEqual(['html'])
    expect(config.search.html).toContain('<input')
    // Derived from the real presentation list, not hand-written. The hand-written version had drifted
    // two names out of date: it checked for names that no longer existed while three that did were
    // absent from it, so those three could have been exposed without this test noticing.
    expect(JSON.stringify(config) + (await page.content())).not.toMatch(presentationNamePattern())
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

  it('pins every case: the truth matches the page, and defects sample the padding', async () => {
    // The whole matrix checked against the real pages, at each case's own viewport. A truth table
    // that drifted from the page would grade correct work as wrong, and a defect whose probe points
    // landed inside its input could never be detected at all.
    for (const id of ['D0', 'H0', 'H1', 'D1', 'D2', 'H2'] as VisualCaseId[]) {
      if (!isVisualCaseId(id)) continue
      await openCase(id)
      const truth = visualTruthFor(id)
      const viewport = VISUAL_VIEWPORTS[id]
      const measured = await page.evaluate((selector) => {
        const r = document.querySelector('.visual-search-region')!.getBoundingClientRect()
        const i = document.querySelector(selector)!.getBoundingClientRect()
        return {
          region: { x: r.x, y: r.y, width: r.width, height: r.height },
          input: { x: i.x, y: i.y, width: i.width, height: i.height },
        }
      }, truth.targetSelector)
      // Collected rather than asserted one by one, so a failure names the case and the field that
      // drifted instead of stopping at the first mismatch with a bare pair of numbers.
      const near = (a: number, b: number) => Math.abs(a - b) <= 1
      const drift = [
        ['region.x', measured.region.x, truth.region.x],
        ['region.y', measured.region.y, truth.region.y],
        ['region.width', measured.region.width, truth.region.width],
        ['region.height', measured.region.height, truth.region.height],
        ['input.x', measured.input.x, truth.inputBox.x],
        ['input.y', measured.input.y, truth.inputBox.y],
        ['input.width', measured.input.width, truth.inputBox.width],
        ['input.height', measured.input.height, truth.inputBox.height],
      ]
        .filter(([, actual, expected]) => !near(actual as number, expected as number))
        .map(([field, actual, expected]) => `${id}.${field}: page ${actual}, truth ${expected}`)
      expect(drift).toEqual([])

      // The region and the input must be fully inside the current viewport, since this round makes
      // no claim about cross-screen coordinates.
      expect(measured.region.x).toBeGreaterThanOrEqual(0)
      expect(measured.region.y).toBeGreaterThanOrEqual(0)
      expect(measured.region.x + measured.region.width).toBeLessThanOrEqual(viewport.width)
      expect(measured.region.y + measured.region.height).toBeLessThanOrEqual(viewport.height)

      // The derived points decide what the probe actually samples, so the case's claim about its own
      // edge behaviour only holds if they land on the right side of the input.
      const { points } = deriveProbePoints({ region: truth.region, excluded: [], dangerous: [] })
      expect(points.length).toBeGreaterThanOrEqual(2)
      const placement = points.map((point) =>
        point.x >= measured.input.x && point.x <= measured.input.x + measured.input.width
          ? 'inside'
          : 'outside',
      )
      // H1's control IS its input, so its points must land inside; every other case samples padding.
      expect(`${id}: ${placement.join(',')}`).toBe(
        id === 'H1' ? 'H1: inside,inside' : `${id}: outside,outside`,
      )
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
