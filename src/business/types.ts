/**
 * Business contract vocabulary.
 *
 * A profile describes one business in terms of public, versioned facts: the public
 * requirements an inspection must respect, the operation limits it must obey, and the
 * environment it may run in. No profile may carry source code, private endpoints, control
 * tokens, evaluation answers, or model-supplied paths.
 */

export const businessProfileIds = ['checkout', 'export'] as const
export type BusinessProfileId = (typeof businessProfileIds)[number]

export const businessEnvironmentIds = ['default', 'arena', 'export-arena'] as const
export type BusinessEnvironmentId = (typeof businessEnvironmentIds)[number]

/** A public requirement is a statement the agent can verify against observable behaviour. */
export interface BusinessRequirement {
  readonly id: string
  readonly revision: string
  readonly text: string
  readonly source: { readonly kind: 'project-config'; readonly ref: string }
}

/**
 * Side-effect budget for one business operation.
 *
 * `maxCreates` counts entity-creating requests; `maxRetriesPerOperation` counts explicitly
 * eligible retries of one already-created entity. Both are reserved before dispatch.
 */
export interface BusinessEffects {
  readonly maxCreates: number
  readonly maxRetriesPerOperation: number
}

/** A profile as registered in trusted code. Frozen at registration. */
export interface BusinessProfile {
  readonly id: BusinessProfileId
  readonly revision: string
  readonly name: string
  readonly description: string
  readonly adapterRevision: string
  readonly requirements: readonly BusinessRequirement[]
  readonly retryAvailabilityMs: number
  readonly feedbackWarningMs: number
  readonly effects: BusinessEffects
  readonly environments: readonly BusinessEnvironmentId[]
  readonly defaultEnvironment: BusinessEnvironmentId
  readonly entryPath: string
  readonly prepareWrites: readonly PublicRoute[]
}

/** A read/prepare/create route declared by a profile. Matching is origin+method+path. */
export interface PublicRoute {
  readonly method: string
  readonly path: string
}

/** The persisted, immutable record of the configuration a run was created with. */
export interface BusinessContractSnapshot {
  readonly schemaVersion: '1'
  readonly profileId: BusinessProfileId
  readonly revision: string
  readonly adapter: { readonly id: BusinessProfileId; readonly revision: string }
  readonly requirements: readonly BusinessRequirement[]
  readonly retryAvailabilityMs: number
  readonly feedbackWarningMs: number
  readonly effects: BusinessEffects
  readonly environment: {
    readonly id: BusinessEnvironmentId
    readonly entryUrl: string
    readonly publicOrigin: string
  }
  readonly hash: string
}

/** Public projection served by GET /api/business-profiles. Never private data. */
export interface PublicBusinessProfile {
  readonly id: BusinessProfileId
  readonly revision: string
  readonly name: string
  readonly description: string
  readonly requirements: readonly BusinessRequirement[]
  readonly environments: readonly BusinessEnvironmentId[]
  readonly defaultEnvironment: BusinessEnvironmentId
}
