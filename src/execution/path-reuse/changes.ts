import {
  checkHash,
  type PublicCheckPage,
  type PublicNode,
} from '../../inspection/check-contract.ts'
import { projectInspectionScope } from '../../inspection/scope.ts'
import { productTarget } from '../../inspection/product-path.ts'
import type { UiContractSnapshot } from '../../inspection/contract.ts'
import type { RunEvent } from '../../shared/types.ts'
import { matchTarget, type PathProgram } from './library.ts'

export function baselinePages(events: readonly RunEvent[]): (PublicCheckPage | undefined)[] {
  const items = projectInspectionScope(events).snapshot().items
  return events
    .filter((e) => e.type === 'product:bound')
    .map((e) => items.find((i) => i.itemId === e.payload.itemId)?.checks?.sourceReview.page)
}
export function compareIdentity(program: PathProgram, contract: UiContractSnapshot) {
  const entryMatches = program.entryUrl === contract.entryUrl && program.origin === contract.origin
  const source = contract.productSource
  const sourceMatches =
    !!source &&
    source.sourceId === program.source.sourceId &&
    source.contentHash === program.source.contentHash &&
    source.version === program.source.version
  return {
    baselineRunId: program.provenance?.runId,
    programId: program.id,
    historicalSteps: program.plan.steps.map((s) => s.title),
    previous: { entryUrl: program.entryUrl, origin: program.origin, source: program.source },
    current: {
      entryUrl: contract.entryUrl,
      origin: contract.origin,
      source: source
        ? { sourceId: source.sourceId, contentHash: source.contentHash, version: source.version }
        : null,
    },
    entryMatches,
    sourceMatches,
    recommendation: entryMatches && sourceMatches ? 'try-remeasure' : 'new-investigation',
  }
}
const facts = (n: PublicNode) => ({
  selector: n.selector,
  tag: n.tag,
  name: n.name,
  text: n.text,
  value: n.value,
  selectedLabel: n.selectedLabel,
  visible: n.visible,
  attributes: n.attributes,
})
const complete = (p?: PublicCheckPage): p is PublicCheckPage =>
  !!p && p.complete && p.total === p.nodes.length && !p.nodes.some((n) => n.leaf && n.truncated)
export function compareStep(
  program: PathProgram,
  index: number,
  previous: PublicCheckPage | undefined,
  current: PublicCheckPage,
) {
  const entry = {
    expected: program.entryUrl,
    actual: current.url,
    matches: current.url === program.entryUrl,
  }
  const binding = program.bindings[index]!
  const targets = [binding.control, binding.result, ...binding.preconditions]
  const dependencies = targets.map((t, i) => {
    const before =
      previous?.nodes.filter((n) => n.selector === t.selector || n.path === t.selector) ?? []
    const after = current.nodes.filter((n) => n.selector === t.selector || n.path === t.selector)
    let state = 'compatible-description'
    try {
      if (!complete(current) || after.some((n) => n.truncated)) state = 'unknown-observation'
      else {
        matchTarget(current, t)
        if (i === 0) productTarget(program.plan.steps[index]!, current, t.selector)
      }
    } catch (error) {
      state = error instanceof Error ? error.message : 'unknown-observation'
    }
    return {
      role: i === 0 ? 'control' : i === 1 ? 'result' : 'precondition',
      selector: t.selector,
      state,
      before: before.map(facts),
      after: after.map(facts),
      factsChanged:
        complete(previous) && complete(current) && ![...before, ...after].some((n) => n.truncated)
          ? checkHash(before.map(facts)) !== checkHash(after.map(facts))
          : null,
    }
  })
  // Aggregate ancestor text includes descendants; it cannot locate an independent display change.
  const outside = (page: PublicCheckPage) =>
    page.nodes
      .filter(
        (n) =>
          n.leaf &&
          !targets.some(
            (t) =>
              n.selector === t.selector ||
              n.path === t.selector ||
              page.nodes.some(
                (parent) =>
                  (parent.selector === t.selector || parent.path === t.selector) &&
                  n.path?.startsWith((parent.path ?? parent.selector) + ' > '),
              ),
          ),
      )
      .map(facts)
  const observed =
    complete(previous) && complete(current) && dependencies.every((d) => d.factsChanged !== null)
  const outsideChanged = observed
    ? checkHash(outside(previous)) !== checkHash(outside(current))
    : null
  const outsideBefore = previous ? outside(previous) : []
  const outsideAfter = outside(current)
  const outsideChanges = observed
    ? [...new Set([...outsideBefore, ...outsideAfter].map((n) => n.selector))].flatMap(
        (selector) => {
          const before = outsideBefore.filter((n) => n.selector === selector)
          const after = outsideAfter.filter((n) => n.selector === selector)
          return checkHash(before) === checkHash(after) ? [] : [{ selector, before, after }]
        },
      )
    : []
  const invalid = dependencies.some(
    (d) => !['compatible-description', 'unknown-observation'].includes(d.state),
  )
  return {
    index,
    stage: 'before-step',
    entry,
    previousComplete: complete(previous),
    currentComplete: complete(current),
    classification: !entry.matches
      ? 'entry-change'
      : !observed
        ? 'unknown'
        : invalid || dependencies.some((d) => d.factsChanged)
          ? 'dependency-change'
          : outsideChanged
            ? 'outside-dependency-display-change'
            : 'no-observed-change',
    recommendation: !entry.matches
      ? 'new-investigation'
      : !observed
        ? 'unknown'
        : invalid
          ? 'new-investigation'
          : 'try-remeasure',
    dependencies,
    outsideChanged,
    outsideChangeCount: outsideChanges.length,
    outsideChanges: outsideChanges.slice(0, 12),
    previousObservationHash: previous ? checkHash(previous) : null,
    currentObservationHash: checkHash(current),
    scope:
      'Complete public leaf and dependency facts at this reached step only; ancestor aggregate text excluded; no script, style, network or whole-site compatibility claim.',
  }
}
