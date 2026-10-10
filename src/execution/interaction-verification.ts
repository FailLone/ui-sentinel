import { z } from 'zod'
import type { Page } from 'playwright'

export const interactionVerificationInput = z.object({
  selector: z
    .string()
    .min(1)
    .max(500)
    .describe(
      'Public DOM CSS selector for the postcondition. Numeric order requires at least two matching nodes, each with strictly numeric text; a parent container or mixed label text is unsupported. Use a text predicate or bounded investigation for other content.',
    ),
  condition: z
    .enum([
      'text-equals',
      'text-contains',
      'value-equals',
      'selected-label-equals',
      'expanded-equals',
      'count-equals',
      'visible',
      'popup-visible',
      'numeric-ascending',
      'numeric-descending',
    ])
    .describe(
      'value-equals compares the DOM value, which can differ from a select option’s visible label. For the displayed selected option use selected-label-equals (single select only).',
    ),
  expected: z.string().max(1000).optional(),
  basis: z
    .string()
    .min(1)
    .max(1000)
    .describe(
      'Public page/user evidence for this bounded expected result; not a private test answer.',
    ),
})
export type InteractionVerification = z.infer<typeof interactionVerificationInput>

/** Reject a demonstrably ambiguous select expectation before spending the original action. */
export async function assertInteractionExpectation(page: Page, input: InteractionVerification) {
  if (input.condition !== 'value-equals' || input.expected === undefined) return
  const confused = await page
    .locator(input.selector)
    .evaluateAll((nodes, expected) => {
      if (nodes.length !== 1 || !(nodes[0] instanceof HTMLSelectElement)) return false
      const options = [...nodes[0].options]
      return (
        !options.some((o) => o.value === expected) &&
        options.some((o) => o.label.trim() === expected)
      )
    }, input.expected)
    .catch(() => false)
  if (confused)
    throw Error(
      'verification-value-is-label: no action dispatched. value-equals requires the DOM option value; use selected-label-equals for its displayed label. The expectation was not changed.',
    )
}
/** No arbitrary JavaScript from the agent; unsupported or ambiguous measurements stay unverified. */
export async function measureInteraction(
  page: Page,
  input: InteractionVerification,
  capture?: () => Promise<string[]>,
) {
  const binding = await page
    .evaluateHandle(
      (selector) => ({
        root: document.documentElement,
        url: location.href,
        elements: [...document.querySelectorAll(selector)],
      }),
      input.selector,
    )
    .catch(() => null)
  const read = () =>
    binding
      ?.evaluate(({ root, url, elements }, { selector, condition }) => {
        const current = [...document.querySelectorAll(selector)]
        if (
          root !== document.documentElement ||
          url !== location.href ||
          current.length !== elements.length ||
          elements.some((e, i) => !e.isConnected || current[i] !== e)
        )
          return { values: [], count: current.length, supported: false }
        if (elements.length > 100) return { values: [], count: elements.length, supported: false }
        const values = elements.map((element) => {
          if (condition === 'value-equals') return 'value' in element ? String(element.value) : null
          if (condition === 'selected-label-equals')
            return element instanceof HTMLSelectElement &&
              !element.multiple &&
              element.selectedOptions.length === 1
              ? element.selectedOptions[0]!.label.trim()
              : null
          if (condition === 'expanded-equals') return element.getAttribute('aria-expanded')
          if (condition === 'visible') {
            const r = element.getBoundingClientRect(),
              style = getComputedStyle(element)
            return String(
              r.width > 0 &&
                r.height > 0 &&
                style.visibility !== 'hidden' &&
                style.display !== 'none',
            )
          }
          return (element.textContent ?? '').trim()
        })
        return { values, count: elements.length, supported: true }
      }, input)
      .catch(() => null)
  let measured = await read()
  let evidenceRefs: string[] = []
  try {
    evidenceRefs = (await capture?.()) ?? []
    const confirmed = await read()
    if (JSON.stringify(measured) !== JSON.stringify(confirmed)) measured = null
  } finally {
    await binding?.dispose()
  }
  if (!measured?.supported)
    return {
      input,
      measured,
      evidenceRefs,
      outcome: 'unverified' as const,
      reasonCode: 'measurement-unsupported',
    }
  const outcome = evaluateInteraction(input, measured)
  return {
    input,
    measured,
    evidenceRefs,
    binding: { mode: 'post-action-current', url: page.url(), selector: input.selector },
    outcome,
    reasonCode:
      outcome === 'unverified' ? 'measurement-ambiguous' : 'declared-postcondition-measured',
  }
}

/** Deterministic replay of a captured predicate; unsupported data never becomes a failure. */
export function evaluateInteraction(
  input: InteractionVerification,
  measured: {
    values: (string | null)[]
    count: number
    supported: boolean
  } | null,
): 'verified' | 'failed' | 'unverified' {
  if (
    !measured?.supported ||
    !Array.isArray(measured.values) ||
    measured.values.length !== measured.count ||
    measured.count > 100 ||
    measured.values.some((v) => v !== null && typeof v !== 'string')
  )
    return 'unverified'
  if (input.condition === 'popup-visible') return 'unverified' // Requires the original before/after generic receipt.
  let passed: boolean | null = null
  if (input.condition === 'count-equals' && /^\d+$/.test(input.expected ?? ''))
    passed = measured.count === Number(input.expected)
  else if (input.condition.startsWith('numeric-')) {
    const numbers = measured.values.map((value) =>
      value !== null && /^[-+]?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN,
    )
    if (measured.count >= 2 && numbers.every(Number.isFinite))
      passed = numbers.every(
        (value, i) =>
          i === 0 ||
          (input.condition === 'numeric-ascending'
            ? numbers[i - 1]! <= value
            : numbers[i - 1]! >= value),
      )
  } else if (measured.count === 1 && measured.values[0] !== null) {
    const value = measured.values[0]!
    if (input.condition === 'visible') passed = value === 'true'
    else if (input.expected !== undefined)
      passed =
        input.condition === 'text-contains'
          ? value.includes(input.expected)
          : value === input.expected
  }
  return passed === null ? 'unverified' : passed ? 'verified' : 'failed'
}
