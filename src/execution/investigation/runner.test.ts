import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { programInput, evaluateProgram, type InvestigationProgram } from './program.ts'
import { inspectElements } from './measure.ts'
import { runProgram, type ProgramHost } from './runner.ts'
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})
afterAll(async () => {
  await browser.close()
})
function program(
  metric = 'unclippedFraction',
  steps: unknown[] = [{ op: 'measure', name: 'after' }],
) {
  return programInput.parse({
    version: 1,
    phenomenon: 'Observed content may not satisfy the declared expectation',
    basis: 'Public task requires this content to be available',
    targets: [{ name: 'item', selector: '#item' }],
    steps,
    assertions: [
      {
        expectation: 'The target remains fully available in the specified geometry',
        left: { sample: 'after', target: 'item', metric },
        operator: 'gte',
        right: { value: 1 },
      },
    ],
  })
}
async function fixture(html: string, fn: (host: ProgramHost, page: Page) => Promise<void>) {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
  await page.setContent(html)
  let actions = 0
  const host: ProgramHost = {
    page,
    guard: () => {},
    signal: new AbortController().signal,
    remainingActions: () => 3 - actions,
    clean: () => true,
    screenshot: async () => {
      await page.screenshot()
      return 'screenshot'
    },
    act: async (a) => {
      actions++
      if (a.type === 'click') await page.locator(a.selector!).click({ timeout: 500 })
      else if (a.type === 'fill') await page.locator(a.selector!).fill(a.value!)
      else await page.mouse.wheel(0, a.scrollY!)
      return { status: 'completed' }
    },
  }
  try {
    await fn(host, page)
  } finally {
    await page.close()
  }
}
describe('composable program contracts', () => {
  it('rejects invented references, self-checks, extra code and excessive waiting', () => {
    for (const mutate of [
      (p: any) => {
        p.assertions[0].left.sample = 'missing'
      },
      (p: any) => {
        p.assertions[0].right = p.assertions[0].left
      },
      (p: any) => {
        p.code = 'fetch(secret)'
      },
      (p: any) => {
        p.steps.push(...Array.from({ length: 3 }, () => ({ op: 'wait', ms: 2000 })))
      },
    ]) {
      const p = program()
      mutate(p)
      expect(programInput.safeParse(p).success).toBe(false)
    }
  })
  it('missing data and mixed types cannot prove an assertion', () => {
    expect(evaluateProgram(program(), {}).verdict).toBe('unknown')
    const p = program()
    p.assertions[0]!.right = { value: true }
    expect(evaluateProgram(p, {}).verdict).toBe('unknown')
  })
  for (const healthy of [false, true]) {
    it(`same engine handles clipping: healthy=${healthy}`, async () =>
      fixture(
        `<div style="width:200px;height:${healthy ? 200 : 40}px;overflow:hidden"><div id="item" style="height:100px;width:180px">Menu option</div></div>`,
        async (h) => {
          const r = await runProgram(program(), h)
          expect(r.verdict).toBe(healthy ? 'pass' : 'fail')
        },
      ))
    it(`same engine handles feedback after operation: healthy=${healthy}`, async () =>
      fixture(
        `<button id="send" onclick="document.querySelector('#item').style.display='block'">Send</button><p id="item" style="display:none;${healthy ? '' : 'position:absolute;top:900px'}">Please correct your selection</p>`,
        async (h) => {
          const p = program('viewportFraction')
          p.targets.push({ name: 'send', selector: '#send' })
          p.steps = [
            { op: 'act', type: 'click', target: 'send' },
            { op: 'measure', name: 'after' },
          ]
          // Parse only once the target is declared.
          const r = await runProgram(p, h)
          expect(r.verdict).toBe(healthy ? 'pass' : 'fail')
        },
      ))
    it(`same engine handles delayed layout: healthy=${healthy}`, async () =>
      fixture(
        `<button id="load" onclick="setTimeout(()=>document.querySelector('#space').style.height='${healthy ? 40 : 900}px',40)">Load</button><div id="space"></div><button id="item">Continue</button>`,
        async (h) => {
          const p = program('viewportFraction')
          p.targets.push({ name: 'load', selector: '#load' })
          p.steps = [
            { op: 'measure', name: 'before' },
            { op: 'act', type: 'click', target: 'load' },
            { op: 'wait', ms: 120 },
            { op: 'measure', name: 'after' },
          ]
          p.assertions.push({
            ...p.assertions[0]!,
            left: { sample: 'before', target: 'item', metric: 'viewportFraction' },
          })
          expect((await runProgram(p, h)).verdict).toBe(healthy ? 'pass' : 'fail')
        },
      ))
  }
  it('unknown for missing, ambiguous, transformed and replaced nodes', async () => {
    for (const html of [
      '',
      '<div id="item"></div><div id="item"></div>',
      '<div id="item" style="transform:rotate(10deg);width:100px;height:50px">Text</div>',
    ])
      await fixture(html, async (h) =>
        expect((await runProgram(program(), h)).verdict).toBe('unknown'),
      )
    await fixture('<div id="item">One</div>', async (h, page) => {
      let captures = 0
      h.screenshot = async () => {
        if (++captures === 1)
          await page.evaluate(
            () => (document.querySelector('#item')!.outerHTML = '<div id="item">Two</div>'),
          )
        return 'shot'
      }
      const p = program('viewportFraction', [
        { op: 'measure', name: 'before' },
        { op: 'measure', name: 'after' },
      ])
      expect((await runProgram(p, h)).verdict).toBe('unknown')
    })
  })
  it('intervention and failed actions invalidate a would-be failure', async () =>
    fixture('<div id="item" style="position:absolute;top:900px">Text</div>', async (h) => {
      h.clean = () => false
      expect((await runProgram(program('viewportFraction'), h)).verdict).toBe('unknown')
    }))
  it('cancellation stops execution and budget is reserved before any action', async () =>
    fixture('<button id="item">Go</button>', async (h) => {
      let acted = 0
      h.act = async () => {
        acted++
      }
      const p = program()
      p.steps.unshift({ op: 'act', type: 'click', target: 'item' })
      h.remainingActions = () => 0
      await expect(runProgram(p, h)).rejects.toThrow('budget')
      expect(acted).toBe(0)
      const controller = new AbortController()
      controller.abort(Error('cancelled'))
      h.signal = controller.signal
      h.guard = () => controller.signal.throwIfAborted()
      await expect(runProgram(program(), h)).rejects.toThrow('cancelled')
    }))
  it('inspection exposes noninteractive geometry, bounds its results, and rejects selector engines', async () =>
    fixture(
      '<p>Feedback</p>' + Array.from({ length: 30 }, () => '<button>Go</button>').join(''),
      async (h) => {
        const r = await inspectElements(h.page, 'p,button', 0)
        expect(r.elements.length).toBeGreaterThan(0)
        expect(r.elements.length).toBeLessThanOrEqual(24)
        expect(r.nextOffset).toBe(r.elements.length)
        expect(Buffer.byteLength(JSON.stringify(r.elements))).toBeLessThanOrEqual(4500)
        expect(r.elements[0]!.text).toBe('Feedback')
        await expect(inspectElements(h.page, 'text=Feedback', 0)).rejects.toThrow()
      },
    ))
})

it('visibility override is rendered, while transparent ancestors still hide it', async () => {
  await fixture(
    '<div style="visibility:hidden"><p id="item" style="visibility:visible">Notice</p></div>',
    async (host) => {
      const p = program()
      p.assertions = [
        {
          expectation: 'Displayed',
          left: { sample: 'after', target: 'item', metric: 'displayed' },
          operator: 'eq',
          right: { value: true },
        },
      ]
      expect((await runProgram(p, host)).verdict).toBe('pass')
      await host.page.locator('div').evaluate((e) => (e.style.opacity = '0'))
      expect((await runProgram(p, host)).verdict).toBe('fail')
    },
  )
})
