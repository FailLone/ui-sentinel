import { expect, it } from 'vitest'
import { compareStep, compareIdentity } from './changes.ts'
import { describeTarget, type PathProgram } from './library.ts'
import type { PublicCheckPage, PublicNode } from '../../inspection/check-contract.ts'
const node = (selector: string, text: string): PublicNode => ({
  selector,
  path: selector,
  tag: 'button',
  name: text,
  text,
  attributes: {},
  visible: true,
  truncated: false,
  leaf: true,
  identity: selector,
})
const page: PublicCheckPage = {
  url: 'https://example.org/',
  documentVersion: '1',
  complete: true,
  total: 3,
  nodes: [node('#go', 'Go'), node('#result', 'Waiting'), node('#caption', 'Hello')],
}
const program = {
  id: 'path-test',
  entryUrl: page.url,
  origin: 'https://example.org',
  provenance: { runId: 'old' },
  source: { sourceId: 's', version: '1', contentHash: 'hash' },
  plan: {
    steps: [{ action: 'click', title: 'Go', targetName: 'Go', citation: { quote: 'Click Go' } }],
  },
  bindings: [
    {
      control: describeTarget(page, '#go', true),
      result: describeTarget(page, '#result'),
      preconditions: [],
    },
  ],
} as unknown as PathProgram
it('separates display changes and live dependency changes without treating either as a pass', () => {
  const current = structuredClone(page)
  current.nodes[2]!.text = 'Welcome'
  expect(compareStep(program, 0, page, current).classification).toBe(
    'outside-dependency-display-change',
  )
  current.nodes[0]!.name = 'Other'
  const result = compareStep(program, 0, page, current)
  expect(result.classification).toBe('dependency-change')
  expect(result.recommendation).toBe('new-investigation')
  expect(result.dependencies[0]?.state).toBe('target-description-changed')
})
it('same public facts are only permission to try; document/node identities never imply success', () => {
  const current = structuredClone(page)
  current.documentVersion = 'new'
  current.nodes.forEach((n) => {
    n.identity = 'new-' + n.identity
  })
  expect(compareStep(program, 0, page, current)).toMatchObject({
    classification: 'no-observed-change',
    recommendation: 'try-remeasure',
  })
})
it.each(['missing-history', 'partial-history', 'partial-current', 'truncated', 'wrong-count'])(
  'keeps %s observation unknown',
  (kind) => {
    const before = structuredClone(page),
      current = structuredClone(page)
    if (kind === 'partial-history') before.complete = false
    if (kind === 'partial-current') current.complete = false
    if (kind === 'truncated') current.nodes[0]!.truncated = true
    if (kind === 'wrong-count') current.total = 1000
    expect(
      compareStep(program, 0, kind === 'missing-history' ? undefined : before, current)
        .classification,
    ).toBe('unknown')
  },
)
it('distinguishes result facts from structural compatibility', () => {
  const current = structuredClone(page)
  current.nodes[1]!.text = 'Changed'
  expect(compareStep(program, 0, page, current)).toMatchObject({
    classification: 'dependency-change',
    recommendation: 'try-remeasure',
  })
})
it.each(['source', 'version', 'entry'])(
  'requires new investigation for exact %s mismatch',
  (kind) => {
    const contract: any = {
      entryUrl: page.url,
      origin: program.origin,
      productSource: { ...program.source },
    }
    if (kind === 'source') contract.productSource.contentHash = 'different'
    if (kind === 'version') contract.productSource.version = '2'
    if (kind === 'entry') contract.entryUrl += '?different'
    expect(compareIdentity(program, contract).recommendation).toBe('new-investigation')
  },
)
it('excludes truncated ancestor aggregate text but refuses a truncated dependency', () => {
  const current = structuredClone(page)
  const ancestor = { ...node('#parent', 'long'), leaf: false, truncated: true }
  current.nodes.push(ancestor)
  current.total++
  expect(compareStep(program, 0, page, current).classification).toBe('no-observed-change')
  current.nodes[0]!.leaf = false
  current.nodes[0]!.truncated = true
  expect(compareStep(program, 0, page, current).classification).toBe('unknown')
})
