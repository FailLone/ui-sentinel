import type { SlimSnapshot } from './observation-slim.ts'

export interface StaleConfig {
  readonly maxStaleBeforeHint: number
  readonly maxStaleBeforeCompact: number
}

export const DEFAULT_STALE_CONFIG: Readonly<StaleConfig> = {
  maxStaleBeforeHint: 2,
  maxStaleBeforeCompact: 4,
}

export type FreshnessResult =
  | { readonly fresh: true }
  | { readonly fresh: false; readonly staleCount: number; readonly compact: boolean; readonly hint: string | null }

export function createStaleDetector(config: Partial<StaleConfig> = {}) {
  const cfg: StaleConfig = { ...DEFAULT_STALE_CONFIG, ...config }
  let lastFingerprint: string | null = null
  let consecutiveStale = 0
  let totalStale = 0
  let totalChecks = 0
  let reusedCount = 0

  function slimFingerprint(slim: SlimSnapshot): string {
    const selectors = slim.elements
      .map(e => `${e.selector}:${e.visible}:${e.enabled}:${e.text.slice(0, 60)}`)
      .sort()
      .join('|')
    return `${slim.url}\0${slim.pageText}\0${slim.elementCount}\0${selectors}`
  }

  function checkFingerprint(fp: string): FreshnessResult {
    totalChecks++

    if (fp !== lastFingerprint) {
      lastFingerprint = fp
      consecutiveStale = 0
      return { fresh: true }
    }

    consecutiveStale++
    totalStale++

    if (consecutiveStale >= cfg.maxStaleBeforeCompact) {
      reusedCount++
      return {
        fresh: false,
        staleCount: consecutiveStale,
        compact: true,
        hint: `Page unchanged for ${consecutiveStale} consecutive observations. Consider: (1) act on current state, (2) record findings and call run_finish, (3) navigate to unexplored area. Repeated observation without new facts wastes budget.`,
      }
    }

    if (consecutiveStale >= cfg.maxStaleBeforeHint) {
      return {
        fresh: false,
        staleCount: consecutiveStale,
        compact: false,
        hint: `No new facts since last observation (stale x${consecutiveStale}). Alternatives: use element_details for specific data, try a different action, check if investigation can conclude, or call run_finish.`,
      }
    }

    return { fresh: false, staleCount: consecutiveStale, compact: false, hint: null }
  }

  function checkObservation(slim: SlimSnapshot): FreshnessResult {
    return checkFingerprint(slimFingerprint(slim))
  }

  function checkA11y(url: string, a11yTree: string): FreshnessResult {
    return checkFingerprint(`${url}\0${a11yTree}`)
  }

  function recordAction(): void {
    consecutiveStale = 0
  }

  function invalidate(): void {
    lastFingerprint = null
    consecutiveStale = 0
  }

  function getStats(): {
    readonly totalChecks: number
    readonly totalStale: number
    readonly reusedCount: number
    readonly consecutiveStale: number
  } {
    return { totalChecks, totalStale, reusedCount, consecutiveStale }
  }

  return { checkObservation, checkA11y, recordAction, invalidate, getStats }
}

export type StaleDetector = ReturnType<typeof createStaleDetector>
