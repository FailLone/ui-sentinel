import type { Page } from 'playwright'
import { observe } from '../../src/execution/exploration/browser.ts'
import type { Decide, DecisionInput, ReadRequest } from '../../src/execution/exploration/run.ts'
import type { Control } from '../../src/inspection/exploration-graph.ts'
import { recognitionFixtureHtml } from './recognition-fixture.ts'

/** Independent task questions test semantics; answers and setup selectors never enter model input. */
export async function recognitionProbes(
  page: Page,
  decide: Decide,
  save: (name: string, value: unknown) => Promise<unknown>,
) {
  const cases = [
    {
      name: 'tail-after-190',
      route: [],
      question:
        'Find the workspace usage documentation, rather than a shelf or a deletion-related guide.',
      answer: 'Usage guide',
    },
    {
      name: 'same-name-beta',
      route: ['Shelf 01'],
      question: 'Open the Beta record, not the Alpha record.',
      answer: 'Open',
      region: 'Beta record',
    },
    {
      name: 'nested-modal',
      route: ['Shelf 01', 'Advanced'],
      question: 'Inspect the export preview from the active dialog.',
      answer: 'Preview',
    },
    {
      name: 'long-text-rule',
      route: ['Usage guide'],
      question:
        'Which action provides offline support according to the Usage rules? Read the rules and quote the rule supporting your selection.',
      answer: 'Continue',
      quote: 'offline support',
    },
    {
      name: 'finite-input',
      route: ['Search'],
      question: 'Enter alpha as the search query; do not submit it yet.',
      answer: 'Query',
      value: 'alpha',
    },
    {
      name: 'pruning-neighbour',
      route: [],
      question: 'Open the guide about deleting history. Do not delete the workspace.',
      answer: 'Delete history guide',
    },
  ]
  const results = []
  for (const test of cases) {
    await page.setContent(recognitionFixtureHtml(190))
    for (const name of test.route) await page.getByRole('button', { name, exact: true }).click()
    const observation = await observe(page, 'recognition-probe', {
      inputValues: { Query: ['', 'alpha'] },
    })
    const controls = observation.controls.filter((c) => c.enabled && c.name !== 'Delete workspace')
    const seen = new Set<string>()
    const present = (items: Control[]) =>
      items.map(({ selector: _, ...c }) => {
        seen.add(c.ref)
        return c
      })
    const groups = [...new Set(controls.map((c) => c.region ?? 'Page'))].map((region) => ({
      region,
      pending: controls.filter((c) => c.region === region).length,
    }))
    const requests: ReadRequest[] = []
    const readTexts = [observation.text.slice(0, 400)]
    const input: DecisionInput = {
      question: test.question,
      heading: observation.heading,
      text: observation.text.slice(0, 400),
      textLength: observation.text.length,
      candidates: present(controls.slice(0, 8)),
      totalCandidates: controls.length,
      nextOffset: controls.length > 8 ? 8 : null,
      catalog: groups.slice(0, 8),
      totalRegions: groups.length,
      checkedHere: 0,
      pendingElsewhere: 0,
    }
    const decision = await decide(input, (request) => {
      requests.push(request)
      if (requests.length > 8) throw Error('probe-read-budget')
      if (request.kind === 'text') {
        readTexts.push(observation.text.slice(request.offset, request.offset + 2000))
        return {
          kind: 'text',
          text: observation.text.slice(request.offset, request.offset + 2000),
          total: observation.text.length,
          nextOffset:
            request.offset + 2000 < observation.text.length ? request.offset + 2000 : null,
        }
      }
      const all =
        request.kind === 'regions'
          ? groups
          : controls.filter((c) => !request.region || c.region === request.region)
      if (request.offset > all.length)
        return { error: 'page-offset-out-of-range', total: all.length, suggestedOffset: 0 }
      const items = all.slice(request.offset, request.offset + 8)
      return {
        kind: request.kind,
        items: request.kind === 'controls' ? present(items as Control[]) : items,
        total: all.length,
        nextOffset:
          request.offset + items.length < all.length ? request.offset + items.length : null,
      }
    })
    const selected = controls.find((c) => c.ref === decision.ref)
    const grounded =
      !!decision.understanding?.quote &&
      [...readTexts, selected?.name ?? '', selected?.description ?? '', selected?.region ?? '']
        .join('\n')
        .includes(decision.understanding.quote)
    const passed =
      !!selected &&
      seen.has(selected.ref) &&
      selected.name === test.answer &&
      (!test.region || selected.region?.includes(test.region)) &&
      (test.value === undefined || selected.value === test.value) &&
      grounded &&
      (!test.quote ||
        (decision.understanding!.quote.includes(test.quote) &&
          requests.some((r) => r.kind === 'text')))
    const result = {
      name: test.name,
      passed: !!passed,
      question: test.question,
      selected,
      decision,
      requests,
      offeredInitially: input.candidates.length,
      totalControls: controls.length,
    }
    await save(`probe-${test.name}.json`, result)
    results.push(result)
  }
  return results
}
