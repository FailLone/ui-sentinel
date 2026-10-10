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

it('observes two real custom panels before a no-match semantic reply, without attributing either geometry to the action', async () => {
  const { createPopupRuntime } = await import('./legacy-runtime.ts')
  const { hash, choices } = await import('../../agent/popup/contract.ts')
  const { normalizePopupResponse } = await import('../../agent/popup/provider.ts')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } })
  const collector = popupCollector(page),
    controller = new AbortController()
  const saved = new Map<string, string>(),
    events: string[] = []
  let actions = 0,
    reads = 0,
    settlements = 0
  try {
    await page.setContent(
      '<button onclick="document.querySelectorAll(\'.panel\').forEach(n=>n.hidden=false)">Explore details</button><div class="panel" hidden style="position:fixed;left:600px;top:10px;width:200px;height:100px">Unrelated notice</div><div class="panel" hidden style="position:fixed;left:10px;top:150px;width:200px;height:100px">Ambiguous panel</div>',
    )
    const r = createPopupRuntime({
      signal: controller.signal,
      goal: 'requested panel',
      taskId: 'task',
      contractHash: 'contract',
      guard: () => controller.signal.throwIfAborted(),
      remaining: () => ({ actions: 3 - actions, calls: 6, timeMs: 20000, reads: 2 - reads }),
      frame: async () => {
        const c = await collector.capture()
        return {
          binding: hash({ c, actions }),
          actionEpoch: actions,
          url: page.url(),
          reusable: c.complete,
          evidenceRefs: [],
          entries: [{ id: 'entry', ref: 'button', description: 'Explore details' }],
          panels: c.facts,
        }
      },
      decide: async (packet) => {
        if (packet.stage === 'target')
          expect(events.filter((e) => e === 'popup:candidate-geometry')).toHaveLength(2)
        const choice = packet.stage === 'entry' ? 'entry' : 'none'
        return normalizePopupResponse(
          {
            id: 'synthetic-browser',
            model: 'typesafe/jev-1.13-20260917',
            provider: 'TypeSafe',
            answers: {
              popup: {
                type: 'choice',
                choice,
                confidence: 1,
                probabilities: Object.fromEntries(
                  Object.keys(choices(packet)).map((id) => [id, id === choice ? 1 : 0]),
                ),
              },
            },
          },
          packet,
        )
      },
      act: async () => {
        await page.locator('button').click()
        actions++
        return { status: 'completed', actionId: 'action', evidenceRefs: [] }
      },
      consumeRead: () => {
        reads++
      },
      measure: (id, expected) => collector.measure(id, controller.signal, expected),
      screenshot: async () => {
        const id = 'screen-' + saved.size
        saved.set(id, (await page.screenshot()).toString('base64'))
        return id
      },
      save: async (kind, body) => {
        const id = kind + '-' + saved.size
        saved.set(id, body)
        return id
      },
      seal: async (refs) => Object.fromEntries(refs.map((ref) => [ref, hash(saved.get(ref))])),
      emit: async (kind) => {
        events.push(kind)
      },
      settle: async () => {
        settlements++
      },
    })
    await r.step()
    const result = await r.step()
    expect(result).toMatchObject({ status: 'handoff', reason: 'popup-target-ambiguous', reads: 2 })
    expect(result.candidateGeometry?.map((c) => c.geometryVerdict).sort()).toEqual(['fail', 'pass'])
    expect(result.measurement).toBeUndefined()
    expect(settlements).toBe(0)
    expect(events).not.toContain('popup:measurement')
  } finally {
    await collector.dispose()
    await browser.close()
  }
})
