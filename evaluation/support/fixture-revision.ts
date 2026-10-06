/**
 * Fixture revisions and the review gate for formal runs (plan P3.2, acceptance R08).
 *
 * The P2 six cases were used to debug the prompt and the algorithm, so they are regression cases now:
 * re-running them after the freeze cannot restore a holdout identity. A revision that claims to be a
 * holdout must carry a review by the main agent; the dev does not get to mark its own homework, so this
 * module never fabricates a review - it only reads what is recorded.
 *
 * A `testOnly` revision exists so the gate's refusal branches can be exercised in free tests without
 * pretending a real holdout was reviewed.
 */
export interface FixtureRevision {
  readonly revision: string
  readonly hash: string
  readonly purpose: 'regression' | 'holdout'
  /** Who reviewed this revision as an undisclosed holdout; null when nobody has. */
  readonly reviewedBy: string | null
  readonly reviewedAt: string | null
  /** True for a revision that may appear only in free tests, never in a paid formal run. */
  readonly testOnly?: boolean
}

export interface RevisionDecision {
  readonly ok: boolean
  readonly reason: string | null
}

/**
 * Whether a revision may be used for a formal, paid run.
 *
 * Formal acceptance requires a reviewed holdout. Known regression fixtures remain available in free preflight and diagnostic. A holdout must have been
 * reviewed by someone, and never a test-only one whatever it claims.
 */
export function formalRevisionAllowed(
  revision: FixtureRevision,
  options: { readonly free?: boolean } = {},
): RevisionDecision {
  if (revision.testOnly)
    return options.free
      ? { ok: true, reason: null }
      : { ok: false, reason: 'test-only-revision-not-allowed-for-formal' }
  if (revision.purpose !== 'holdout') return { ok: false, reason: 'regression-revision-not-formal' }
  if (revision.purpose === 'holdout' && (!revision.reviewedBy || !revision.reviewedAt))
    return { ok: false, reason: 'holdout-revision-not-reviewed' }
  return { ok: true, reason: null }
}

/** Read the tracked revision and hash the actual fixture and presentation source. */
export async function currentVisualRevision(): Promise<FixtureRevision> {
  const { readFile } = await import('node:fs/promises')
  const { createHash } = await import('node:crypto')
  const metadata = JSON.parse(await readFile('evaluation/fixtures/visual-revision.json', 'utf8'))
  const hash = createHash('sha256')
  for (const path of [
    'evaluation/fixtures/visual-revision.json',
    'evaluation/fixtures/visual.ts',
    'arena/checkout/src/server/search-view.tsx',
  ])
    hash.update(path).update(await readFile(path))
  return { ...metadata, hash: hash.digest('hex') }
}
