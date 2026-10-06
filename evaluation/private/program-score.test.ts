import { beforeAll, afterAll, it, expect } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { investigationHtml } from '../fixtures/investigation.ts'
import { scoreProgramReceipts } from './program-score.ts'
import { runProgram } from '../../src/execution/investigation/runner.ts'
import type { InvestigationProgram } from '../../src/execution/investigation/program.ts'
let browser: Browser
beforeAll(async () => {
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser.close()
})
for (const metric of ['hitFraction', 'unclippedFraction'] as const)
  it(`accepts independently grounded ${metric} and rejects wrong target and missing trigger`, async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(investigationHtml('menu-broken'))
      await page.getByRole('button', { name: 'Delivery times' }).click()
      const program: InvestigationProgram = {
        version: 1,
        phenomenon: 'Option unavailable',
        basis: 'Every offered option should be selectable',
        targets: [{ name: 'item', selector: '[role="option"]:last-child' }],
        steps: [{ op: 'measure', name: 'now' }],
        assertions: [
          {
            expectation: 'Coverage',
            left: { sample: 'now', target: 'item', metric },
            operator: 'gte',
            right: { value: metric === 'hitFraction' ? 0.5 : 1 },
          },
        ],
      }
      const r = await runProgram(program, {
        page,
        guard: () => {},
        signal: new AbortController().signal,
        remainingActions: () => 0,
        act: async () => {},
        screenshot: async () => 'shot',
        clean: () => true,
      })
      const actions = [{ type: 'click', target: 'button[Delivery times]' }]
      expect((await scoreProgramReceipts(page, 'menu-broken', [r], actions)).passed).toBe(true)
      expect((await scoreProgramReceipts(page, 'menu-broken', [r])).passed).toBe(false)
      const wrong = structuredClone(r)
      wrong.program.targets[0]!.selector = '#open'
      expect((await scoreProgramReceipts(page, 'menu-broken', [wrong], actions)).passed).toBe(false)
      const fabricated = structuredClone(r)
      fabricated.samples.now!.item!.unclippedFraction = 1
      expect((await scoreProgramReceipts(page, 'menu-broken', [fabricated], actions)).passed).toBe(
        false,
      )
      expect((await scoreProgramReceipts(page, 'menu-healthy', [], actions)).passed).toBe(true)
      expect((await scoreProgramReceipts(page, 'menu-healthy', [r], actions)).passed).toBe(false)
    } finally {
      await page.close()
    }
  })
