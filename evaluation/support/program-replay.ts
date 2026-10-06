import { randomUUID } from 'node:crypto'
import type { Browser } from 'playwright'
import { investigationHtml, type InvestigationCase } from '../fixtures/investigation.ts'
import { runProgram } from '../../src/execution/investigation/runner.ts'
import type { InvestigationProgram } from '../../src/execution/investigation/program.ts'

export async function replayProgramPair(
  browser: Browser,
  program: InvestigationProgram,
  family: string,
  directory: string,
) {
  const replays = []
  for (const healthy of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } })
    await page.setContent(
      investigationHtml(`${family}-${healthy ? 'healthy' : 'broken'}` as InvestigationCase),
    )
    // Reconstruct the inspected public state, then replay the exact generated measurement.
    // This setup is evaluator-owned and recorded separately; it is not agent discovery.
    const trigger = family === 'menu' ? '#open' : family === 'feedback' ? '#check' : '#load'
    const selfTriggered = (
      await Promise.all(
        program.steps
          .filter((s: any) => s.op === 'act' && s.type === 'click')
          .map(async (s: any) => {
            const t = program.targets.find((t: any) => t.name === s.target)
            return (
              t &&
              page.evaluate(({ a, b }) => document.querySelector(a) === document.querySelector(b), {
                a: t.selector,
                b: trigger,
              })
            )
          }),
      )
    ).some(Boolean)
    if (!selfTriggered && family === 'menu')
      await page.getByRole('button', { name: 'Delivery times' }).click()
    if (!selfTriggered && family === 'feedback')
      await page.getByRole('button', { name: 'Check address' }).click()
    if (!selfTriggered && family === 'layout') {
      await page.getByRole('button', { name: 'Load details' }).click()
      await page.waitForTimeout(250)
    }
    try {
      let actions = 0
      const r = await runProgram(program, {
        page,
        signal: new AbortController().signal,
        guard: () => {},
        clean: () => true,
        remainingActions: () => 3 - actions,
        act: async (a) => {
          actions++
          if (a.type === 'click') await page.locator(a.selector!).click({ timeout: 1500 })
          else if (a.type === 'fill') await page.locator(a.selector!).fill(a.value!)
          else await page.mouse.wheel(0, a.scrollY!)
          return {}
        },
        screenshot: async () => {
          const file = `${directory}/replay-${family}-${healthy}-${randomUUID()}.png`
          await page.screenshot({ path: file })
          return file
        },
      })
      replays.push({ healthy, evaluatorSetup: !selfTriggered, ...r })
    } finally {
      await page.close()
    }
  }
  return replays
}
