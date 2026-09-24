import { buildContractSnapshot, LEGACY_ARENA_PROFILE, resolveProfile } from './registry.ts'
import { businessConfigSchema } from './schema.ts'
import { resolveEnvironment } from './environments.ts'
import type { BusinessContractSnapshot, BusinessProfileId } from './types.ts'

/**
 * One place that decides what a request's business contract is.
 *
 * The rules are deliberately layered so that no failure mode degrades into a default:
 *
 * 1. An environment must be registered. An unknown environment is refused outright; a profile
 *    can never widen the network boundary by naming a new origin.
 * 2. A profile/environment pair must be one the profile declares. Export cannot run against the
 *    shopping origin and checkout cannot run against the export origin.
 * 3. An explicitly requested profile must resolve exactly. Unknown id or revision is refused -
 *    never replaced by today's default.
 * 4. Only when the profile is *absent* does the legacy arena entry resolve to checkout@1. The
 *    default environment accepts no such fallback, because guessing a business there would
 *    fabricate a contract the caller never asked for.
 */
export type BusinessSelection =
  | {
      readonly kind: 'resolved'
      readonly contract: BusinessContractSnapshot
      /** True when the contract came from the legacy omitted-profile compatibility path. */
      readonly legacyDefault: boolean
    }
  | { readonly kind: 'unknown-environment'; readonly environmentId: string }
  | {
      readonly kind: 'environment-mismatch'
      readonly profileId: BusinessProfileId
      readonly environmentId: string
    }
  | { readonly kind: 'unknown-profile' }
  | { readonly kind: 'configuration-required'; readonly environmentId: string }

/** Re-exported so callers keep one import site for selection vocabulary. */
export { LEGACY_ARENA_PROFILE }

export function selectBusinessContract(input: {
  requested?: unknown
  environmentId: string
}): BusinessSelection {
  const environment = resolveEnvironment(input.environmentId)
  if (!environment) return { kind: 'unknown-environment', environmentId: input.environmentId }

  if (input.requested !== undefined && input.requested !== null) {
    // Strict: an unknown shape - extra keys, a non-string revision, a smuggled source or adapter
    // field - is an unknown profile, not something to coerce into a match.
    const parsed = businessConfigSchema.safeParse(input.requested)
    if (!parsed.success) return { kind: 'unknown-profile' }
    const profile = resolveProfile(parsed.data)
    if (!profile) return { kind: 'unknown-profile' }
    if (!profile.environments.includes(environment.id))
      return {
        kind: 'environment-mismatch',
        profileId: profile.id,
        environmentId: environment.id,
      }
    return {
      kind: 'resolved',
      contract: buildContractSnapshot(profile, environment.id),
      legacyDefault: false,
    }
  }

  // Omitted profile: only the legacy arena entry has a defined meaning.
  if (environment.id !== 'arena')
    return { kind: 'configuration-required', environmentId: environment.id }
  const profile = resolveProfile(LEGACY_ARENA_PROFILE)
  if (!profile) return { kind: 'unknown-profile' }
  return {
    kind: 'resolved',
    contract: buildContractSnapshot(profile, environment.id),
    legacyDefault: true,
  }
}

/** HTTP status and body for a refused selection. Invalid requests never reach the queue. */
export function selectionError(selection: Exclude<BusinessSelection, { kind: 'resolved' }>): {
  status: 400 | 503
  body: Record<string, unknown>
} {
  switch (selection.kind) {
    case 'unknown-environment':
      return {
        status: 400,
        body: {
          error: 'environment-not-allowed',
          message:
            'This build only operates on registered local environments; a caller cannot widen the network boundary.',
          environmentId: selection.environmentId,
        },
      }
    case 'environment-mismatch':
      return {
        status: 400,
        body: {
          error: 'business-environment-mismatch',
          message: 'The selected business profile is not registered for that environment.',
          profileId: selection.profileId,
          environmentId: selection.environmentId,
        },
      }
    case 'unknown-profile':
      return {
        status: 400,
        body: {
          error: 'invalid-request',
          message: 'Unknown business profile id or revision; no default is applied.',
        },
      }
    case 'configuration-required':
      return {
        status: 400,
        body: {
          error: 'business-profile-required',
          message:
            'The default environment requires an explicit businessProfile; the shopping business is not assumed.',
          environmentId: selection.environmentId,
        },
      }
  }
}

export type { BusinessSelection as Selection }
