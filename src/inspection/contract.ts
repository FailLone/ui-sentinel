import {
  UI_SAMPLING_POLICY,
  UI_SAMPLING_POLICY_V2,
  UI_CHECK_POLICY,
  validCheckPolicy,
  type UiCheckPolicy,
  validSamplingPolicy,
  type UiSamplingPolicy,
} from '../shared/ui-sampling-policy.ts'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { classifyHost, isPrivateAddress, parseEntryUrl, type EntryUrlReason } from './url.ts'
import { interactionVerificationInput } from '../execution/interaction-verification.ts'
import { UI_DEFAULT_GOAL } from '../shared/ui-goal.ts'

/**
 * The frozen contract of a `ui-scan` run (plan 3.1, 5.1).
 *
 * A UI run is a discriminated alternative to a business run, not a business run with the profile
 * filed off. It therefore has its own contract type, its own hash and its own permission set:
 * `businessWrites: 'none'` is a statement about what the executor will refuse, and it is part of the
 * hash so no later request can widen it without producing a different contract.
 *
 * The hash excludes only the `hash` field itself, mirroring how the business snapshot hashes its own
 * content. The business hash algorithm is untouched by this module.
 */

export const UI_CONTRACT_SCHEMA_VERSION = '1' as const
export const UI_POLICY_REVISION = 'url-scan-1' as const
export const UI_REQUIRED_SCOPE_REVISION = 'url-scan-scope-2' as const
export const UI_DEFAULT_SCOPE_REVISION = 'url-scan-default-3' as const
export const UI_CHECK_SCOPE_REVISION = 'url-scan-default-4' as const

/** Plan 1.1: at most three unique routed pages, at most one level from the entry. */
export const UI_MAX_PAGES = 3
export const UI_MAX_DEPTH = 1
/** Plan 4.1: at most 8 exact resource origins and 4 exact read-only data origins. */
export const UI_MAX_RESOURCE_ORIGINS = 8
export const UI_MAX_DATA_ORIGINS = 4
/** Plan 5.1: the UI budget may only narrow the shared API maximum. */
export const UI_MAX_TIMEOUT_MS = 300_000
export const UI_MAX_ACTIONS = 40
export const UI_MAX_MODEL_CALLS = 60
export const UI_GOAL_MAX_LENGTH = 2000

export { UI_DEFAULT_GOAL } from '../shared/ui-goal.ts'

/** A capability the UI contract declares it does not have; reported, never silently absent. */
export const UI_UNSUPPORTED_CAPABILITIES = [
  'authenticated-session',
  'business-write',
  'post-data-query',
  'graphql-post',
  'file-upload',
  'file-download',
  'new-window',
  'websocket',
  'service-worker',
] as const

export const UI_AVAILABLE_CAPABILITIES = [
  'entry-observation',
  'automatic-rules',
  'local-interaction',
  'bounded-navigation',
  'dom-investigation',
  'temporal-investigation',
  'get-data-request',
] as const

/** Exact-origin list: no wildcard, no suffix match, no bare host. */
const exactOrigin = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => {
    // `new URL` happily parses `https://*.example.org`, so the wildcard is refused by name rather
    // than trusted to produce a parse error (plan 1.1: no `*` and no domain-suffix widening).
    if (value.includes('*')) return false
    try {
      const url = new URL(value)
      return (
        /^https?:$/.test(url.protocol) &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password &&
        url.origin === value
      )
    } catch {
      return false
    }
  }, 'Expected an exact origin such as https://cdn.example.org')

/** Caller-owned public requirements, frozen before queueing; never supplied by the page/model. */
export const requiredCheckInput = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/),
    description: z.string().trim().min(1).max(1000),
    selector: z.string().trim().min(1).max(500),
    action: z.enum(['click', 'fill', 'link']),
    value: z.string().max(1000).optional(),
    verify: interactionVerificationInput.optional(),
  })
  .strict()
  .superRefine((check, ctx) => {
    const issue = (field: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [field], message })
    if (check.action !== 'link' && !check.verify)
      issue('verify', 'Local required checks need a public postcondition')
    if (check.action === 'link' && check.verify)
      issue('verify', 'Links use the existing actual-click navigation proof')
    if (check.action === 'fill' && check.value === undefined)
      issue('value', 'Required fill needs an explicit value')
    if (check.action !== 'fill' && check.value !== undefined)
      issue('value', 'Only fill accepts value')
    if (
      check.verify &&
      !['visible', 'numeric-ascending', 'numeric-descending'].includes(check.verify.condition) &&
      check.verify.expected === undefined
    )
      issue('verify.expected', 'This postcondition needs expected')
  })
export type RequiredCheck = z.infer<typeof requiredCheckInput>
const requiredChecksInput = z
  .array(requiredCheckInput)
  .max(12)
  .refine(
    (checks) => new Set(checks.map((c) => c.id)).size === checks.length,
    'Required check ids must be unique',
  )

export const uiScanRequestSchema = z
  .object({
    kind: z.literal('ui-scan'),
    entryUrl: z.string().min(1).max(4096),
    goal: z.string().max(UI_GOAL_MAX_LENGTH).optional(),
    requiredChecks: requiredChecksInput.optional(),
    scope: z
      .object({
        maxPages: z.number().int().min(1).max(UI_MAX_PAGES).optional(),
        maxDepth: z.number().int().min(0).max(UI_MAX_DEPTH).optional(),
      })
      .strict()
      .optional(),
    access: z
      .object({
        resourceOrigins: z.array(exactOrigin).max(UI_MAX_RESOURCE_ORIGINS).optional(),
        dataOrigins: z.array(exactOrigin).max(UI_MAX_DATA_ORIGINS).optional(),
      })
      .strict()
      .optional(),
    budget: z
      .object({
        totalTimeoutMs: z.number().int().positive().max(UI_MAX_TIMEOUT_MS).optional(),
        maxActions: z.number().int().positive().max(UI_MAX_ACTIONS).optional(),
        maxModelCalls: z.number().int().positive().max(UI_MAX_MODEL_CALLS).optional(),
      })
      .strict()
      .optional(),
    viewport: z
      .object({
        width: z.number().int().min(320).max(2560),
        height: z.number().int().min(240).max(2160),
      })
      .strict()
      .optional(),
  })
  .strict()

export type UiScanRequest = z.infer<typeof uiScanRequestSchema>

export interface UiContractSnapshot {
  readonly schemaVersion: typeof UI_CONTRACT_SCHEMA_VERSION
  readonly policyRevision:
    | typeof UI_POLICY_REVISION
    | typeof UI_REQUIRED_SCOPE_REVISION
    | typeof UI_DEFAULT_SCOPE_REVISION
    | typeof UI_CHECK_SCOPE_REVISION
  readonly samplingPolicy?: UiSamplingPolicy
  readonly checkPolicy?: UiCheckPolicy
  /** The address as submitted, including path, query order and fragment. */
  readonly entryUrl: string
  readonly origin: string
  /** The workbench or API input as typed; display only, never a page identity. */
  readonly requestedUrl: string
  readonly requestedGoal?: string
  readonly goal: string
  readonly goalSource: 'user' | 'default'
  /** Advanced additive public checks; historical scope-2 snapshots retain their original meaning. */
  readonly requiredChecks?: readonly RequiredCheck[]
  readonly session: 'anonymous'
  readonly scope: { readonly maxPages: number; readonly maxDepth: number }
  readonly access: {
    readonly resourceOrigins: readonly string[]
    readonly dataOrigins: readonly string[]
  }
  readonly budget: {
    readonly totalTimeoutMs: number
    readonly maxActions: number
    readonly maxModelCalls: number
  }
  readonly businessWrites: 'none'
  readonly availableCapabilities: readonly string[]
  readonly unsupportedCapabilities: readonly string[]
  readonly hash: string
}

export type UiContractReason = EntryUrlReason | 'resource-origin-refused' | 'private-address'

export type UiContractResolution =
  | { readonly kind: 'resolved'; readonly contract: UiContractSnapshot }
  | {
      readonly kind: 'refused'
      readonly reasonCode: UiContractReason
      readonly message: string
      readonly field: string
    }

export interface UiContractContext {
  /** Server-configured exact origins allowed to be private (local fixtures/dev). */
  readonly reachableOrigins: readonly string[]
  /** Injected so the resolver stays pure and testable; production passes `dns.lookup`. */
  readonly resolveAddress?: (host: string) => string | null
}

const REFUSAL_MESSAGES: Record<string, string> = {
  'url-not-absolute': 'Enter an absolute URL including the scheme.',
  'url-malformed': 'The URL could not be parsed.',
  'unsupported-scheme': 'Only http and https addresses are supported.',
  'url-has-credentials': 'Credentials in the URL are not accepted; this run is anonymous.',
  'url-encoding-invalid': 'The URL path contains an invalid percent escape.',
  'control-surface': 'The service control and evaluation surface is not a scannable destination.',
  'private-address':
    'This release scans public addresses; private, loopback and metadata destinations are refused.',
  'resource-origin-refused': 'A declared origin must be an exact http(s) origin.',
}

function refusal(reasonCode: UiContractReason, field: string): UiContractResolution {
  return {
    kind: 'refused',
    reasonCode,
    message: REFUSAL_MESSAGES[reasonCode] ?? 'The request was refused.',
    field,
  }
}

/** Deterministic JSON so a snapshot hash does not depend on key insertion order. */
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

export function buildUiContractSnapshot(input: {
  entryUrl: string
  requestedUrl?: string
  origin: string
  goal?: string
  requestedGoal?: string
  goalSource?: 'user' | 'default'
  requiredChecks?: readonly RequiredCheck[]
  samplingPolicy?: UiSamplingPolicy
  scope: UiContractSnapshot['scope']
  access: UiContractSnapshot['access']
  budget: UiContractSnapshot['budget']
}): UiContractSnapshot {
  const goal = input.goal?.trim() ? input.goal.trim() : UI_DEFAULT_GOAL
  const body = {
    schemaVersion: UI_CONTRACT_SCHEMA_VERSION,
    policyRevision: input.samplingPolicy
      ? input.samplingPolicy.revision === 'bounded-ui-sampling-2'
        ? UI_CHECK_SCOPE_REVISION
        : UI_DEFAULT_SCOPE_REVISION
      : input.requiredChecks === undefined
        ? UI_POLICY_REVISION
        : UI_REQUIRED_SCOPE_REVISION,
    ...(input.samplingPolicy ? { samplingPolicy: { ...input.samplingPolicy } } : {}),
    ...(input.samplingPolicy?.revision === 'bounded-ui-sampling-2'
      ? { checkPolicy: structuredClone(UI_CHECK_POLICY) }
      : {}),
    entryUrl: input.entryUrl,
    requestedUrl: input.requestedUrl ?? input.entryUrl,
    origin: input.origin,
    goal,
    ...(input.samplingPolicy?.revision === 'bounded-ui-sampling-2'
      ? { requestedGoal: input.requestedGoal ?? input.goal ?? '' }
      : {}),
    goalSource: input.goal?.trim() ? (input.goalSource ?? 'user') : ('default' as const),
    ...(input.requiredChecks === undefined
      ? {}
      : { requiredChecks: structuredClone(input.requiredChecks) }),
    session: 'anonymous' as const,
    scope: input.scope,
    access: {
      resourceOrigins: [...input.access.resourceOrigins],
      dataOrigins: [...input.access.dataOrigins],
    },
    budget: input.budget,
    businessWrites: 'none' as const,
    availableCapabilities: [...UI_AVAILABLE_CAPABILITIES],
    unsupportedCapabilities: [...UI_UNSUPPORTED_CAPABILITIES],
  }
  return {
    ...body,
    hash: createHash('sha256').update(canonical(body)).digest('hex'),
  }
}

export function verifyUiContractSnapshot(snapshot: UiContractSnapshot): boolean {
  if (
    !snapshot ||
    typeof snapshot !== 'object' ||
    snapshot.schemaVersion !== '1' ||
    !['url-scan-1', 'url-scan-scope-2', 'url-scan-default-3', 'url-scan-default-4'].includes(
      snapshot.policyRevision,
    )
  )
    return false
  if (
    snapshot.samplingPolicy !== undefined &&
    (!validSamplingPolicy(snapshot.samplingPolicy) ||
      ![UI_DEFAULT_SCOPE_REVISION, UI_CHECK_SCOPE_REVISION].includes(
        snapshot.policyRevision as any,
      ))
  )
    return false
  if (snapshot.policyRevision === UI_DEFAULT_SCOPE_REVISION && !snapshot.samplingPolicy)
    return false
  if (snapshot.policyRevision === UI_CHECK_SCOPE_REVISION) {
    if (
      snapshot.samplingPolicy?.revision !== 'bounded-ui-sampling-2' ||
      !validCheckPolicy(snapshot.checkPolicy)
    )
      return false
  } else if (
    snapshot.checkPolicy !== undefined ||
    snapshot.samplingPolicy?.revision === 'bounded-ui-sampling-2'
  )
    return false
  const { hash, ...body } = snapshot
  if (typeof hash !== 'string') return false
  const expected = createHash('sha256').update(canonical(body)).digest('hex')
  return expected === hash
}

/**
 * Resolve one `ui-scan` request into its frozen contract, or a structured refusal.
 *
 * Refusals happen here rather than in the executor so that an invalid request never reaches the
 * queue and never starts a browser, matching how an invalid business selection is handled.
 */
export function resolveUiScanContract(
  request: unknown,
  context: UiContractContext,
): UiContractResolution {
  const parsed = uiScanRequestSchema.safeParse(request)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path.join('.') || 'request'
    if (field === 'entryUrl') {
      // The field is syntactically a string; the specific URL reason is more useful than "invalid".
      const raw = (request as { entryUrl?: unknown })?.entryUrl
      if (typeof raw === 'string') {
        const url = parseEntryUrl(raw)
        if (!url.ok) return refusal(url.reasonCode, 'entryUrl')
      }
      return refusal('url-malformed', 'entryUrl')
    }
    if (field.startsWith('access.'))
      return {
        kind: 'refused',
        reasonCode: 'resource-origin-refused',
        message: `${REFUSAL_MESSAGES['resource-origin-refused']} (${field})`,
        field,
      }
    return {
      kind: 'refused',
      reasonCode: 'url-malformed',
      message: issue?.message ?? 'The request was refused.',
      field,
    }
  }
  const data = parsed.data
  const parsedUrl = parseEntryUrl(data.entryUrl)
  if (!parsedUrl.ok) return refusal(parsedUrl.reasonCode, 'entryUrl')
  const url = parsedUrl.url

  const reachable = new Set(context.reachableOrigins)
  if (!reachable.has(url.origin)) {
    if (classifyHost(url.hostname) === 'private-literal')
      return refusal('private-address', 'entryUrl')
    const resolved = context.resolveAddress?.(url.hostname) ?? null
    // A name that resolves into a private range is refused before the queue, and the address is
    // re-checked at connect time; creation is not the only place this is decided (plan 4.3).
    if (resolved && isPrivateAddress(resolved)) return refusal('private-address', 'entryUrl')
  }

  const scope = {
    maxPages: data.scope?.maxPages ?? UI_MAX_PAGES,
    maxDepth: data.scope?.maxDepth ?? UI_MAX_DEPTH,
  }
  const access = {
    resourceOrigins: data.access?.resourceOrigins ?? [],
    dataOrigins: data.access?.dataOrigins ?? [],
  }
  const budget = {
    totalTimeoutMs: data.budget?.totalTimeoutMs ?? 300_000,
    maxActions: data.budget?.maxActions ?? 20,
    maxModelCalls: data.budget?.maxModelCalls ?? 30,
  }
  return {
    kind: 'resolved',
    contract: buildUiContractSnapshot({
      entryUrl: url.href,
      requestedUrl: data.entryUrl,
      origin: url.origin,
      goal: data.goal,
      requiredChecks: data.requiredChecks,
      samplingPolicy: UI_SAMPLING_POLICY_V2,
      requestedGoal: typeof (request as any)?.goal === 'string' ? (request as any).goal : '',
      scope,
      access,
      budget,
    }),
  }
}

export { sameOrigin } from './url.ts'
