import { createHash } from 'node:crypto'
import { z } from 'zod'
import { checkoutProfile, exportProfile } from './profiles/index.ts'
import { resolveEnvironment } from './environments.ts'
import type {
  BusinessContractSnapshot,
  BusinessEnvironmentId,
  BusinessProfile,
  BusinessProfileId,
  PublicBusinessProfile,
} from './types.ts'

/**
 * The registry is the only place a profile may be resolved from. Profiles are frozen at
 * registration, so a resolved contract cannot be mutated after it has been persisted.
 */
const registry: readonly BusinessProfile[] = Object.freeze([checkoutProfile, exportProfile])

export const profileIds = Object.freeze(registry.map((p) => p.id))

/** The single profile a legacy arena request - and a legacy run - is allowed to mean. */
export const LEGACY_ARENA_PROFILE = Object.freeze({ id: 'checkout', revision: '1' } as const)

export function registeredProfiles(): readonly BusinessProfile[] {
  return registry
}

export function resolveProfile(
  requested: { id: string; revision: string } | string | undefined,
): BusinessProfile | undefined {
  if (!requested || typeof requested === 'string') return undefined
  return registry.find((p) => p.id === requested.id && p.revision === requested.revision)
}

/**
 * Compatibility contract for a run persisted before contracts existed.
 *
 * Such a run has no versioned business: nothing about its requirements, thresholds or effects may
 * be invented from today's registry, and it must not be re-executed after a restart as though it
 * had been created under the current config. What it *does* have is the entry URL it was created
 * with, and that recorded URL is the only network boundary it may run against - so its environment
 * is taken from the run, not from the registry.
 *
 * This snapshot is built in memory for execution only. It is never persisted, so the run's stored
 * record - and therefore its report - stays honestly unversioned.
 */
export function legacyCompatibleContract(entryUrl: string): BusinessContractSnapshot {
  const profile = resolveProfile(LEGACY_ARENA_PROFILE)
  if (!profile) throw new Error('legacy-profile-unavailable')
  return bindProfile(profile, {
    id: 'default',
    entryUrl,
    publicOrigin: new URL(entryUrl).origin,
  })
}

/**
 * Freeze a profile against an explicit environment.
 *
 * The environment is supplied rather than looked up, so a caller can bind a profile to a boundary
 * it already holds - the entry URL a legacy run recorded, or a test fixture's own server. The
 * profile's own fields are copied, never invented, and the hash is recomputed so a snapshot always
 * describes itself honestly.
 */
export function bindProfile(
  profile: BusinessProfile,
  environment: { id: BusinessEnvironmentId; entryUrl: string; publicOrigin: string },
): BusinessContractSnapshot {
  const withoutHash = {
    schemaVersion: '1' as const,
    profileId: profile.id,
    revision: profile.revision,
    adapter: { id: profile.id, revision: profile.adapterRevision },
    requirements: profile.requirements,
    retryAvailabilityMs: profile.retryAvailabilityMs,
    feedbackWarningMs: profile.feedbackWarningMs,
    effects: profile.effects,
    environment,
  }
  return Object.freeze({
    ...withoutHash,
    hash: contractHash(withoutHash as unknown as Record<string, unknown>),
  }) as BusinessContractSnapshot
}

/**
 * Stable SHA-256 over the canonical snapshot, excluding the hash field itself.
 * Object keys are emitted in sorted order at every depth so key order cannot change the hash;
 * array order is preserved because requirement order is part of the contract.
 */
export function contractHash(snapshot: Record<string, unknown> | BusinessContractSnapshot): string {
  const { hash: _ignored, ...rest } = snapshot as Record<string, unknown>
  const canonical = (value: unknown): string => {
    if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return createHash('sha256').update(canonical(rest)).digest('hex')
}

export function requireEnvironment(profile: BusinessProfile, environmentId: string) {
  if (!profile.environments.includes(environmentId as never)) return undefined
  return resolveEnvironment(environmentId)
}

/**
 * Build the frozen snapshot persisted with a run. The caller must resolve the environment
 * first: a profile that is not registered for an environment has no valid snapshot.
 */
export function buildContractSnapshot(
  profile: BusinessProfile,
  environmentId: string = profile.defaultEnvironment,
): BusinessContractSnapshot {
  const environment = requireEnvironment(profile, environmentId)
  if (!environment) throw new Error('profile-not-registered-for-environment')
  return bindProfile(profile, environment)
}

/** Public projection. Deliberately omits ports, tokens, adapter internals and any answer key. */
export function listPublicProfiles(): readonly PublicBusinessProfile[] {
  return registry.map((profile) =>
    Object.freeze({
      id: profile.id,
      revision: profile.revision,
      name: profile.name,
      description: profile.description,
      requirements: profile.requirements,
      environments: profile.environments,
      defaultEnvironment: profile.defaultEnvironment,
    }),
  )
}

const requestedSchema = z.object({ id: z.string().min(1), revision: z.string().min(1) }).strict()

export type RequestedProfile =
  | { readonly kind: 'absent' }
  | { readonly kind: 'unknown' }
  | { readonly kind: 'resolved'; readonly profile: BusinessProfile }

/**
 * Interpret an optional businessProfile field. An absent field is not the same as an unknown
 * one: the caller decides the legacy fallback for absent, but an explicit unknown id or
 * revision must never silently degrade to a default.
 */
export function parseRequestedProfile(value: unknown): RequestedProfile {
  if (value === undefined || value === null) return { kind: 'absent' }
  const parsed = requestedSchema.safeParse(value)
  if (!parsed.success) return { kind: 'unknown' }
  const profile = resolveProfile(parsed.data)
  return profile ? { kind: 'resolved', profile } : { kind: 'unknown' }
}

export function profileRevisionKey(id: BusinessProfileId, revision: string): string {
  return `${id}@${revision}`
}
