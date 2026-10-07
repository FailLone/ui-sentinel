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
  condition: z.enum([
    'text-equals',
    'text-contains',
    'value-equals',
    'expanded-equals',
    'count-equals',
    'visible',
    'numeric-ascending',
    'numeric-descending',
  ]),
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
/** No arbitrary JavaScript from the agent; unsupported or ambiguous measurements stay unverified. */
export async function measureInteraction(page: Page, input: InteractionVerification) {
  const measured = await page
    .evaluate(({ selector, condition }) => {
      const elements = [...document.querySelectorAll(selector)]
      if (elements.length > 100) return { values: [], count: elements.length, supported: false }
      const values = elements.map((element) => {
        if (condition === 'value-equals') return 'value' in element ? String(element.value) : null
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
  if (!measured?.supported)
    return {
      input,
      measured,
      outcome: 'unverified' as const,
      reasonCode: 'measurement-unsupported',
    }
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
  return {
    input,
    measured,
    outcome:
      passed === null
        ? ('unverified' as const)
        : passed
          ? ('verified' as const)
          : ('failed' as const),
    reasonCode: passed === null ? 'measurement-ambiguous' : 'declared-postcondition-measured',
  }
}
