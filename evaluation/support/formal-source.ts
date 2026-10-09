import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { formalRevisionAllowed, type FixtureRevision } from './fixture-revision.ts'
import { verifyStageSeal } from './stage-seal.ts'
import { visualDiagnosticPlan } from './execution-plan.ts'
import { validateFreeze, type FreezeIdentity } from './freeze-identity.ts'

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
  /** The frozen identity the diagnostic executed under. Compared when the caller supplies one. */
  readonly freezeIdentity?: FreezeIdentity
}

export interface FormalSourceDecision {
  readonly ok: boolean
  readonly reason: string | null
}

export function validateFormalSource(input: {
  manifest: FormalSourceManifest | null
  expected: { buildHash: string; campaignId: string }
  /**
   * The identity the paid phase is about to run under. When supplied, a source must carry the *same*
   * frozen identity - a moved window, model, provider, budget, scorer or target is a different
   * experiment that the build hash alone cannot see. Supplying it is what makes the freeze enforce
   * rather than merely exist.
   */
  expectedFreeze?: FreezeIdentity
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
  if (!manifest.fixtureRevision) return { ok: false, reason: 'fixture-revision-missing' }
  if (manifest.fixtureRevision) {
    const revision = formalRevisionAllowed(manifest.fixtureRevision)
    if (!revision.ok) return { ok: false, reason: revision.reason! }
  }
  if (input.expectedFreeze) {
    // A source with no identity cannot be checked against the current one, so it is refused rather
    // than waved through on its buildHash - that would silently downgrade the gate.
    if (!manifest.freezeIdentity) return { ok: false, reason: 'diagnostic-source-freeze-missing' }
    const freeze = validateFreeze(manifest.freezeIdentity, input.expectedFreeze)
    if (!freeze.ok)
      return {
        ok: false,
        reason: `diagnostic-source-freeze-mismatch:${freeze.mismatches.join(',')}`,
      }
  }
  return { ok: true, reason: null }
}

/** Read and validate a diagnostic-source directory. A missing or unreadable file is a refusal. */
export async function readFormalSource(
  directory: string,
  expected: { buildHash: string; campaignId: string },
  expectedFreeze?: FreezeIdentity,
): Promise<FormalSourceDecision & { manifest: FormalSourceManifest | null }> {
  let manifest: FormalSourceManifest | null = null
  try {
    manifest = JSON.parse(await readFile(resolve(directory, 'manifest.json'), 'utf8'))
  } catch {
    return { ok: false, reason: 'diagnostic-source-unreadable', manifest: null }
  }
  const decision = validateFormalSource({ manifest, expected, expectedFreeze })
  if (!decision.ok) return { ...decision, manifest }
  const required = [
    'manifest.json',
    'protocol.json',
    'runs.jsonl',
    'requests.jsonl',
    'ledger.jsonl',
    'artifact-index.json',
    'persistence-audit.json',
    'scoreboard.json',
  ]
  if (!(await verifyStageSeal(directory, required)))
    return { ok: false, reason: 'diagnostic-evidence-unsealed', manifest }
  try {
    const read = async (name: string) =>
      JSON.parse(await readFile(resolve(directory, name), 'utf8'))
    const rows = (await readFile(resolve(directory, 'runs.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    const plan = visualDiagnosticPlan()
    if (
      rows.length !== plan.length ||
      !plan.every(
        (p) =>
          rows.filter(
            (r) =>
              r.group === p.group &&
              r.case === p.case &&
              r.repeat === p.repeat &&
              r.outcome === 'passed' &&
              r.runId,
          ).length === 1,
      )
    )
      throw Error('rows')
    if (
      (await read('persistence-audit.json')).passed !== true ||
      (await read('scoreboard.json')).passed !== true
    )
      throw Error('audit')
    const ledger = (await readFile(resolve(directory, 'ledger.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    if (
      !ledger.length ||
      ledger.some((r) => !r.requestId) ||
      new Set(ledger.map((r) => r.requestId)).size !== ledger.length
    )
      throw Error('requests')
    for (const row of rows) {
      const record = await read(`${row.case}/${row.repeat}/report.json`)
      const score = await read(`${row.case}/${row.repeat}/score.json`)
      if (
        record.runId !== row.runId ||
        !score.passed ||
        score.assertions?.some((a: any) => !a.passed)
      )
        throw Error('record')
    }
  } catch {
    return { ok: false, reason: 'diagnostic-evidence-incomplete', manifest }
  }
  return { ...decision, manifest }
}
