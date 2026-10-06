/**
 * The comparisons a post-shutdown audit makes (plan P3.4, acceptance E01-E03).
 *
 * They are pure functions over what the API reported and what a fresh read of the stopped database
 * holds, so each failure mode - a lost middle row, a reused seq, a rewritten payload, an unindexed
 * artifact - can be produced and proven without a real campaign. The point of E01 is coverage: the
 * API side reads the *whole* history, so a tail-only comparison would call a truncated log matching.
 * The point of E02 is content: a change inside one row must fail on its own.
 */

export interface AuditEvent {
  readonly id: string
  readonly seq: number
  readonly type: string
  readonly payload: unknown
  readonly evidenceRefs: readonly string[]
}

export interface AuditFinding {
  readonly id: string
  readonly validationStatus: string
  readonly evidenceRefs: readonly string[]
}

export interface AuditHypothesis {
  readonly id: string
  readonly status: string
  readonly evidenceRefs: readonly string[]
}

export interface ComparisonResult {
  readonly passed: boolean
  readonly failedAssertions: readonly string[]
}

function compareById<T extends { id: string }>(
  api: readonly T[],
  stored: readonly T[],
  label: string,
  differ: (a: T, b: T) => boolean,
): ComparisonResult {
  const failed: string[] = []
  if (
    new Set(api.map((r) => r.id)).size !== api.length ||
    new Set(stored.map((r) => r.id)).size !== stored.length
  )
    failed.push(`${label}-id-duplicated`)
  const storedById = new Map(stored.map((row) => [row.id, row]))
  if (api.length !== stored.length) failed.push(`${label}-count`)
  for (const row of api) {
    const other = storedById.get(row.id)
    if (!other) {
      // The API named a row the store no longer holds: the report described evidence that is gone.
      failed.push(`${label}-missing`)
      continue
    }
    if (differ(row, other)) failed.push(`${label}-changed`)
  }
  // A row the store holds but the API never reported is also a difference - the direction that means
  // the report's view of the run was incomplete. The count check catches most of these, but a
  // same-length swap of one id for another must not slip through.
  if (stored.some((row) => !api.some((a) => a.id === row.id)))
    failed.push(`${label}-missing-from-api`)
  return { passed: failed.length === 0, failedAssertions: failed }
}

const canonical = (x: any): string =>
  JSON.stringify(
    x && typeof x === 'object'
      ? Array.isArray(x)
        ? x.map((v) => JSON.parse(canonical(v)))
        : Object.fromEntries(
            Object.keys(x)
              .sort()
              .map((k) => [k, JSON.parse(canonical(x[k] ?? null))]),
          )
      : x,
  )
const sameJson = (a: unknown, b: unknown) => canonical(a) === canonical(b)

/**
 * Compare the full event history. Order matters, ids matter, payloads and evidence lists matter, and
 * the sequence numbers must be gapless and non-repeating on the stored side.
 */
export function compareEventHistory(
  api: readonly AuditEvent[],
  stored: readonly AuditEvent[],
): ComparisonResult {
  const failed: string[] = []
  const eventsMatch = compareById(
    api,
    stored,
    'events',
    (a, b) =>
      a.seq !== b.seq ||
      differ(a.type, b.type) ||
      differ(a.payload, b.payload) ||
      differ(a.evidenceRefs, b.evidenceRefs),
  )
  failed.push(...eventsMatch.failedAssertions)

  // A duplicate or missing seq is invisible to an id-keyed comparison, so check the sequence itself.
  // Both sides are checked: a paginated API response that dropped a middle page is exactly the
  // failure E01 names, and it would not show up as a count difference if a later page repeated rows.
  for (const [side, events] of [
    ['stored', stored],
    ['api', api],
  ] as const) {
    const seqs = events.map((e) => e.seq)
    if (new Set(seqs).size !== seqs.length) failed.push('events-seq-duplicated')
    const sorted = [...seqs].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i]! !== sorted[i - 1]! + 1) {
        failed.push(side === 'api' ? 'events-api-incomplete' : 'events-seq-gap')
        break
      }
  }
  return { passed: failed.length === 0, failedAssertions: [...new Set(failed)] }
}

export function compareFindings(
  api: readonly AuditFinding[],
  stored: readonly AuditFinding[],
): ComparisonResult {
  return compareById(api, stored, 'findings', (a, b) => differ(a, b))
}

export function compareHypotheses(
  api: readonly AuditHypothesis[],
  stored: readonly AuditHypothesis[],
): ComparisonResult {
  return compareById(api, stored, 'hypotheses', (a, b) => differ(a, b))
}

function differ(a: unknown, b: unknown): boolean {
  return !sameJson(a, b)
}

export interface ArtifactHashResult {
  readonly artifactId: string
  /** The stored file and the downloaded copy are both present and share one SHA-256. */
  readonly hashesMatch: boolean
  /** The artifact-index has an entry for this artifact at all. */
  readonly indexed: boolean
  readonly exists: boolean
}

/**
 * Grade artifact byte comparison. An artifact the index never mentions is a failure: the index must
 * cover the whole evidence set, and an empty index over a run that recorded artifacts is exactly the
 * "empty collection passes" shape the acceptance forbids.
 */
export function evaluateHashes(
  results: readonly ArtifactHashResult[],
  options: { expectedCount?: number } = {},
): ComparisonResult {
  const failed: string[] = []
  for (const result of results) {
    if (!result.indexed) failed.push(`artifact-not-indexed:${result.artifactId}`)
    else if (!result.hashesMatch) failed.push(`artifact-bytes-changed:${result.artifactId}`)
  }
  if (options.expectedCount != null && results.length !== options.expectedCount)
    failed.push('artifact-index-incomplete')
  return { passed: failed.length === 0, failedAssertions: failed }
}
