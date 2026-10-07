import { sameOrigin } from './url.ts'

export const CONTROL_PATH_PREFIXES = ['/__control', '/evaluation', '/src/server', '/.git', '/.env']
export type UiNavigationReason =
  | 'malformed-url'
  | 'unsupported-scheme'
  | 'outside-entry-origin'
  | 'control-surface'
  | 'depth-exceeded'
  | 'page-budget-exhausted'
  | 'navigation-attempts-exhausted'
export type UiNavigationDecision =
  | { readonly allow: true; readonly normalized: string }
  | { readonly allow: false; readonly reasonCode: UiNavigationReason }
export interface UiNavigationScope {
  readonly entryUrl: string
  readonly maxPages: number
  readonly maxDepth: number
  readonly visited: readonly string[]
  readonly fromUrl?: string
  readonly depths?: ReadonlyMap<string, number>
}
/** Query order and fragment are route identity. Depth counts navigation edges, never path segments. */
export function normalizePageUrl(raw: string): string {
  return new URL(raw).href
}
export function decideUiNavigation(
  input: UiNavigationScope & { url: string },
): UiNavigationDecision {
  let target: URL
  try {
    target = new URL(input.url)
    if (!/^https?:$/.test(target.protocol))
      return { allow: false, reasonCode: 'unsupported-scheme' }
    if (!sameOrigin(input.url, input.entryUrl))
      return { allow: false, reasonCode: 'outside-entry-origin' }
    const path = decodeURIComponent(target.pathname)
    if (CONTROL_PATH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`)))
      return { allow: false, reasonCode: 'control-surface' }
  } catch {
    return { allow: false, reasonCode: 'malformed-url' }
  }
  const normalized = target.href
  const known = new Set(input.visited.map(normalizePageUrl))
  const entry = normalizePageUrl(input.entryUrl)
  const from = input.fromUrl ? normalizePageUrl(input.fromUrl) : entry
  const depth =
    input.depths?.get(normalized) ??
    (normalized === entry ? 0 : (input.depths?.get(from) ?? (from === entry ? 0 : 1)) + 1)
  if (depth > input.maxDepth) return { allow: false, reasonCode: 'depth-exceeded' }
  if (!known.has(normalized) && known.size >= input.maxPages)
    return { allow: false, reasonCode: 'page-budget-exhausted' }
  return { allow: true, normalized }
}

/** Owned by the network boundary. Reservations happen synchronously before DNS or I/O. */
export function createNavigationBudget(input: {
  entryUrl: string
  maxPages: number
  maxDepth: number
}) {
  const entry = normalizePageUrl(input.entryUrl)
  const depths = new Map<string, number>([[entry, 0]])
  const landed = new Set<string>()
  let current = entry
  let attempts = 0
  return {
    current: () => current,
    snapshot: () => ({ current, attempts, pages: [...depths.entries()] }),
    check: (url: string, from = current) =>
      decideUiNavigation({ ...input, url, fromUrl: from, visited: [...depths.keys()], depths }),
    reserve(url: string, from: string, redirectFrom?: string): UiNavigationDecision {
      if (++attempts > 8) return { allow: false, reasonCode: 'navigation-attempts-exhausted' }
      if (attempts === 1 && url === entry.split('#')[0]) url = entry
      from = /^https?:/.test(from) ? from : current
      const inherited = redirectFrom ? depths.get(normalizePageUrl(redirectFrom)) : undefined
      const trial = new Map(depths)
      if (inherited !== undefined) {
        // A redirect chain reserves one landing slot, not one slot for every intermediate hop.
        if (!landed.has(redirectFrom!)) trial.delete(normalizePageUrl(redirectFrom!))
        trial.set(normalizePageUrl(url), inherited)
      }
      if (trial.size > input.maxPages) return { allow: false, reasonCode: 'page-budget-exhausted' }
      const decision = decideUiNavigation({
        ...input,
        url,
        fromUrl: from,
        depths: trial,
        visited: [...trial.keys()],
      })
      if (decision.allow) {
        if (inherited !== undefined && !landed.has(redirectFrom!))
          depths.delete(normalizePageUrl(redirectFrom!))
        depths.set(
          decision.normalized,
          inherited ?? depths.get(decision.normalized) ?? (depths.get(from) ?? 0) + 1,
        )
      }
      return decision
    },
    arrive(url: string) {
      if (attempts === 1 && url === entry.split('#')[0]) url = entry
      current = normalizePageUrl(url)
      landed.add(current)
    },
  }
}
