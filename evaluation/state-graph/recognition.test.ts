import { expect, it } from 'vitest'
import { launchBrowser } from '../../src/execution/browser.ts'
import { explore, type Decide } from '../../src/execution/exploration/run.ts'
import { recognitionFixtureHtml } from './recognition-fixture.ts'
import { recognitionScore } from './recognition-score.ts'
import { historyFixtureHtml } from './complex-fixture.ts'

export const recognitionScriptedDecision: Decide = async (input) => {
  const selected = input.candidates[0]!
  return {
    ref: selected.ref,
    understanding: { purpose: `Explore ${selected.name}`, quote: selected.name },
  }
}

it('exhausts 190 aliases plus tail functions, preserves twins and form states, prunes only explicit scope, and terminates cycles', async () => {
  const worker = await launchBrowser()
  try {
    const report = await explore({
      page: worker.page,
      mode: 'recognition',
      reset: () => worker.page.setContent(recognitionFixtureHtml(190)),
      replaySafe: true,
      context: async () => 'resettable-recognition-v1',
      observation: { inputValues: { Query: ['', 'alpha'] } },
      decide: recognitionScriptedDecision,
      exclude: (c) => (c.name === 'Delete workspace' ? 'explicit scope' : undefined),
      maxDecisions: 240,
      maxClicks: 600,
      evidence: async (index) => `e${index}`,
    })
    expect(report.error).toBeNull()
    expect(recognitionScore(report, 190)).toMatchObject({
      passed: true,
      expectedEdges: 218,
      duplicateExpansions: 0,
      wrongPrunes: 0,
    })
    expect(report.recognitions).toHaveLength(218)
    expect(report.cycleArrivals).toBeGreaterThan(0)
    expect(report.maxInputBytes).toBeLessThan(10000)
  } finally {
    await worker.close()
  }
}, 240000)

it('does not require predicting hidden-history outcomes to explore both identical-looking states', async () => {
  const worker = await launchBrowser()
  try {
    const report = await explore({
      page: worker.page,
      mode: 'recognition',
      reset: () => worker.page.setContent(historyFixtureHtml()),
      replaySafe: true,
      context: () =>
        worker.page.evaluate(() =>
          (window as unknown as { explorationContext: () => string }).explorationContext(),
        ),
      decide: recognitionScriptedDecision,
      evidence: async (index) => `e${index}`,
    })
    expect(report).toMatchObject({
      status: 'bounded-scope-exhausted',
      checkedEdges: 6,
      stateCount: 4,
      failedEdges: 0,
    })
    expect(report.edges.every((e) => e.verdict === 'observed')).toBe(true)
  } finally {
    await worker.close()
  }
}, 30000)

it('rejects invented recognition evidence and preserves pending coverage', async () => {
  const worker = await launchBrowser()
  try {
    const report = await explore({
      page: worker.page,
      mode: 'recognition',
      reset: () => worker.page.setContent('<h1>Home</h1><button>Open</button>'),
      replaySafe: true,
      context: async () => 'bounded',
      decide: async (input) => ({
        ref: input.candidates[0]!.ref,
        understanding: { purpose: 'Delete everything', quote: 'invented evidence' },
      }),
      evidence: async () => 'e',
    })
    expect(report).toMatchObject({
      status: 'partial',
      checkedEdges: 0,
      remaining: 1,
      error: 'ungrounded-recognition',
    })
  } finally {
    await worker.close()
  }
}, 30000)
