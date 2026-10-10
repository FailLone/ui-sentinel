import type { PublicCheckPage, PublicNode } from './check-contract.ts'
import { floatingSurface } from '../execution/popup/surface.ts'
const name = (n: PublicNode) => (n.attributes['aria-label'] ?? n.text).trim().replace(/\s+/g, ' ')
/** Replay existing generic observations against a requirement frozen before the action. */
export function evaluatePopupEffect(
  before: PublicCheckPage,
  after: PublicCheckPage[],
  expected: string,
) {
  const matches = (p: PublicCheckPage) =>
    p.nodes.filter(
      (n) =>
        n.visible &&
        n.popupSurface &&
        floatingSurface(n.popupSurface.kind, n.popupSurface) &&
        (expected === '*' || name(n) === expected),
    )
  if (
    !before.documentIdentity ||
    !before.complete ||
    after.length !== 2 ||
    after.some(
      (p) => !p.complete || p.url !== before.url || p.documentIdentity !== before.documentIdentity,
    )
  )
    return {
      outcome: 'unverified' as const,
      reason: 'popup-functional-observation-incomplete',
      matched: [] as string[],
    }
  if (matches(before).length)
    return {
      outcome: 'unverified' as const,
      reason: 'popup-expectation-already-satisfied-before-action',
      matched: [] as string[],
    }
  const samples = after.map(matches)
  if (expected !== '*' && samples.some((m) => m.length > 1))
    return {
      outcome: 'unverified' as const,
      reason: 'popup-expectation-multiple-matches',
      matched: [] as string[],
    }
  const found = samples.flat()
  if (!found.length)
    return {
      outcome: 'unverified' as const,
      reason: 'expected-popup-not-observed-in-bounded-samples',
      matched: [] as string[],
    }
  const identities = found.map((n) => n.identity)
  if (
    identities.some((id) => !id) ||
    (expected !== '*' && new Set(identities).size !== 1) ||
    found.some((n) =>
      found.some((other) => other.selector === n.selector && other.identity !== n.identity),
    )
  )
    return {
      outcome: 'unverified' as const,
      reason: 'popup-functional-node-replaced-or-unbound',
      matched: [] as string[],
    }
  if (
    found.some((node) => {
      const prior = before.nodes.find((n) => n.selector === node.selector)
      return prior && prior.identity !== node.identity
    })
  )
    return {
      outcome: 'unverified' as const,
      reason: 'popup-functional-node-replaced-or-unbound',
      matched: [] as string[],
    }
  return {
    outcome: 'verified' as const,
    reason: 'declared-popup-observed-after-completed-action',
    matched: [...new Set(found.map((n) => n.selector))],
  }
}
