import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { rm, readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { launchBrowser, observePage, type BrowserWorker } from './browser.ts'
import { readImagePaintFacts } from './image-paint.ts'
import { readObservationVersion } from './observation-version.ts'
import { createRun } from './run-manager.ts'
import {
  imageContract,
  imageHtml,
  imageDataUrl,
  imagePng,
} from '../../evaluation/fixtures/image-shape.ts'
import { createImageShapeDistortionRule } from '../rules/builtin/image-shape-distortion.ts'
import { createRuleEvaluationCache } from '../rules/routing.ts'
import type { ImageShapeContract } from '../rules/image-shape.ts'
import type { RuleContext, PageSnapshot } from '../rules/types.ts'
import { getDbClient } from '../storage/database.ts'

let worker: BrowserWorker, runId: string
beforeAll(async () => {
  worker = await launchBrowser({ collectImageResources: true })
  runId = (
    await createRun({
      goal: 'Synthetic image facts, no model',
      environmentId: 'test',
      entryUrl: 'about:blank',
    })
  ).id
})
afterAll(async () => {
  await worker.close()
  await rm(`data/artifacts/${runId}`, { recursive: true, force: true })
})
beforeEach(() => vi.restoreAllMocks())
async function evaluate(contract: ImageShapeContract = imageContract()) {
  const observed = await observePage(worker.page, runId, undefined, [contract.selector])
  const context: RuleContext = {
    runId,
    currentUrl: observed.snapshot.url,
    pageTitle: observed.snapshot.title,
    timestamp: observed.snapshot.observedAt,
    events: [],
    snapshot: observed.snapshot as PageSnapshot,
  }
  const result = await createImageShapeDistortionRule([contract]).evaluate(context)
  return { result, observed, context }
}

describe('synthetic native raster paint in Chromium', () => {
  it.each([
    ['fill stretches content', 'height:60px', '', 'fail'],
    ['intrinsic ratio with transparent margins', '', '', 'pass'],
    ['contain letterboxing in square element', 'height:240px;object-fit:contain', '', 'pass'],
    ['cover cropping in square element', 'height:240px;object-fit:cover', '', 'pass'],
    ['none in square element', 'height:240px;object-fit:none', '', 'pass'],
    ['scale-down', 'width:80px;height:80px;object-fit:scale-down', '', 'pass'],
    [
      'content box excludes padding and border',
      'box-sizing:border-box;width:280px;height:160px;padding:10px;border:10px solid black',
      '',
      'pass',
    ],
    ['uniform scaling and rotation', 'transform:rotate(20deg) scale(1.1)', '', 'pass'],
    ['reflection preserves shape', 'transform:scaleX(-1)', '', 'pass'],
    ['ancestor unequal scale', '', 'transform:scale(1.1,0.6);transform-origin:top left', 'fail'],
    ['shear with equal column lengths', 'transform:matrix(1,0,0.6,0.8,0,0)', '', 'fail'],
    ['compensating composed scales', 'height:60px;transform:scaleY(2)', '', 'pass'],
    [
      'ancestor cancels child scale',
      'transform:scaleY(2)',
      'transform:scaleY(.5);transform-origin:top left',
      'pass',
    ],
    ['small uncertainty zone', 'height:119px', '', 'unknown'],
    ['3D transform', 'transform:rotateY(30deg)', '', 'unknown'],
    ['running animation', 'animation:pulse 1s infinite', '', 'unknown'],
    ['individual scale unsupported', 'scale:1 .5', '', 'unknown'],
    ['custom object position', 'object-position:left top', '', 'unknown'],
    ['clipped ancestor', '', 'overflow:hidden;width:100px', 'unknown'],
    ['mask', 'mask-image:linear-gradient(black,transparent)', '', 'unknown'],
    ['display none ancestor', '', 'display:none', 'not-applicable'],
    ['outside viewport', 'position:absolute;top:2000px', '', 'not-applicable'],
  ])('%s', async (_name, style, outer, verdict) => {
    await worker.page.setContent(
      '<style>@keyframes pulse{from{opacity:1}to{opacity:.9}}</style>' +
        imageHtml(style, imageDataUrl, outer),
    )
    const { result, observed } = await evaluate()
    expect(result.verdict, JSON.stringify(result.details)).toBe(verdict)
    expect(observed.snapshot.imagePaint?.[0].resource?.format).toBe('png')
    expect(result.evidenceRefs).toContain(observed.snapshot.screenshotPath)
  })

  it('does not infer preserve intent from an image name or geometric distortion', async () => {
    await worker.page.setContent(imageHtml('height:60px'))
    const { context } = await evaluate()
    expect((await createImageShapeDistortionRule().evaluate(context)).verdict).toBe('unknown')
    expect(
      (
        await createImageShapeDistortionRule([imageContract()]).evaluate({
          ...context,
          snapshot: { ...context.snapshot, screenshotPath: undefined },
        })
      ).verdict,
    ).toBe('unknown')
    expect(
      (await evaluate({ ...imageContract(), intent: 'intentional-distortion' })).result.verdict,
    ).toBe('not-applicable')
  })
  it('binds by unique current target/resource, independent of names and layout', async () => {
    await worker.page.setContent(
      imageHtml('height:60px;margin-left:100px', imageDataUrl, '', '完全不同的名称'),
    )
    expect((await evaluate()).result.verdict).toBe('fail')
    await worker.page.setContent(imageHtml() + imageHtml())
    expect((await evaluate()).result.verdict).toBe('unknown')
    await worker.page.setContent('<p>No image</p>')
    expect((await evaluate()).result.verdict).toBe('unknown')
    await worker.page.setContent(imageHtml())
    expect(
      (await evaluate({ ...imageContract(), resourceSha256: '0'.repeat(64) })).result.verdict,
    ).toBe('unknown')
    expect(
      (await evaluate({ ...imageContract(), viewport: { width: 320, height: 768 } })).result
        .verdict,
    ).toBe('not-applicable')
    expect(
      (await evaluate({ ...imageContract(), pageUrl: 'https://other.example/' })).result.verdict,
    ).toBe('not-applicable')
  })
  it('supports decoded JPEG and rejects animated PNG resources', async () => {
    const jpeg = await worker.page.evaluate(() => {
      const canvas = document.createElement('canvas')
      canvas.width = 120
      canvas.height = 60
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = 'white'
      ctx.fillRect(0, 0, 120, 60)
      ctx.fillStyle = 'blue'
      ctx.beginPath()
      ctx.arc(60, 30, 24, 0, Math.PI * 2)
      ctx.fill()
      return canvas.toDataURL('image/jpeg')
    })
    await worker.page.setContent(imageHtml('height:60px', jpeg))
    const contract = {
      ...imageContract(),
      resourceUrl: jpeg,
      resourceSha256: createHash('sha256')
        .update(Buffer.from(jpeg.split(',')[1]!, 'base64'))
        .digest('hex'),
    }
    const { result, observed } = await evaluate(contract)
    expect(result.verdict).toBe('fail')
    expect(observed.snapshot.imagePaint![0]!.resource!.format).toBe('jpeg')
    // An acTL chunk marks APNG, even when a browser falls back to its default static frame.
    const control = Buffer.concat([
      Buffer.from([0, 0, 0, 8]),
      Buffer.from('acTL'),
      Buffer.from([0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]),
    ])
    const bytes = Buffer.concat([imagePng.subarray(0, 33), control, imagePng.subarray(33)])
    const src = 'data:image/png;base64,' + bytes.toString('base64')
    await worker.page.setContent(imageHtml('height:60px', src))
    const animated = await evaluate({
      ...imageContract(),
      resourceUrl: src,
      resourceSha256: createHash('sha256').update(bytes).digest('hex'),
    })
    expect(animated.result.verdict).toBe('unknown')
    expect(animated.observed.snapshot.imagePaint![0]!.resource).toBeUndefined()
  })
  it('keeps SVG internal drawing and failed image loading unknown', async () => {
    for (const src of [
      'data:image/png;base64,broken',
      `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><circle cx="60" cy="30" r="24"/></svg>')}`,
    ]) {
      await worker.page.setContent(imageHtml('height:60px', src))
      expect((await evaluate({ ...imageContract(), resourceUrl: src })).result.verdict).toBe(
        'unknown',
      )
    }
  })
  it('refuses covered images and CSS content replacement', async () => {
    await worker.page.setContent(
      imageHtml('height:60px') + '<div style="position:fixed;inset:0;background:white"></div>',
    )
    expect((await evaluate()).result.verdict).toBe('unknown')
    await worker.page.setContent(
      imageHtml('height:60px') +
        '<div style="position:fixed;inset:0;background:white;pointer-events:none"></div>',
    )
    expect((await evaluate()).result.verdict).toBe('unknown')
    await worker.page.setContent(imageHtml(`content:url(${imageDataUrl})`))
    expect((await evaluate()).result.verdict).toBe('unknown')
  })
  it('invalidates same-looking replaced nodes across the screenshot and never reuses image results', async () => {
    await worker.page.setContent(imageHtml('height:60px'))
    const screenshot = worker.page.screenshot.bind(worker.page)
    vi.spyOn(worker.page, 'screenshot').mockImplementationOnce(async (options) => {
      const bytes = await screenshot(options)
      await worker.page.locator('img').evaluate((el) => el.replaceWith(el.cloneNode(true)))
      return bytes
    })
    expect((await evaluate()).result.verdict).toBe('unknown')
    const { context } = await evaluate()
    const cache = createRuleEvaluationCache(),
      rule = createImageShapeDistortionRule([imageContract()])
    expect((await cache.evaluate(rule, { ...context, factVersion: 'caller-version' })).reused).toBe(
      false,
    )
    expect((await cache.evaluate(rule, { ...context, factVersion: 'caller-version' })).reused).toBe(
      false,
    )
    expect((await readObservationVersion(worker.page)).reusable).toBe(false)
    await worker.page.locator('img').evaluate((img) => {
      img.style.objectFit = 'contain'
    })
    const changed = await evaluate()
    expect(
      (await cache.evaluate(rule, { ...changed.context, factVersion: 'caller-version' })).result
        .verdict,
    ).toBe('pass')
  })
  it('detects transient DOM changes even when final styles return to their original values', async () => {
    await worker.page.setContent(imageHtml('height:60px'))
    const screenshot = worker.page.screenshot.bind(worker.page)
    vi.spyOn(worker.page, 'screenshot').mockImplementationOnce(async (options) => {
      const bytes = await screenshot(options)
      await worker.page.locator('img').evaluate((img) => {
        const original = img.getAttribute('style')!
        img.style.height = '120px'
        img.setAttribute('style', original)
      })
      return bytes
    })
    expect((await evaluate()).result.verdict).toBe('unknown')
  })
  it('retains exact source bytes as a resolvable evidence artifact', async () => {
    await worker.page.setContent(imageHtml('height:60px'))
    const { result, observed } = await evaluate()
    const ref = observed.snapshot.imagePaint![0]!.resource!.evidenceRef
    expect(result.evidenceRefs).toContain(ref)
    const artifact = await getDbClient().execute({
      sql: 'SELECT file_path FROM artifacts WHERE run_id=? AND id=?',
      args: [runId, ref],
    })
    const saved = JSON.parse(await readFile(String(artifact.rows[0]!.file_path), 'utf8'))
    expect(Buffer.from(saved.bytes, 'base64')).toEqual(imagePng)
  })
})

it('captures a real HTTP raster without refetching and keeps pending loads unknown', async () => {
  let requests = 0
  const server = createServer((req, res) => {
    if (req.url === '/logo.png') {
      requests++
      res.writeHead(200, { 'content-type': 'image/png' })
      res.end(imagePng)
    } else if (req.url === '/pending.png') {
      /* deliberately unfinished; server closes it below */
    } else {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end(imageHtml('height:60px', '/logo.png'))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try {
    await worker.page.goto(origin)
    expect((await evaluate(imageContract(origin + '/', origin + '/logo.png'))).result.verdict).toBe(
      'fail',
    )
    expect(requests).toBe(1)
    await worker.page.locator('img').evaluate((img: HTMLImageElement) => {
      img.src = '/pending.png'
    })
    const facts = await readImagePaintFacts(worker.page, ['img'])
    expect(facts[0]!.complete).toBe(false)
    expect(
      (await evaluate(imageContract(origin + '/', origin + '/pending.png'))).result.verdict,
    ).toBe('unknown')
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await worker.page.goto('about:blank')
  }
})
