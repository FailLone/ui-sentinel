import { sameOrigin } from './url.ts'

/**
 * The bounded navigation rule of a `ui-scan` run (plan 4.1, 5.1).
 *
 * The contract fixes three limits - entry origin, `maxPages`, `maxDepth` - and this is where they are
 * enforced, per target, *before* the browser is asked to go there. It is a pure decision over the
 * entry URL, the limits and the pages the run has already visited, so the same call can be unit-tested
 * and can precede dispatch rather than inspecting where the page ended up.
 *
 * Two deliberate readings of "depth". Depth is counted in *path segments* below the entry document's
 * own directory, not from the site root: a user who submits `/catalog` has fixed a directory and a
 * sibling `/detail` is one step away, while `/a/b` is two. And a fragment is not a page - it never
 * reaches the server - so it is preserved in the normalized address but does not spend the budget.
 */

export const CONTROL_PATH_PREFIXES = ['/__control', '/evaluation', '/src/server', '/.git', '/.env']

export type UiNavigationReason =
  | 'malformed-url'
  | 'unsupported-scheme'
  | 'outside-entry-origin'
  | 'control-surface'
  | 'depth-exceeded'
  | 'page-budget-exhausted'

export type UiNavigationDecision =
  | { readonly allow: true; readonly normalized: string }
  | { readonly allow: false; readonly reasonCode: UiNavigationReason }

export interface UiNavigationScope {
  readonly entryUrl: string
  readonly maxPages: number
  readonly maxDepth: number
  /** Pages already reached, as they were executed. The entry document is one of them. */
  readonly visited: readonly string[]
}

/**
 * The page identity of an address: everything the server sees, minus the fragment.
 *
 * Query order and repeated parameters are kept, because they are part of what the page *is* - a run
 * that treated `?a=1&b=2` and `?b=2&a=1` as one page would claim a budget it did not spend.
 */
export function normalizePageUrl(raw: string): string {
  const url = new URL(raw)
  url.hash = ''
  return url.href
}

/** Path segments as the browser would send them; a malformed escape yields no segments. */
function segments(pathname: string): string[] {
  try {
    return decodeURIComponent(pathname).split('/').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * How far a target sits from the entry document, counted in path segments.
 *
 * The entry document is 0. A target *below* the entry path costs the extra segments (`/catalog` →
 * `/catalog/detail` is 1), and a target that leaves the entry path costs its own segment count, so
 * its siblings are 1 (`/catalog` → `/detail`) and anything two deep is 2 (`/about/team`). The entry
 * path is read as the directory the run was pointed at, which is what makes "one level from the
 * entry" mean the same thing whether the user submitted a file path or a directory.
 */
function depthOf(target: URL, entry: URL): number {
  const base = segments(entry.pathname)
  const parts = segments(target.pathname)
  const under = base.every((segment, index) => parts[index] === segment)
  return under ? parts.length - base.length : parts.length
}

export function decideUiNavigation(
  input: UiNavigationScope & { url: string },
): UiNavigationDecision {
  let target: URL
  let entry: URL
  try {
    target = new URL(input.url)
    entry = new URL(input.entryUrl)
  } catch {
    return { allow: false, reasonCode: 'malformed-url' }
  }
  if (!/^https?:$/.test(target.protocol)) return { allow: false, reasonCode: 'unsupported-scheme' }
  if (!sameOrigin(input.url, input.entryUrl))
    return { allow: false, reasonCode: 'outside-entry-origin' }
  const decoded = decodeURIComponent(target.pathname)
  if (CONTROL_PATH_PREFIXES.some((p) => decoded === p || decoded.startsWith(`${p}/`)))
    return { allow: false, reasonCode: 'control-surface' }
  if (depthOf(target, entry) > input.maxDepth) return { allow: false, reasonCode: 'depth-exceeded' }

  const normalized = normalizePageUrl(input.url)
  // The entry document's own page is always reachable: it is where the run started, so re-loading it
  // is not a new page and cannot exhaust a budget that was carved around it.
  const known = new Set([normalizePageUrl(input.entryUrl), ...input.visited.map(normalizePageUrl)])
  if (!known.has(normalized) && known.size >= input.maxPages)
    return { allow: false, reasonCode: 'page-budget-exhausted' }
  return { allow: true, normalized }
}
