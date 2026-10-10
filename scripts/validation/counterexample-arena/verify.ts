/** Free Chromium + production collectors/checkers. No model, run executor, or historical scorer. */
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright'
import { cases, type ArenaCase } from '../../../evaluation/private/counterexample-arena/catalog.ts'
import { startArena } from '../../../evaluation/fixtures/counterexample-arena/server.ts'
import { brandRequirement } from '../../../evaluation/fixtures/counterexample-arena/pages.ts'
import { imageContract, imagePng } from '../../../evaluation/fixtures/image-shape.ts'
import { popupCollector } from '../../../src/execution/popup/geometry.ts'
import { readPublicCheckPage } from '../../../src/execution/default-check-runtime.ts'
import { evaluatePopupEffect } from '../../../src/inspection/popup-effect.ts'
import {
  installImageResourceCollector,
  readImagePaintFacts,
  imageResource,
} from '../../../src/execution/image-paint.ts'
import { createImageShapeDistortionRule } from '../../../src/rules/builtin/image-shape-distortion.ts'
import { readLayoutFacts, measureLayoutPixels } from '../../../src/execution/layout-facts.ts'
import {
  createControlLayoutRule,
  type LayoutReceipt,
} from '../../../src/rules/builtin/control-layout.ts'
import type { RuleContext } from '../../../src/rules/types.ts'

const root = resolve(process.argv[2]!)
const save = (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }
function context(page: Page, c: ArenaCase, screenshotPath: string): RuleContext {
  return {
    runId: 'local-fixture-verification',
    currentUrl: page.url(),
    pageTitle: '',
    timestamp: new Date().toISOString(),
    events: [],
    snapshot: {
      url: page.url(),
      title: '',
      viewport: c.viewport,
      elements: [],
      screenshotPath,
      evidenceIntegrity: clean,
    },
  }
}
async function verifyPopup(page: Page, c: Extract<ArenaCase, { family: 'popup' }>) {
  const collector = popupCollector(page)
  try {
    assert.equal((await collector.capture()).facts.length, 0, 'initially no visible floating panel')
    const before = await readPublicCheckPage(page, 'before')
    for (const name of c.actions) await page.getByRole('button', { name, exact: true }).click()
    // Independent DOM witness; no production classifier used to derive fixture truth.
    const witness = await page.evaluate(() => {
      const p = document.querySelector('#panel,dialog')
      const r = p?.getBoundingClientRect()
      return {
        panel: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
        buttons: [...document.querySelectorAll('button')].map((b) => b.textContent),
        text: p?.textContent,
      }
    })
    const captured = await collector.capture()
    if (c.expected === 'absent') {
      assert.equal(witness.panel, null)
      assert(witness.buttons.includes('Details overview'))
      assert.equal(
        captured.facts.length,
        0,
        'ordinary fixed button must not be classified as popup',
      )
    } else {
      assert(witness.panel && witness.panel.width > 0)
      assert.equal(witness.text, 'Details overview')
      const r = witness.panel
      const inside =
        r.x >= 0 &&
        r.y >= 0 &&
        r.x + r.width <= c.viewport.width &&
        r.y + r.height <= c.viewport.height
      assert.equal(inside, c.expected === 'pass')
      assert.equal(captured.facts.length, 1)
    }
    const measurements = await Promise.all(
      captured.facts.map((f) => collector.measure(f.id, new AbortController().signal, f)),
    )
    for (const m of measurements) assert.equal(m.verdict, c.expected)
    const after = [
      await readPublicCheckPage(page, 'after-1'),
      await readPublicCheckPage(page, 'after-2'),
    ]
    const effect = 'effect' in c ? evaluatePopupEffect(before, after, 'Details overview') : null
    if ('effect' in c) assert.equal(effect?.outcome, c.effect)
    return { witness, captured, measurements, effect, before, after }
  } finally {
    await collector.dispose()
  }
}
async function verifyImage(page: Page, c: Extract<ArenaCase, { family: 'image' }>, shot: string) {
  const witness = await page.locator('img').evaluate((img: HTMLImageElement) => {
    const r = img.getBoundingClientRect(),
      s = getComputedStyle(img)
    return {
      loaded: img.complete,
      natural: [img.naturalWidth, img.naturalHeight],
      width: r.width,
      height: r.height,
      fit: s.objectFit,
    }
  })
  assert.deepEqual(witness, {
    loaded: true,
    natural: [120, 60],
    width: 240,
    height: c.height,
    fit: c.fit,
  })
  assert.equal((await page.locator('body').innerText()).includes(brandRequirement), c.contracted)
  const before = await readImagePaintFacts(page, ['img'])
  await page.screenshot({ path: shot, scale: 'css' })
  const after = await readImagePaintFacts(page, ['img'])
  assert.deepEqual(before, after)
  assert.equal(after.length, 1)
  const resource = await imageResource(page, after[0]!.currentSrc!)
  assert(resource)
  assert.equal(resource.sha256, createHash('sha256').update(imagePng).digest('hex'))
  const evidenceRef = resolve(root, c.id + '-resource.png')
  await writeFile(evidenceRef, resource.bytes)
  const ctx = context(page, c, shot)
  const contract = {
    ...imageContract(page.url(), after[0]!.currentSrc!),
    basis: {
      reference: page.url(),
      statement: brandRequirement,
      confirmedBy: 'Synthetic fixture product specification',
    },
  }
  const result = await createImageShapeDistortionRule(c.contracted ? [contract] : []).evaluate({
    ...ctx,
    snapshot: {
      ...ctx.snapshot,
      imagePaint: after.map((f) => ({
        ...f,
        stable: true,
        resource: { sha256: resource.sha256, format: resource.format, evidenceRef },
      })),
    },
  })
  assert.equal(result.verdict, c.expected, JSON.stringify(result.details))
  return { witness, before, after, result }
}
async function verifyText(page: Page, c: Extract<ArenaCase, { family: 'text' }>, shot: string) {
  const witness = await page.locator('button').evaluateAll((buttons) =>
    buttons.map((b) => {
      const r = b.getBoundingClientRect(),
        s = getComputedStyle(b)
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        overflowY: s.overflowY,
        color: s.color,
        scrollWidth: b.scrollWidth,
        clientWidth: b.clientWidth,
      }
    }),
  )
  assert.equal(witness.length, 2)
  const first = witness[0]!,
    second = witness[1]!
  assert.equal(first.height, c.mode === 'clipped' ? 12 : 40)
  if (c.mode === 'clipped') assert.equal(first.overflowY, 'clip')
  if (c.mode === 'overlap') assert(second.x < first.x + first.width)
  if (c.mode === 'healthy') assert(second.x >= first.x + first.width)
  if (c.mode === 'unknown') assert.equal(first.color, 'rgb(0, 0, 128)')
  if (c.mode === 'scroll') {
    assert(first.scrollWidth > first.clientWidth)
    await page
      .locator('button')
      .first()
      .evaluate((b) => {
        b.scrollLeft = 20
      })
    assert(
      (await page
        .locator('button')
        .first()
        .evaluate((b) => b.scrollLeft)) > 0,
    )
    await page
      .locator('button')
      .first()
      .evaluate((b) => {
        b.scrollLeft = 0
      })
  }
  const before = await readLayoutFacts(page)
  const png = await page.screenshot({ path: shot, scale: 'css', caret: 'initial' })
  const facts = await readLayoutFacts(page)
  assert.deepEqual(before, facts)
  const proof = await measureLayoutPixels(page, png, facts)
  if (proof.referencePng)
    await writeFile(resolve(root, c.id + '-reference.png'), proof.referencePng)
  const ctx = context(page, c, shot)
  const receipt: LayoutReceipt = {
    runId: ctx.runId,
    observedAt: ctx.timestamp,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    screenshotRef: shot,
    facts,
    pixels: proof.pixels,
    stable: true,
    issues: [],
    evidenceRefs: [shot],
    evidenceIntegrity: clean,
  }
  const results = await Promise.all(
    (['clipping', 'overlap'] as const).map((k) =>
      createControlLayoutRule(k, receipt).evaluate(ctx),
    ),
  )
  assert.deepEqual(
    results.map((r) => r.verdict),
    c.expected,
    JSON.stringify(results),
  )
  return { witness, receipt, results }
}
const browser = await chromium.launch({ headless: true })
const results: unknown[] = []
try {
  for (const c of cases) {
    const html = c.html()
    assert(
      !/CA\d\d|healthy|defect|expected|unverified|__control|sourceMappingURL/i.test(html),
      'private labels must not be shipped',
    )
    const arena = await startArena(html)
    const ctx = await browser.newContext({ viewport: c.viewport, deviceScaleFactor: 1 })
    const requests: string[] = [],
      errors: string[] = []
    await ctx.route('**/*', (route) => {
      const url = route.request().url()
      requests.push(url)
      return new URL(url).origin === arena.origin ? route.continue() : route.abort()
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => errors.push(e.message))
    installImageResourceCollector(page)
    try {
      // No private control route, source route, query-selected case, or write API.
      for (const path of ['/__control/reset', '/catalog.ts', '/CA08', '/?case=CA08'])
        assert.equal((await fetch(arena.origin + path)).status, 404)
      assert.equal((await fetch(arena.origin, { method: 'POST' })).status, 405)
      await page.goto(arena.origin + '/')
      const initial = await page.content()
      const shot = resolve(root, c.id + '.png')
      const detail =
        c.family === 'popup'
          ? await verifyPopup(page, c)
          : c.family === 'image'
            ? await verifyImage(page, c, shot)
            : await verifyText(page, c, shot)
      if (c.family === 'popup') await page.screenshot({ path: shot })
      await save(c.id + '.json', detail)
      await page.reload()
      assert.equal(await page.content(), initial, 'reload must restore exact initial DOM')
      assert.deepEqual(errors, [])
      assert(requests.every((url) => new URL(url).origin === arena.origin))
      results.push({
        id: c.id,
        family: c.family,
        passed: true,
        expected: c.expected,
        requests,
        resetVerified: true,
      })
      console.log(`${c.id} ${c.family}: verified`)
    } catch (error) {
      await page.screenshot({ path: resolve(root, c.id + '-failure.png') }).catch(() => {})
      results.push({ id: c.id, passed: false, error: String(error) })
      throw error
    } finally {
      await ctx.close()
      await arena.close()
    }
  }
} finally {
  await browser.close()
  await save('summary.json', {
    realModelCalls: 0,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf8',
    }).trim(),
    browser: browser.version(),
    scope:
      'Fixture DOM/geometry and production collector/checker wiring only; no autonomous Agent or persisted execution claim',
    results,
  })
  console.log(`Evidence: ${root}`)
}
