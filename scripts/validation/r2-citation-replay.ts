/** Private fixed-local regression input, never injected into a real-model prompt. */
import { readFileSync } from 'node:fs'
export const citationSource = {
  title: '轻阅目录：访客预览说明',
  version: '1.0',
  markdown: readFileSync(
    new URL('../../evaluation/fixtures/r2-product-acceptance/product-spec.md', import.meta.url),
    'utf8',
  ),
}
export function r4Draft(): any {
  const { draft } = JSON.parse(
    readFileSync(
      new URL(
        '../../evaluation/private/r2-product-acceptance/r4-registration-draft.json',
        import.meta.url,
      ),
      'utf8',
    ),
  )
  for (const step of draft.steps) if (step.value === null) delete step.value
  return draft
}
export const r4Quotes: string[] = [
  ...new Set<string>(
    r4Draft().steps.flatMap((s: any) => [
      s.citation.quote,
      ...s.preconditions.map((p: any) => p.citation.quote),
    ]),
  ),
]
export function r4WithReferences(refs: ReadonlyMap<string, string>) {
  const draft = r4Draft()
  for (const step of draft.steps)
    for (const requirement of [step, ...step.preconditions]) {
      const citationId = refs.get(requirement.citation.quote)
      if (!citationId) throw Error('replay-missing-reference')
      requirement.citation = { citationId }
    }
  return draft
}
