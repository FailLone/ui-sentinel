import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { formalRevisionAllowed, type FixtureRevision } from './fixture-revision.ts'

/**
 * Whether a directory may authorise a paid formal run (plan P3.2, acceptance R02).
 *
 * A formal batch inherits its right to spend from a *passed real diagnostic* on the *same build*. It
 * must not accept a preflight, a P2 smoke, a diagnostic from another campaign, a diagnostic that
 * failed, a diagnostic on a different build, or a diagnostic that never made a real request - each of
 * which has happened to look superficially usable. So this reads the manifest and checks the kind, the
 * mode, the pass flag, the build hash and the campaign, and refuses with a named reason rather than
 * trusting a lone `passed: true`.
 */

export interface FormalSourceManifest {
  readonly kind?: string
  readonly mode?: 'fixed' | 'real'
  readonly stage?: string
  readonly passed?: boolean
  readonly buildHash?: string
  readonly campaignId?: string
  readonly commit?: string
  readonly fixtureRevision?: FixtureRevision
}

export interface FormalSourceDecision {
  readonly ok: boolean
  readonly reason: string | null
}

export function validateFormalSource(input: {
  manifest: FormalSourceManifest | null
  expected: { buildHash: string; campaignId: string }
}): FormalSourceDecision {
  const manifest = input.manifest
  if (!manifest) return { ok: false, reason: 'diagnostic-source-missing' }
  // Only a real diagnostic authorises spending. preflight, p2-smoke and formal itself do not.
  if (manifest.kind !== 'visual-focus-diagnostic')
    return { ok: false, reason: `diagnostic-source-wrong-kind:${manifest.kind ?? 'unknown'}` }
  if (manifest.mode !== 'real') return { ok: false, reason: 'diagnostic-source-not-real' }
  if (manifest.passed !== true) return { ok: false, reason: 'diagnostic-source-not-passed' }
  if (manifest.buildHash !== input.expected.buildHash)
    return { ok: false, reason: 'diagnostic-source-build-mismatch' }
  if (manifest.campaignId !== input.expected.campaignId)
    return { ok: false, reason: 'diagnostic-source-campaign-mismatch' }
  if (manifest.fixtureRevision) {
    const revision = formalRevisionAllowed(manifest.fixtureRevision)
    if (!revision.ok) return { ok: false, reason: revision.reason! }
  }
  return { ok: true, reason: null }
}

/** Read and validate a diagnostic-source directory. A missing or unreadable file is a refusal. */
export async function readFormalSource(
  directory: string,
  expected: { buildHash: string; campaignId: string },
): Promise<FormalSourceDecision & { manifest: FormalSourceManifest | null }> {
  let manifest: FormalSourceManifest | null = null
  try {
    manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
  } catch {
    return { ok: false, reason: 'diagnostic-source-unreadable', manifest: null }
  }
  return { ...validateFormalSource({ manifest, expected }), manifest }
}
