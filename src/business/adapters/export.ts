import type {
  BusinessAdapter,
  BusinessFact,
  Correlation,
  PublicExchange,
  RequestIntent,
  RequestShape,
  RetainedResource,
} from './types.ts'

/**
 * Dataset-export public protocol.
 *
 * Distinct from shopping on purpose: the response carries `jobId`, `phase`, `attempt`, `version`
 * and a `retry` decision object, and this adapter emits no shopping compatibility field. Async
 * terminal state is reached through a *read* status query, so `decodeResponse` accepts the status
 * GET as well as the create POST.
 */
const COLLECTION_PATH = '/api/exports'

interface ExportBody {
  jobId?: string
  attempt?: number
  version?: number
  phase?: string
  notice?: string
  retry?: {
    permitted?: boolean
    remaining?: number
    afterMs?: number
    prerequisitesMet?: boolean
  } | null
}

/** Match `/api/exports` and `/api/exports/:jobId(/retry|/eligibility)?`, returning segments. */
function matchExportPath(url: string): {
  segments: string[]
  jobFromPath: string | null
  isRetry: boolean
  isEligibility: boolean
} | null {
  let path: string
  try {
    path = new URL(url).pathname
  } catch {
    return null
  }
  if (path !== COLLECTION_PATH && !path.startsWith(`${COLLECTION_PATH}/`)) return null
  const segments = path.split('/').filter(Boolean)
  if (segments[0] !== 'api' || segments[1] !== 'exports') return null
  if (
    segments.length > 4 ||
    (segments.length === 4 && !['retry', 'eligibility'].includes(segments[3]!))
  )
    return null
  const jobFromPath = segments[2] ?? null
  return {
    segments,
    jobFromPath,
    isRetry: segments[3] === 'retry',
    isEligibility: segments[3] === 'eligibility',
  }
}

export const exportAdapter: BusinessAdapter = Object.freeze({
  id: 'export' as const,
  revision: '1',

  downloadOperation(request: RequestShape): string | null {
    if (request.method.toUpperCase() !== 'GET') return null
    try {
      const url = new URL(request.url)
      if (url.search || url.origin !== request.origin) return null
      return /^\/api\/exports\/([A-Za-z0-9_-]+)\/download$/.exec(url.pathname)?.[1] ?? null
    } catch {
      return null
    }
  },

  classifyRequest(request: RequestShape): RequestIntent {
    const match = matchExportPath(request.url)
    if (!match) return { kind: 'foreign' }
    const method = request.method.toUpperCase()
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return { kind: 'read' }
    if (method === 'POST') {
      // A retry is addressed at one existing entity. Treating it as a create would let a profile
      // with a retry allowance be satisfied by silently creating a second export job.
      if (match.isRetry && match.jobFromPath)
        return { kind: 'retry', operationPath: match.jobFromPath }
      if (!match.jobFromPath) return { kind: 'create' }
    }
    return { kind: 'other-write' }
  },

  decodeResponse(exchange: PublicExchange): BusinessFact | null {
    if (exchange.bodyReadFailed || exchange.bodyText === null) return null
    if (exchange.request.origin !== exchange.allowedOrigin) return null
    const match = matchExportPath(exchange.request.url)
    if (!match) return null
    const method = exchange.request.method.toUpperCase()
    const isStatusRead = method === 'GET' && match.segments.length === 3
    const isMutation = method === 'POST' && (match.segments.length === 2 || match.isRetry)
    if (
      (!isStatusRead && !isMutation) ||
      exchange.request.statusCode < 200 ||
      exchange.request.statusCode >= 300
    )
      return null
    const body = exchange.request.body as ExportBody | null
    if (!body || typeof body !== 'object') return null
    const phase = String(body.phase ?? '')
    if (!['processing', 'succeeded', 'rejected', 'failed'].includes(phase)) return null
    // A mutation response must carry the entity's own id; a status read may identify it from the
    // path it queried, but only when the response agrees or is silent about the id.
    const jobId = typeof body.jobId === 'string' && body.jobId ? body.jobId : match.jobFromPath
    if (!jobId) return null
    if (
      typeof body.jobId === 'string' &&
      body.jobId &&
      match.jobFromPath &&
      body.jobId !== match.jobFromPath
    )
      return null
    if (!Number.isInteger(body.attempt) || (body.attempt as number) < 0) return null
    if (!Number.isInteger(body.version) || (body.version as number) < 0) return null
    return buildExportFact(body, jobId, phase as BusinessFact['phase'])
  },

  correlateVisible(
    fact: BusinessFact,
    observation: { readonly pageText: string; readonly visibleText: readonly string[] },
  ): Correlation {
    const text = observation.pageText.replace(/\s+/g, ' ')
    // The page must show this job's identity. A bare "success" fragment, a different job's notice
    // or a page with no notice at all cannot confirm the outcome of this operation.
    if (!text.includes(fact.operationId)) return { kind: 'absent' }
    if (!fact.notice) return { kind: 'unknown', reason: 'adapter-declared-no-notice' }
    if (!text.includes(fact.notice.replace(/\s+/g, ' ')))
      return { kind: 'contradicted', reason: 'notice-not-visible' }
    return { kind: 'confirmed', operationId: fact.operationId, evidenceRefs: [] }
  },

  /**
   * The recovery eligibility resource, retained as the run's own evidence.
   *
   * The workspace asks the server for this before drawing a recovery control, and it is the only
   * public source that separates E1 from E2: both publish the same failure payload with
   * `retry.permitted` and `prerequisitesMet` true, while this resource alone states that the
   * workspace's prerequisite is unmet even though the backend permits the retry. Without it the
   * E2 finding has no independent basis beyond the disabled control on one screenshot.
   */
  retainResource(exchange: PublicExchange): RetainedResource | null {
    if (exchange.bodyReadFailed || exchange.bodyText === null) return null
    if (exchange.request.origin !== exchange.allowedOrigin) return null
    const match = matchExportPath(exchange.request.url)
    if (!match || !match.isEligibility || !match.jobFromPath) return null
    if (exchange.request.method.toUpperCase() !== 'GET') return null
    const body = exchange.request.body
    if (!body || typeof body !== 'object') return null
    const prerequisite = (body as { prerequisite?: unknown }).prerequisite
    // The schema is the recognition, not the path alone: a job status read shares the collection
    // prefix, and a document that merely happens to come from this path states no prerequisite.
    if (!prerequisite || typeof prerequisite !== 'object') return null
    const named = (body as { jobId?: unknown }).jobId
    // The resource must describe the entity the path addressed, matching the same rule the fact
    // path uses: a response naming a different job is not evidence about the one that was queried.
    if (typeof named === 'string' && named && named !== match.jobFromPath) return null
    return { kind: 'recovery-eligibility', operationId: match.jobFromPath, value: body }
  },
})

function buildExportFact(
  body: ExportBody,
  jobId: string,
  phase: BusinessFact['phase'],
): BusinessFact {
  const retry = body.retry ?? null
  // Eligibility is only `allowed` when the public decision says so. Anything else is denied or,
  // when the decision is simply absent, unknown - never assumed.
  const retryEligibility: BusinessFact['retryEligibility'] =
    retry === null
      ? 'unknown'
      : retry.permitted === true &&
          retry.prerequisitesMet === true &&
          Number(retry.remaining ?? 0) > 0 &&
          Number(retry.afterMs ?? 0) <= 0
        ? 'allowed'
        : 'denied'
  return {
    schemaVersion: '1',
    profileId: 'export',
    contractHash: '',
    operationId: jobId,
    attempt: body.attempt as number,
    version: body.version as number,
    phase,
    result: phase === 'succeeded' ? 'success' : phase === 'rejected' ? 'rejected' : 'unknown',
    retryEligibility,
    notice: typeof body.notice === 'string' ? body.notice : null,
    retry:
      retry === null
        ? null
        : {
            permitted: retry.permitted === true,
            remaining: Number(retry.remaining ?? 0),
            afterMs: Number(retry.afterMs ?? 0),
            prerequisitesMet: retry.prerequisitesMet === true,
          },
    sourceEventId: null,
    evidenceRefs: [],
    observedAt: new Date().toISOString(),
  }
}
