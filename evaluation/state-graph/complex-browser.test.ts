import { expect, it } from 'vitest'
import { launchBrowser } from '../../src/execution/browser.ts'
import { explore, ActionGap } from '../../src/execution/exploration/run.ts'
import { observe, click } from '../../src/execution/exploration/browser.ts'
import { actionKey } from '../../src/inspection/exploration-graph.ts'
import { complexFixtureHtml, historyFixtureHtml } from './complex-fixture.ts'
import { complexScore } from './complex-score.ts'

import { complexScriptedDecision } from './complex-driver.ts'

it.each([false, true])(
  'exhausts complex nested, paged, asynchronous, form and scoped-name branches; broken=%s',
  async (broken) => {
    const browser = await launchBrowser()
    try {
      const seen: number[] = []
      const report = await explore({
        page: browser.page,
        reset: () => browser.page.setContent(complexFixtureHtml(broken)),
        context: async () => 'resettable-complex-v1',
        replaySafe: true,
        observation: { inputValues: { Query: ['', 'alpha'] } },
        exclude: (control) =>
          control.name === 'Delete workspace' ? 'outside-read-only-scope' : undefined,
        decide: async (input, read) => {
          seen.push(input.candidates.length)
          return complexScriptedDecision(input, read)
        },
        evidence: async (index) => `evidence-${index}`,
        maxDecisions: 90,
      })
      expect(report.error).toBeNull()
      expect(report.status).toBe('bounded-scope-exhausted')
      expect(report.exclusions).toHaveLength(1)
      expect(Math.max(...seen)).toBeLessThanOrEqual(8)
      expect(report.deliveredActions).toBe(report.checkedEdges)
      expect(report.reads).toBeGreaterThan(0)
      expect(report.cycleArrivals).toBeGreaterThan(0)
      expect(complexScore(report, broken)).toMatchObject({
        missedReachableEdges: 0,
        duplicateExplorations: 0,
        unexpectedEdges: 0,
        wrongExpectations: 0,
        falsePositives: 0,
        falseNegatives: 0,
        truePositives: broken ? 2 : 0,
      })
    } finally {
      await browser.close()
    }
  },
  120000,
)

it('retains visually identical history states and reaches both readiness outcomes', async () => {
  const browser = await launchBrowser()
  try {
    const report = await explore({
      page: browser.page,
      reset: () => browser.page.setContent(historyFixtureHtml()),
      context: () =>
        browser.page.evaluate(() =>
          (window as unknown as { explorationContext: () => string }).explorationContext(),
        ),
      replaySafe: true,
      decide: complexScriptedDecision,
      evidence: async (index) => `e${index}`,
      maxDecisions: 12,
    })
    expect(report.error).toBeNull()
    expect(report.status).toBe('bounded-scope-exhausted')
    expect(report.states.filter((state) => state.observation.heading === 'Session')).toHaveLength(2)
    expect(report.checkedEdges).toBe(6)
    expect(report.failedEdges).toBe(0)
  } finally {
    await browser.close()
  }
})

it('reports unsupported/unknown surfaces and refuses to pretend a budget is coverage', async () => {
  const browser = await launchBrowser()
  try {
    await browser.page.setContent(
      '<h1>Unknown</h1><iframe></iframe><input aria-label="Unbounded"><div role="slider">Slider</div>',
    )
    const snapshot = await observe(browser.page, null)
    expect(snapshot.complete).toBe(false)
    expect(snapshot.gaps).toEqual(
      expect.arrayContaining([
        'unsupported-surface:iframe',
        'unbounded-input:Unbounded',
        'unsupported-role:slider',
      ]),
    )
    const report = await explore({
      page: browser.page,
      reset: async () => {},
      context: async () => null,
      replaySafe: false,
      decide: complexScriptedDecision,
      evidence: async () => '',
      maxDecisions: 1,
    })
    expect(report.status).toBe('partial')
    expect(report.unknownContexts).toBe(1)
  } finally {
    await browser.close()
  }
})

it('executes select and checkbox variants and rejects decisions referring to an unread page', async () => {
  const browser = await launchBrowser()
  try {
    await browser.page.setContent(
      '<h1>Controls</h1><label>Mode<select><option>A</option><option>B</option></select></label><label>Flag<input type="checkbox"></label>',
    )
    let before = await observe(browser.page, 'bounded')
    await click(browser.page, before, actionKey(before.controls.find((c) => c.name === 'Mode')!))
    expect(await browser.page.locator('select').inputValue()).toBe('B')
    before = await observe(browser.page, 'bounded')
    await click(browser.page, before, actionKey(before.controls.find((c) => c.name === 'Flag')!))
    expect(await browser.page.locator('input').isChecked()).toBe(true)
    const report = await explore({
      page: browser.page,
      reset: () => browser.page.setContent(complexFixtureHtml(false)),
      context: async () => 'bounded',
      replaySafe: true,
      decide: async () => ({ ref: 'a27', expectedHeading: 'Shared library' }),
      evidence: async () => '',
      maxDecisions: 1,
    })
    expect(report.error).toBe('invalid-decision')
    expect(report.clicks).toBe(0)
  } finally {
    await browser.close()
  }
})

it('allows an explicitly read later page while retaining earlier pending obligations', async () => {
  const browser = await launchBrowser()
  try {
    const report = await explore({
      page: browser.page,
      reset: () => browser.page.setContent(complexFixtureHtml(false)),
      context: async () => 'bounded',
      replaySafe: true,
      decide: async (input, read) => {
        const page = read({ kind: 'controls', offset: 24 }) as { items: { ref: string }[] }
        return { ref: page.items[3]!.ref, expectedHeading: 'Shared library' }
      },
      evidence: async () => 'later-page-evidence',
      maxDecisions: 1,
    })
    expect(report.error).toBe('decision-budget')
    expect(report.checkedEdges).toBe(1)
    expect(report.remaining).toBeGreaterThan(24)
    expect(report.reads).toBe(1)
  } finally {
    await browser.close()
  }
})

it('returns a recoverable range error for a region-relative cursor without dropping obligations', async () => {
  const browser = await launchBrowser()
  try {
    const report = await explore({
      page: browser.page,
      reset: () => browser.page.setContent(complexFixtureHtml(false)),
      context: async () => 'bounded',
      replaySafe: true,
      decide: async (input, read) => {
        expect(read({ kind: 'controls', region: 'Page', offset: 24 })).toMatchObject({
          error: 'page-offset-out-of-range',
          total: 4,
          suggestedOffset: 0,
        })
        expect(read({ kind: 'controls', region: 'Page', offset: 0 })).toMatchObject({
          total: 4,
          nextOffset: null,
        })
        return { ref: input.candidates[0]!.ref, expectedHeading: 'Shared library' }
      },
      evidence: async () => 'range-recovery-evidence',
      maxDecisions: 1,
    })
    expect(report.error).toBe('decision-budget')
    expect(report.checkedEdges).toBe(1)
    expect(report.remaining).toBeGreaterThan(24)
  } finally {
    await browser.close()
  }
})

it('records a local agent gap and continues other branches without counting the gap as checked', async () => {
  const browser = await launchBrowser()
  try {
    const report = await explore({
      page: browser.page,
      reset: () => browser.page.setContent('<h1>Home</h1><button>A</button><button>B</button>'),
      context: async () => 'resettable',
      replaySafe: true,
      decide: async (input) => {
        const control = input.candidates[0]!
        if (control.name === 'A') throw new ActionGap(control.ref, 'Uncertain expectation')
        return { ref: control.ref, expectedHeading: 'Home' }
      },
      evidence: async () => 'measured-B',
    })
    expect(report).toMatchObject({ status: 'partial', error: null, checkedEdges: 1, remaining: 0 })
    expect(report.unverifiedActions).toHaveLength(1)
    expect(report.unverifiedActions[0]!.reason).toBe('Uncertain expectation')
  } finally {
    await browser.close()
  }
})

it('rejects a moved binding even when the semantic state fingerprint is unchanged', async () => {
  const browser = await launchBrowser()
  try {
    await browser.page.setContent('<h1>Bindings</h1><button>A</button><button>B</button>')
    const before = await observe(browser.page, 'bounded')
    await browser.page.evaluate(() => {
      const a = document.querySelector('button')!
      const wrapper = document.createElement('span')
      a.before(wrapper)
      wrapper.append(a)
      document.querySelectorAll('button').forEach(
        (button) =>
          (button.onclick = () => {
            document.querySelector('h1')!.textContent = button.textContent
          }),
      )
    })
    await expect(click(browser.page, before, actionKey(before.controls[0]!))).rejects.toThrow(
      'stale-binding',
    )
    expect(await browser.page.locator('h1').innerText()).toBe('Bindings')
  } finally {
    await browser.close()
  }
})
