import { createEvidenceIntegrity } from './evidence-integrity.ts'
import { readObservationVersion } from './observation-version.ts'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createVisualFocusRuntime } from './visual-focus-runtime.ts'
import { observePage } from './browser.ts'
import { createRun } from './run-manager.ts'
import { initDatabase } from '../storage/database.ts'
import { createRequestTracker } from '../agent/model/request-tracker.ts'
import { requestVisualCandidates } from './visual-request.ts'
vi.mock('./visual-request.ts', () => ({ requestVisualCandidates: vi.fn() }))
const request = vi.mocked(requestVisualCandidates)
const response = () =>
  ({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          coordinateSpace: 'normalized-1000',
          candidates: [
            {
              perceivedRegion: { x: 125, y: 1000 / 6, width: 375, height: 1000 / 12 },
              excludedRegions: [],
              targetDescription: 'Search',
              visualBasis: 'continuous field',
              confidence: 'high',
            },
          ],
        }),
      },
    ],
    usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
    finishReason: { unified: 'stop' },
  }) as any
const html =
  '<style>body{margin:0;height:1400px}#region{position:absolute;left:100px;top:100px;width:300px;height:50px;background:#eee}input{position:absolute;left:60px;top:10px;width:180px;height:30px;box-sizing:border-box}h1{position:absolute;top:300px;left:100px}</style><div id="region"><input id="search" type="search"></div><h1>Neutral heading</h1>'
let browser: Browser
const created: {
  runId: string
  runtime: ReturnType<typeof createVisualFocusRuntime>
  context: any
}[] = []
beforeAll(async () => {
  await initDatabase()
  browser = await chromium.launch({ headless: true })
})
beforeEach(() => {
  request.mockReset().mockResolvedValue(response())
})
afterEach(async () => {
  for (const c of created.splice(0)) {
    await c.runtime.dispose()
    await c.context.close()
    await rm(resolve('data/artifacts', c.runId), { recursive: true, force: true })
  }
})
afterAll(async () => {
  await browser.close()
})
async function setup(dpr = 1, maxActions = 40) {
  const integrity = createEvidenceIntegrity()
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: dpr,
  })
  const page = await context.newPage()
  await page.setContent(html)
  const run = await createRun({
    goal: 'Inspect shopping',
    environmentId: 'arena',
    entryUrl: 'http://localhost:4173/',
  })
  let observation: any,
    actions = 0,
    models = 0,
    revision = 0,
    screenshotOverride: string | undefined
  const controller = new AbortController()
  const refresh = async () => {
    const seen = await observePage(page, run.id)
    observation = {
      ...seen,
      observationId: 'obs-' + ++revision,
      refs: seen.snapshot.elements.map((_, i) => 'r' + i),
    }
    if (screenshotOverride) observation.snapshot.screenshotPath = screenshotOverride
  }
  await refresh()
  const guard = () => {
    if (controller.signal.aborted) throw Error('cancelled')
  }
  const runtime = createVisualFocusRuntime({
    runId: run.id,
    goal: 'Inspect shopping',
    page,
    browser,
    signal: controller.signal,
    guard,
    snapshot: () => observation,
    refresh,
    detail: (ref) => ({
      selector: observation.snapshot.elements[observation.refs.indexOf(ref)].selector,
    }),
    remainingActions: () => maxActions - actions,
    countAction: () => {
      actions++
    },
    timeRemainingMs: () => 15000,
    countModel: () => {
      models++
    },
    tracker: createRequestTracker(),
    usage: () => {},
    integrity: () => integrity.snapshot(),
    hypothesis: () => {},
    resolved: () => {},
  })
  created.push({ runId: run.id, runtime, context })
  const candidate = () => runtime.candidates(observation.observationId)[0]
  const probe = () =>
    runtime.probe({
      candidateId: candidate()!.id,
      elementRef:
        observation.refs[observation.snapshot.elements.findIndex((e: any) => e.tag === 'input')],
      bindingReason: 'unique search input in the visible region',
    })
  return {
    page,
    context,
    integrity,
    run,
    runtime,
    controller,
    candidate,
    probe,
    refresh,
    setScreenshotRef: (ref: string) => {
      screenshotOverride = ref
    },
    observation: () => observation,
    actions: () => actions,
    models: () => models,
  }
}
it.each([1, 2])('V03 uses CSS screenshot and matching real clicks at DPR %i', async (dpr) => {
  const s = await setup(dpr)
  await s.runtime.scan()
  const bytes = Buffer.from(request.mock.calls[0]![0])
  expect(bytes.readUInt32BE(16)).toBe(800)
  expect(bytes.readUInt32BE(20)).toBe(600)
  expect(s.candidate()!.perceivedRegion).toEqual({ x: 100, y: 100, width: 300, height: 50 })
  expect((await s.probe()).validationStatus).toBe('supported')
  expect(s.actions()).toBeGreaterThanOrEqual(5)
})
it.each(['foreign', 'path'])(
  'V01 refuses %s screenshot references without sending a model request',
  async (mode) => {
    const s = await setup()
    const foreign = await createRun({
      goal: 'foreign',
      environmentId: 'arena',
      entryUrl: 'http://localhost:4173/',
    })
    const other = await observePage(s.page, foreign.id)
    s.setScreenshotRef(
      mode === 'foreign' ? other.snapshot.screenshotPath : '/tmp/not-an-artifact.png',
    )
    try {
      await expect(s.runtime.scan()).rejects.toThrow('visual-screenshot-not-owned')
      expect(request).not.toHaveBeenCalled()
      expect(s.actions()).toBe(0)
    } finally {
      await rm(resolve('data/artifacts', foreign.id), { recursive: true, force: true })
    }
  },
)
it('V03 rejects an unsupported screenshot dimension instead of guessing a scale', async () => {
  const s = await setup(),
    screenshot = s.page.screenshot.bind(s.page)
  const spy = vi.spyOn(s.page, 'screenshot').mockImplementation(async (options) => {
    const b = await screenshot(options)
    b.writeUInt32BE(1600, 16)
    return b
  })
  try {
    await expect(s.runtime.scan()).rejects.toThrow('visual-image-coordinate-mismatch')
    expect(request).not.toHaveBeenCalled()
  } finally {
    spy.mockRestore()
  }
})
it('V04 recollects once when the first request becomes stale and never accepts the stale candidate', async () => {
  const s = await setup()
  request.mockImplementationOnce(async () => {
    await s.page.locator('input').evaluate((e) => ((e as HTMLInputElement).value = 'changed'))
    return response()
  })
  await s.runtime.scan()
  expect(request).toHaveBeenCalledTimes(2)
  expect(s.candidate()).toBeDefined()
})
it('V04 stops after two stale captures, preserving unknown scope', async () => {
  const s = await setup()
  let i = 0
  request.mockImplementation(async () => {
    await s.page
      .locator('input')
      .evaluate((e, v) => ((e as HTMLInputElement).value = String(v)), ++i)
    return response()
  })
  await s.runtime.scan()
  expect(request).toHaveBeenCalledTimes(2)
  expect(s.candidate()).toBeUndefined()
  expect(s.runtime.gaps()).toContain('visual-scan-unverified')
})
it('V04 cancellation while the model is pending cannot persist a late candidate', async () => {
  const s = await setup()
  request.mockImplementationOnce(async () => {
    s.controller.abort()
    return response()
  })
  await expect(s.runtime.scan()).rejects.toThrow('cancelled')
  expect(s.candidate()).toBeUndefined()
  expect(s.actions()).toBe(0)
})
it.each(['scroll', 'viewport', 'replacement', 'value'])(
  'V01 rejects stale %s before any click',
  async (kind) => {
    const s = await setup()
    await s.runtime.scan()
    if (kind === 'scroll') await s.page.evaluate(() => scrollTo(0, 40))
    if (kind === 'viewport') await s.page.setViewportSize({ width: 810, height: 600 })
    if (kind === 'replacement')
      await s.page.locator('input').evaluate((e) => e.replaceWith(e.cloneNode(true)))
    if (kind === 'value') await s.page.locator('input').fill('changed')
    expect((await s.probe()).validationStatus).toBe('inconclusive')
    expect(s.actions()).toBe(0)
  },
)
it.each(['replacement', 'layout', 'value', 'overlay', 'scroll'])(
  'F05 stops a probe when %s changes on its first real click',
  async (kind) => {
    const s = await setup()
    await s.runtime.scan()
    await s.page.evaluate((kind) => {
      document.addEventListener(
        'pointerdown',
        () => {
          const el = document.querySelector('input')!
          if (kind === 'replacement') el.replaceWith(el.cloneNode(true))
          if (kind === 'layout') el.style.width = '170px'
          if (kind === 'value') el.value = 'changed'
          if (kind === 'scroll') scrollTo(0, 25)
          if (kind === 'overlay') {
            const div = document.createElement('div')
            div.style.cssText = 'position:fixed;inset:0;background:red'
            document.body.append(div)
          }
        },
        { once: true },
      )
    }, kind)
    expect((await s.probe()).validationStatus).toBe('inconclusive')
    expect(s.actions()).toBe(1)
  },
)
it.each(['readonly', 'disabled', 'rotated', 'shadow', 'iframe'])(
  'V05 refuses unsupported %s targets',
  async (kind) => {
    const s = await setup()
    if (kind === 'readonly')
      await s.page.locator('input').evaluate((e: HTMLInputElement) => (e.readOnly = true))
    if (kind === 'disabled')
      await s.page.locator('input').evaluate((e: HTMLInputElement) => (e.disabled = true))
    if (kind === 'rotated')
      await s.page.locator('input').evaluate((e) => (e.style.transform = 'rotate(2deg)'))
    if (kind === 'shadow')
      await s.page.evaluate(() => {
        const host = document.createElement('div')
        host.attachShadow({ mode: 'open' }).append(document.querySelector('input')!)
        document.body.append(host)
      })
    if (kind === 'iframe')
      await s.page.setContent('<iframe srcdoc="<input id=search type=search>"></iframe>')
    await s.runtime.scan()
    if (kind === 'shadow' || kind === 'iframe') {
      await expect(
        s.runtime.probe({
          candidateId: s.candidate()!.id,
          elementRef: 'not-visible-in-main-frame',
          bindingReason: 'input',
        }),
      ).resolves.toMatchObject({ validationStatus: 'inconclusive' })
    } else expect((await s.probe()).validationStatus).toBe('inconclusive')
    expect(s.actions()).toBe(0)
  },
)
it('V06 repeated real text-input observations remain non-reusable', async () => {
  const s = await setup()
  expect((await readObservationVersion(s.page)).reusable).toBe(false)
  expect((await readObservationVersion(s.page)).reusable).toBe(false)
})
it.each([6, 7, 8])(
  'F06 enforces the eight-action reservation with %i actions remaining',
  async (limit) => {
    const s = await setup(1, limit)
    await s.runtime.scan()
    const result = await s.probe()
    expect(result.validationStatus).toBe(limit === 8 ? 'supported' : 'inconclusive')
    if (limit < 8) expect(s.actions()).toBe(0)
    expect(s.actions()).toBeLessThanOrEqual(limit)
  },
)
it.each(['write', 'popup'])(
  'F08 a real click causing a denied %s invalidates the investigation',
  async (kind) => {
    const s = await setup()
    await s.runtime.scan()
    await s.page.route('**/*', async (route) => {
      s.integrity.intervene({
        kind: 'write-denied',
        url: route.request().url(),
        method: route.request().method(),
      })
      await route.abort()
    })
    s.context.on('page', async (p: any) => {
      s.integrity.intervene({ kind: 'popup-denied', url: p.url() })
      await p.close()
    })
    await s.page.evaluate((kind) => {
      document.querySelector('input')!.addEventListener(
        'pointerdown',
        () => {
          if (kind === 'write')
            void fetch('https://blocked.invalid/submit', { method: 'POST', mode: 'no-cors' }).catch(
              () => {},
            )
          else window.open('about:blank')
        },
        { once: true },
      )
    }, kind)
    const result = await s.probe()
    expect(s.integrity.snapshot().status).toBe('intervened')
    expect(result.validationStatus).toBe('inconclusive')
  },
)
