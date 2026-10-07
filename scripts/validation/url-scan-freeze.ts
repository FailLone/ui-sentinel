import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'

/**
 * The frozen identity a paid URL-scan batch runs against (plan 10.3, B5).
 *
 * Plan 10.3 requires that before any paid call the exact build, configuration, fixtures, scorer and
 * sample matrix are fixed and hashed, so a result can be attributed to what actually produced it. This
 * module is that record. It is deliberately separate from the runner: the runner *reads* a manifest,
 * and this is what a reviewer reads to decide whether to authorise the batch at all.
 *
 * The plan is derived from the samples and the repetition count rather than written down, because a
 * hand-written matrix is a second place for the numbers to disagree - and a batch that quietly ran 14
 * of 15 planned runs is exactly the failure the freeze exists to prevent.
 */

export interface UrlScanManifestInput {
  /** The full commit the batch is cut from; a moving reference is not a frozen identity. */
  readonly commit: string
  readonly buildHash: string
  /** Configuration that affects behaviour, already redacted of secrets by the caller. */
  readonly configuration: Record<string, unknown>
  readonly fixtureHash: string
  readonly scorerHash: string
  readonly policyRevision: string
  readonly promptRevision: string
  readonly samples: readonly string[]
  readonly repetitions: number
  readonly costCeilingUsd: number
}

export interface UrlScanPlanRow {
  readonly sampleId: string
  readonly repetition: number
}

export interface UrlScanManifest extends UrlScanManifestInput {
  readonly schemaVersion: 'url-scan-manifest-1'
  readonly plan: {
    readonly runsPerSample: number
    readonly totalRuns: number
    readonly rows: readonly UrlScanPlanRow[]
  }
  readonly hash: string
}

/** Deterministic JSON, so the hash does not depend on key insertion order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export function buildUrlScanManifest(input: UrlScanManifestInput): UrlScanManifest {
  if (!/^[0-9a-f]{40}$/.test(input.commit))
    throw new Error(`A batch must be cut from a full commit SHA, got "${input.commit}".`)
  if (!input.samples.length) throw new Error('A batch needs at least one sample.')
  if (new Set(input.samples).size !== input.samples.length)
    throw new Error('A batch cannot list the same sample twice.')
  if (!Number.isInteger(input.repetitions) || input.repetitions < 1)
    throw new Error(`repetitions must be a positive integer, got ${input.repetitions}.`)
  if (!(input.costCeilingUsd > 0))
    throw new Error(`A batch needs a positive cost ceiling, got ${input.costCeilingUsd}.`)

  const rows = input.samples.flatMap((sampleId) =>
    Array.from({ length: input.repetitions }, (_, i) => ({ sampleId, repetition: i + 1 })),
  )
  const body = {
    schemaVersion: 'url-scan-manifest-1' as const,
    commit: input.commit,
    buildHash: input.buildHash,
    configuration: input.configuration,
    fixtureHash: input.fixtureHash,
    scorerHash: input.scorerHash,
    policyRevision: input.policyRevision,
    promptRevision: input.promptRevision,
    samples: [...input.samples],
    repetitions: input.repetitions,
    costCeilingUsd: input.costCeilingUsd,
    plan: { runsPerSample: input.repetitions, totalRuns: rows.length, rows },
  }
  return { ...body, hash: createHash('sha256').update(canonical(body)).digest('hex') }
}

/** Verify a manifest's own hash: the check that makes "from this build" a fact rather than a claim. */
export function verifyUrlScanManifest(manifest: UrlScanManifest | null | undefined): boolean {
  if (!manifest || typeof manifest !== 'object') return false
  if (manifest.schemaVersion !== 'url-scan-manifest-1') return false
  const { hash, ...body } = manifest
  if (typeof hash !== 'string') return false
  return createHash('sha256').update(canonical(body)).digest('hex') === hash
}

export interface HashedTree {
  readonly hash: string
  readonly files: Readonly<Record<string, string>>
}

/**
 * Hash the *contents* of a tree, as an identity.
 *
 * Content rather than path or mtime: two checkouts of the same code are the same identity, and a
 * touched file with unchanged bytes is not a new build. Tests and source maps are skipped because
 * they cannot affect a run's behaviour, so including them would make the identity move without the
 * product moving.
 */
export async function hashTree(
  root: string,
  options: { readonly skip?: (path: string) => boolean } = {},
): Promise<HashedTree> {
  const files: Record<string, string> = {}
  const visit = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') await visit(file)
      } else if (entry.isFile() && !file.endsWith('.map') && !options.skip?.(file)) {
        files[relative(root, file)] = createHash('sha256')
          .update(await readFile(file))
          .digest('hex')
      }
    }
  }
  await visit(root)
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  return { hash: createHash('sha256').update(canonical(sorted)).digest('hex'), files: sorted }
}

/** Keys whose values are secrets. Matched case-insensitively anywhere in a key name. */
const SECRET_KEY = /(key|token|secret|password|passwd|authorization|credential|cookie)/i
const PUBLIC_TOKEN_COUNTS = new Set(['maxOutputTokens', 'min_prompt_tokens', 'max_prompt_tokens'])

/**
 * Redact a configuration block for a manifest.
 *
 * A manifest is handed to a reviewer and quoted in a delivery report, so a raw environment dump in it
 * would be a leak with an audience. Names are kept and values replaced: a reviewer still learns *that*
 * a key was set, which is what matters for reproducing a run, without learning what it was.
 */
export function redactConfiguration(input: Record<string, unknown>): Record<string, unknown> {
  const redact = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(redact)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          PUBLIC_TOKEN_COUNTS.has(k) && typeof v === 'number' && Number.isFinite(v)
            ? v
            : SECRET_KEY.test(k)
              ? '<redacted>'
              : redact(v),
        ]),
      )
    return value
  }
  return redact(input) as Record<string, unknown>
}

/**
 * The changed paths that can actually move a run's result.
 *
 * A formal batch must be cut from a clean tree (plan 10.3), but "clean" has to mean *the build*, not
 * the whole working copy: a plan document, a README or another agent's notes are not part of a run's
 * identity, and letting them block a freeze would make the gate about the checkout rather than about
 * the artifact. This returns the offending paths so the refusal can name them.
 */
export function dirtyPathsAffectingRuns(porcelain: string): string[] {
  const RELEVANT =
    /^(src|arena|scripts|evaluation|dist)\/|^(package\.json|pnpm-lock\.yaml|tsconfig\.json|vite\.config|biome\.json|\.env)/
  return porcelain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\S+\s+/, ''))
    .filter((path) => RELEVANT.test(path))
}
