import { expect, it } from 'vitest'
import { launchBrowser } from '../../src/execution/browser.ts'
import { click, controlsPage, observe } from './browser.ts'
import { explore, scriptedDecision } from './explore.ts'
import { fixtureHtml } from './fixture.ts'
import { actionKey } from './graph.ts'
import { score } from './score.ts'

it.each([false, true])(
  'explores real modal branches, convergences and cycles; broken=%s',
  async (broken) => {
    const browser = await launchBrowser()
    try {
      const report = await explore({
        page: browser.page,
        reset: () => browser.page.setContent(fixtureHtml(broken)),
        decide: scriptedDecision,
        evidence: async (index) => `browser-observation-${index}`,
      })
      expect(report.error).toBeNull()
      expect(report.status).toBe('reachable-fixture-actions-exhausted')
      expect(report.stateCount).toBe(broken ? 5 : 6)
      expect(report.reusedArrivals).toBeGreaterThan(0)
      expect(report.cycleArrivals).toBeGreaterThan(0)
      expect(report.replays).toBeGreaterThan(0)
      expect(score(report, broken)).toMatchObject({
        missedReachableEdges: 0,
        duplicateExplorations: 0,
        wrongExpectations: 0,
        falsePositives: 0,
        falseNegatives: 0,
        truePositives: broken ? 1 : 0,
        coveredEdges: broken ? 11 : 12,
      })
    } finally {
      await browser.close()
    }
  },
)

it('enumerates 241 controls through delivery pages, including beyond 180; clicks the last one', async () => {
  const browser = await launchBrowser()
  try {
    await browser.page.setContent(
      '<h1>Large list</h1>' +
        Array.from(
          { length: 241 },
          (_, i) =>
            `<button onclick="document.querySelector('h1').textContent='Selected ${i}'">Item ${i}</button>`,
        ).join(''),
    )
    const observation = await observe(browser.page, 'static-local')
    let offset: number | null = 0
    const refs: string[] = []
    while (offset !== null) {
      const part = controlsPage(observation, offset)
      expect(part.controls.length).toBeLessThanOrEqual(24)
      refs.push(...part.controls.map((control) => control.ref))
      offset = part.nextOffset
    }
    expect(new Set(refs).size).toBe(241)
    await click(browser.page, observation, actionKey(observation.controls[240]!))
    expect((await observe(browser.page, 'static-local')).heading).toBe('Selected 240')
  } finally {
    await browser.close()
  }
})

it('keeps budget exhaustion partial, without silently consuming remaining branches', async () => {
  const browser = await launchBrowser()
  try {
    const report = await explore({
      page: browser.page,
      reset: () => browser.page.setContent(fixtureHtml(false)),
      decide: scriptedDecision,
      evidence: async (index) => `observation-${index}`,
      maxDecisions: 2,
    })
    expect(report).toMatchObject({ status: 'partial', error: 'decision-budget', decisions: 2 })
    expect(report.remaining).toBeGreaterThan(0)
    expect(score(report, false).missedReachableEdges).toBeGreaterThan(0)
  } finally {
    await browser.close()
  }
})

it('stops when reset does not restore the same state', async () => {
  const browser = await launchBrowser()
  let resets = 0
  try {
    const report = await explore({
      page: browser.page,
      reset: async () => {
        await browser.page.setContent(fixtureHtml(false))
        if (++resets > 1)
          await browser.page.locator('h1').evaluate((node) => {
            node.textContent = 'Changed'
          })
      },
      decide: scriptedDecision,
      evidence: async (index) => `observation-${index}`,
    })
    expect(report).toMatchObject({ status: 'partial', error: 'restore-root-mismatch' })
    expect(report.remaining).toBeGreaterThan(0)
  } finally {
    await browser.close()
  }
})

it('rejects a decision made against a changed page before dispatch', async () => {
  const browser = await launchBrowser()
  try {
    await browser.page.setContent(fixtureHtml(false))
    const before = await observe(browser.page, 'static-local')
    await browser.page.locator('button').evaluate((node) => {
      ;(node as HTMLButtonElement).disabled = true
    })
    await expect(click(browser.page, before, actionKey(before.controls[0]!))).rejects.toThrow(
      'stale-state',
    )
    expect(await browser.page.locator('dialog[open]').count()).toBe(0)
  } finally {
    await browser.close()
  }
})
