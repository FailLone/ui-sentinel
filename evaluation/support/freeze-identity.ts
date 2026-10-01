import { createHash } from 'node:crypto'

/**
 * The frozen identity a paid run is executed under (plan P3.2).
 *
 * A scoreboard is only comparable when everything that could change the answer is pinned at once:
 * the source commit, the whole build (not just the server bundle), the protocol descriptor, the
 * fixture revision and hash, the scorer and algorithm versions, the public target hash, the models and
 * providers, the feature profile and the budgets. Recording only a server bundle hash - which is what
 * the earlier phases did - would let a change in the arena, the scorer or the protocol slip past the
 * gate, so the identity names each of them and their combination.
 *
 * The protocol hash is over a canonical JSON of the descriptor, so a single moved knob produces a new
 * identity rather than reusing the old approval.
 */
export interface FreezeIdentity {
  readonly version: 1
  readonly commit: string
  readonly buildHash: string
  readonly buildFiles: Record<string, string>
  readonly protocolHash: string
  readonly protocol: FreezeProtocol
  readonly fixtureRevision: string
  readonly fixtureHash: string
  readonly scorerVersion: string
  readonly algorithmVersion: string
  readonly publicTargetHash: string
  readonly models: { readonly agent: string; readonly vision: string; readonly review: string }
  readonly providers: { readonly agent: string; readonly vision: string }
  readonly featureProfile: Record<string, string>
  readonly budgets: {
    readonly seconds: number
    readonly actions: number
    readonly modelCalls: number
  }
}

/** Everything that defines *this* protocol revision. Any change here is a new frozen identity. */
export interface FreezeProtocol {
  readonly algorithmVersion: string
  readonly focusWindowMs: number
  readonly maxProbeClicks: number
  readonly models: { readonly agent: string; readonly vision: string; readonly review: string }
  readonly providers: { readonly agent: string; readonly vision: string }
  readonly budgets: {
    readonly seconds: number
    readonly actions: number
    readonly modelCalls: number
  }
}

/** A stable stringify that sorts object keys at every depth, so nested knobs cannot change silently. */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export function protocolHash(protocol: FreezeProtocol): string {
  return createHash('sha256').update(canonicalize(protocol)).digest('hex')
}

/**
 * The public target hash: a hash of the *public* identity of the intended target, never its selector.
 *
 * It pins which node the cases are about without putting the private selector into a value that might
 * be compared, logged or shown; the witness comparison remains the mechanism that decides identity.
 */
export function publicTargetHash(target: { tag: string; type?: string; id?: string }): string {
  return createHash('sha256')
    .update(JSON.stringify([target.tag, target.type ?? 'text', target.id ?? '']))
    .digest('hex')
}

export function buildFreezeIdentity(input: {
  commit: string
  buildHash: string
  buildFiles: Record<string, string>
  protocol: FreezeProtocol
  fixtureRevision: string
  fixtureHash: string
  scorerVersion: string
  target: { tag: string; type?: string; id?: string }
}): FreezeIdentity {
  return {
    version: 1,
    commit: input.commit,
    buildHash: input.buildHash,
    buildFiles: input.buildFiles,
    protocolHash: protocolHash(input.protocol),
    protocol: input.protocol,
    fixtureRevision: input.fixtureRevision,
    fixtureHash: input.fixtureHash,
    scorerVersion: input.scorerVersion,
    algorithmVersion: input.protocol.algorithmVersion,
    publicTargetHash: publicTargetHash(input.target),
    models: input.protocol.models,
    providers: input.protocol.providers,
    featureProfile: {},
    budgets: input.protocol.budgets,
  }
}

export type FreezeMismatch =
  | 'commit'
  | 'build-hash'
  | 'protocol-hash'
  | 'fixture-revision'
  | 'fixture-hash'
  | 'scorer-version'
  | 'target-hash'
  | 'models'
  | 'providers'
  | 'budgets'

/**
 * Compare a candidate identity against the one the paid phase was frozen with.
 *
 * The paid phase must re-check this immediately before spending: an identity that moved between the
 * free plan and the paid run is a different experiment, and every mismatch is named so the reason is
 * legible rather than a single opaque refusal.
 */
export function validateFreeze(
  actual: FreezeIdentity,
  expected: FreezeIdentity,
): { ok: boolean; mismatches: readonly FreezeMismatch[] } {
  const mismatches: FreezeMismatch[] = []
  if (actual.commit !== expected.commit) mismatches.push('commit')
  if (actual.buildHash !== expected.buildHash) mismatches.push('build-hash')
  if (actual.protocolHash !== expected.protocolHash) mismatches.push('protocol-hash')
  if (actual.fixtureRevision !== expected.fixtureRevision) mismatches.push('fixture-revision')
  if (actual.fixtureHash !== expected.fixtureHash) mismatches.push('fixture-hash')
  if (actual.scorerVersion !== expected.scorerVersion) mismatches.push('scorer-version')
  if (actual.publicTargetHash !== expected.publicTargetHash) mismatches.push('target-hash')
  if (JSON.stringify(actual.models) !== JSON.stringify(expected.models)) mismatches.push('models')
  if (JSON.stringify(actual.providers) !== JSON.stringify(expected.providers))
    mismatches.push('providers')
  if (JSON.stringify(actual.budgets) !== JSON.stringify(expected.budgets))
    mismatches.push('budgets')
  return { ok: mismatches.length === 0, mismatches }
}
