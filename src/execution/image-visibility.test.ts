import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdir, readFile, copyFile, writeFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { launchBrowser, observePage, type BrowserWorker } from './browser.ts'
import type { PageSnapshot } from '../rules/types.ts'
import { readImagePaintFacts } from './image-paint.ts'
import { createRun } from './run-manager.ts'
import { getDbClient } from '../storage/database.ts'
import { imageHtml, imageDataUrl, imageContract } from '../../evaluation/fixtures/image-shape.ts'
import { createImageBindingExperiment } from '../experiments/image-bindings.ts'
import { createImageShapeDistortionRule } from '../rules/builtin/image-shape-distortion.ts'

let worker: BrowserWorker, runId: string
beforeEach(async () => {
  worker = await launchBrowser({ uiScan: true, collectImageResources: true })
  runId = (
    await createRun({
      goal: 'Synthetic bounded image visibility',
      environmentId: 'test',
      entryUrl: 'about:blank',
    })
  ).id
})
afterEach(async () => {
  vi.restoreAllMocks()
  await worker.close()
  await rm(`data/artifacts/${runId}`, { recursive: true, force: true })
})
const filler = (count: number) =>
  `<section style="position:absolute;top:2000px">${'<div>filler</div>'.repeat(count)}</section>`
const cover = (pointer = 'auto') =>
  `<div style="position:fixed;left:100px;top:100px;width:20px;height:20px;background:white;pointer-events:${pointer}"></div>`
async function page(count: number, suffix = '', style = '', outer = '') {
  await worker.page.setContent(
    imageHtml(`display:block;${style}`, imageDataUrl, outer).replace(
      '</body>',
      filler(count) + suffix + '</body>',
    ),
  )
  await worker.page.locator('img').evaluate((img: HTMLImageElement) => img.decode())
}
async function observe() {
  const started = performance.now()
  const observed = await observePage(worker.page, runId, undefined, ['img'], { caret: 'initial' })
  return { ...observed, elapsedMs: performance.now() - started }
}
async function retain(name: string, details: unknown) {
  if (!process.env.IMAGE_VISIBILITY_EVIDENCE_DIR) return
  const directory = resolve(process.env.IMAGE_VISIBILITY_EVIDENCE_DIR, name)
  await mkdir(directory, { recursive: true })
  const rows = await getDbClient().execute({
    sql: 'SELECT id,type,file_path FROM artifacts WHERE run_id=?',
    args: [runId],
  })
  const artifacts = await Promise.all(
    rows.rows.map(async (row) => {
      const bytes = await readFile(String(row.file_path)),
        path = resolve(directory, String(row.id))
      await copyFile(String(row.file_path), path)
      return {
        id: row.id,
        type: row.type,
        path,
        bytes: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    }),
  )
  await writeFile(
    resolve(directory, 'receipt.json'),
    JSON.stringify({ runId, details, artifacts }, null, 2),
  )
}
it.each([100, 1200, 3000])(
  'bounded visibility completes a simple %i-node fixture',
  async (count) => {
    await page(count)
    const observed = await observe(),
      fact = observed.snapshot.imagePaint![0]!
    const total = await worker.page.locator('*').count()
    expect(fact.unsupported).toEqual([])
    expect(fact.stable).toBe(true)
    expect(fact.visibilityScan).toMatchObject({
      complete: true,
      visited: total,
      rectangleReads: total,
    })
    expect(fact.visibilityScan!.visited).toBeLessThanOrEqual(4096)
    expect(fact.resource?.sha256).toBe(imageContract().resourceSha256)
    await retain(`simple-${count}`, { total, observed })
  },
)
it.each(['ordinary-early', 'transparent-early', 'transparent-late'])(
  'bounded visibility rejects %s cover away from hit-test center',
  async (mode) => {
    await page(
      mode.endsWith('early') ? 0 : 1200,
      cover(mode.startsWith('ordinary') ? 'auto' : 'none'),
    )
    if (mode.endsWith('early'))
      await worker.page.evaluate(
        (html) => document.body.insertAdjacentHTML('beforeend', html),
        filler(1200),
      )
    // Cover occupies a corner: even a center hit on the image cannot establish full visibility.
    expect(await worker.page.evaluate(() => document.elementFromPoint(200, 140)?.tagName)).toBe(
      'IMG',
    )
    const observed = await observe()
    expect(observed.snapshot.imagePaint![0]!.unsupported).toContain('overlapping-paint-surface')
    expect(observed.snapshot.imagePaint![0]!.visibilityScan?.visited).toBeGreaterThan(1200)
    await retain(mode, { observed })
  },
)
it('bounded visibility refuses pseudo paint outside its zero-size host box', async () => {
  await page(
    1200,
    '<style>#pseudo::before{content:"";position:fixed;left:100px;top:100px;width:20px;height:20px;background:white;pointer-events:none}</style><div id="pseudo" style="position:absolute;top:3000px;width:0;height:0"></div>',
  )
  const observed = await observe()
  expect(observed.snapshot.imagePaint![0]!.unsupported).toContain('visibility-unbounded-paint')
  await retain('pseudo', { observed })
})
it.each([
  ['clipping', '', 'overflow:hidden;width:100px', 'ancestor-clipping'],
  ['transform', '', 'transform:rotateY(30deg)', '3d-transform'],
  ['mask', 'mask-image:linear-gradient(black,transparent)', '', 'paint-effect'],
])('bounded visibility retains unsupported %s', async (name, style, outer, reason) => {
  await page(1200, '', style, outer)
  const observed = await observe()
  expect(observed.snapshot.imagePaint![0]!.unsupported).toContain(reason)
  await retain(name, { observed })
})
it('bounded visibility never treats a node-budget prefix as a complete page', async () => {
  await page(4500, cover('none'))
  const observed = await observe(),
    fact = observed.snapshot.imagePaint![0]!
  expect(fact.visibilityScan).toMatchObject({ complete: false })
  expect(fact.visibilityScan!.visited).toBeLessThanOrEqual(4096)
  expect(fact.unsupported).toContain('visibility-node-budget-exceeded')
  await retain('node-budget', { observed })
})
it('bounded visibility refuses candidate overflow', async () => {
  await page(1200, cover('none').repeat(300))
  const observed = await observe(),
    fact = observed.snapshot.imagePaint![0]!
  expect(fact.visibilityScan).toMatchObject({ complete: false, candidates: 256 })
  expect(fact.unsupported).toContain('visibility-candidate-budget-exceeded')
  await retain('candidate-budget', { observed })
})
it('bounded visibility fails closed on deadline exhaustion', async () => {
  await page(1200)
  // Deterministic clock fault injection, not a flaky hardware-speed assertion.
  await worker.page.evaluate(() => {
    let ticks = 0
    performance.now = () => (ticks += 300)
  })
  const observed = await observe(),
    fact = observed.snapshot.imagePaint![0]!
  expect(fact.visibilityScan).toMatchObject({ complete: false, visited: 0 })
  expect(fact.unsupported).toContain('visibility-time-budget-exceeded')
  await retain('time-budget', { clock: 'synthetic +300ms per read', observed })
})
it('bounded visibility rejects DOM mutation during its geometry walk', async () => {
  await page(1200)
  await worker.page.evaluate(() => {
    const node = document.querySelector('section > div')!,
      read = node.getBoundingClientRect.bind(node)
    let changes = 0
    node.getBoundingClientRect = () => {
      document.body.setAttribute('title', `Synthetic mutation during measurement ${++changes}`)
      return read()
    }
  })
  const observed = await observe(),
    fact = observed.snapshot.imagePaint![0]!
  expect(fact.unsupported).toContain('visibility-dom-changed')
  expect(fact.visibilityScan?.complete).toBe(false)
  expect(fact.stable).toBe(false)
  const result = await createImageShapeDistortionRule([imageContract()]).evaluate({
    runId,
    currentUrl: 'about:blank',
    pageTitle: 'Synthetic',
    timestamp: new Date().toISOString(),
    events: [],
    snapshot: observed.snapshot as PageSnapshot,
  })
  expect(result.verdict).toBe('unknown')
  await retain('during-observation', { observed, result })
})
it('bounded visibility shares one walk across PNG/JPEG targets and consumes a single target', async () => {
  const jpeg = await worker.page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 120
    c.height = 60
    return c.toDataURL('image/jpeg')
  })
  await worker.page.setContent(
    imageHtml('display:block', imageDataUrl)
      .replace('<img ', '<img id="png" ')
      .replace(
        '</body>',
        `<img id="jpeg" src="${jpeg}" style="display:block;width:240px;height:120px;margin-top:30px">${filler(1200)}</body>`,
      ),
  )
  await worker.page
    .locator('img')
    .evaluateAll((imgs) => Promise.all(imgs.map((img) => (img as HTMLImageElement).decode())))
  const experiment = createImageBindingExperiment({
    page: worker.page,
    runId,
    evidenceIntegrity: () => ({ version: 1, status: 'clean', interventionIds: [] }),
  })
  try {
    const start = performance.now(),
      batch = await experiment.observe(),
      elapsedMs = performance.now() - start
    expect(batch.candidates).toHaveLength(2)
    expect(batch.candidates.map((c) => c.status)).toEqual(['facts-ready', 'facts-ready'])
    expect(batch.candidates.map((c) => c.measured.paint!.resource!.format)).toEqual(['png', 'jpeg'])
    const total = await worker.page.locator('*').count()
    for (const c of batch.candidates)
      expect(c.measured.paint!.visibilityScan).toMatchObject({
        visited: total,
        rectangleReads: total,
        complete: true,
      })
    const c = batch.candidates[0]!
    const result = await experiment.check({
      candidateId: c.candidateId,
      observationId: c.observationId,
      intent: 'preserve',
      basis: imageContract().basis,
    })
    expect(result.verdict, result.actual).toBe('pass')
    await retain('shared-and-consumed', { batch, result, total, elapsedMs })
  } finally {
    await experiment.close()
  }
})
it('bounded visibility reports a target cap instead of silently supporting a truncated list', async () => {
  await page(1200)
  const facts = await readImagePaintFacts(
    worker.page,
    Array.from({ length: 33 }, () => 'img'),
  )
  expect(facts).toHaveLength(32)
  expect(facts.every((f) => f.unsupported?.includes('visibility-target-budget-exceeded'))).toBe(
    true,
  )
  await retain('target-budget', { facts })
})

it('bounded visibility refuses unwalked shadow paint and excessive ancestor depth', async () => {
  await page(1200, '<div id="host" style="position:absolute;top:3000px"></div>')
  await worker.page.locator('#host').evaluate((el) => {
    el.attachShadow({ mode: 'open' }).innerHTML =
      '<div style="position:fixed;left:100px;top:100px;width:20px;height:20px;background:white;pointer-events:none"></div>'
  })
  const shadow = await observe()
  expect(shadow.snapshot.imagePaint![0]!.unsupported).toContain('visibility-unbounded-paint')
  await page(1200)
  await worker.page.locator('img').evaluate((img) => {
    for (let i = 0; i < 129; i++) {
      const wrapper = document.createElement('div')
      img.replaceWith(wrapper)
      wrapper.append(img)
    }
  })
  const deep = await observe()
  expect(deep.snapshot.imagePaint![0]!.unsupported).toContain('image-ancestor-budget-exceeded')
  await retain('shadow-and-depth', { shadow, deep })
})
it('bounded visibility bounds selector and fact output without truncating resource identity', async () => {
  await page(1200)
  const longSelector = await readImagePaintFacts(worker.page, ['img' + ':not(.absent)'.repeat(100)])
  expect(longSelector[0]!.unsupported).toContain('visibility-selector-budget-exceeded')
  expect(longSelector[0]!.selector.length).toBeLessThanOrEqual(1000)
  await worker.page.locator('img').evaluate(
    (img: HTMLImageElement) =>
      new Promise<void>((resolve) => {
        img.onerror = () => resolve()
        img.src = 'data:image/png;base64,' + 'A'.repeat(71000)
      }),
  )
  const oversized = await readImagePaintFacts(worker.page, ['img'])
  expect(oversized[0]!.unsupported).toContain('image-fact-output-budget-exceeded')
  expect(oversized[0]!.currentSrc).toBeUndefined()
  await retain('output-budgets', { longSelector, oversized })
})
