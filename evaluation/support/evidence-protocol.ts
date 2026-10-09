import { isAbsolute, relative, resolve } from 'node:path'

/**
 * The evidence protocol every stage writes (plan P3.4, acceptance E04).
 *
 * One manifest shape for the preflight, the P2 smoke, the paid diagnostic and the paid formal batch,
 * so a reviewer opening a directory can tell what it is without being told, and a tool reading it
 * cannot mistake a free run for one that spent money. `mode` is the field that carries that claim,
 * and it is enforced rather than trusted: the preflight blanks every real credential, so a manifest
 * that called it `real` would be a lie about what ran.
 *
 * The artifact index covers the whole evidence set with ownership, byte count, SHA and a *relative*
 * path, so the index still resolves after the directory is moved or bundled. Raw files are written
 * as they were downloaded; an annotation is a separate entry, never a replacement.
 */

export type Stage = 'preflight' | 'p2-smoke' | 'diagnostic' | 'formal'
export type Mode = 'fixed' | 'real'

export interface FreezeIdentity {
  readonly campaignId: string
  readonly buildHash: string
  readonly commit: string
}

export interface EvidenceManifest {
  readonly kind: string
  readonly mode: Mode
  readonly stage: Stage
  readonly schemaVersion: number
  readonly campaignId: string
  readonly buildHash: string
  readonly commit: string
  /** 0 for a fixed run. `null` for a real one, whose count is only known after it finishes. */
  readonly paidRequests: number | null
}

export function buildManifest(input: {
  stage: Stage
  mode: Mode
  identity: FreezeIdentity
}): EvidenceManifest {
  // The preflight blanks every real credential, so it has nothing to spend with: `real` would be a lie
  // about what ran. The P2 smoke, by contrast, really calls the models and really spends - it is kept
  // out of the formal gate by its *kind*, not by pretending to be fixed.
  if (input.stage === 'preflight' && input.mode !== 'fixed') throw Error('preflight-must-be-fixed')
  return {
    kind: `visual-focus-${input.stage}`,
    mode: input.mode,
    stage: input.stage,
    schemaVersion: 1,
    campaignId: input.identity.campaignId,
    buildHash: input.identity.buildHash,
    commit: input.identity.commit,
    paidRequests: input.mode === 'fixed' ? 0 : null,
  }
}

export interface ArtifactIndexEntry {
  readonly runId: string
  /** The run that owns the file: an artifact never belongs to the batch, only to one run. */
  readonly artifactId: string
  readonly type: string
  readonly sha256: string
  readonly bytes: number
  /** Relative to the artifact-index file, so the index survives the directory being moved. */
  readonly path: string
}

export function buildArtifactIndex(
  entries: readonly {
    runId: string
    artifactId: string
    type: string
    sha256: string
    bytes: number
    path: string
  }[],
  options: { base?: string } = {},
): ArtifactIndexEntry[] {
  const base = options.base ?? process.cwd()
  return entries.map((entry) => ({
    runId: entry.runId,
    artifactId: entry.artifactId,
    type: entry.type,
    sha256: entry.sha256,
    bytes: entry.bytes,
    path: isAbsolute(entry.path) ? relative(base, resolve(entry.path)) : entry.path,
  }))
}
