import { describe, it, expect } from 'vitest'
import { checkoutAdapter } from './adapters/checkout.ts'
import { exportAdapter } from './adapters/export.ts'
import { decodeFact } from './adapters/codec.ts'
import { registeredAdapters } from './adapters/index.ts'
import { buildContractSnapshot, resolveProfile } from './registry.ts'
import {
  concludeBusinessResult,
  factOrderKey,
  operationKey,
  retryVerdict,
  verifyContractSnapshot,
  createBusinessRuntime,
  AdapterUnavailableError,
} from './runtime.ts'
import type { BusinessFact, PublicExchange } from './adapters/types.ts'

const checkout = buildContractSnapshot(resolveProfile({ id: 'checkout', revision: '1' })!)
const exportContract = buildContractSnapshot(resolveProfile({ id: 'export', revision: '1' })!)

const exchange = (
  url: string,
  method: string,
  body: unknown,
  overrides: Partial<PublicExchange> = {},
): PublicExchange => ({
  request: { url, method, body, statusCode: 200, origin: new URL(url).origin },
  allowedOrigin: new URL(url).origin,
  bodyText: JSON.stringify(body ?? null),
  bodyReadFailed: false,
  ...overrides,
})

describe('checkout adapter (B01)', () => {
  it('keeps the original shopping verdicts for success, rejection and retryable failure', () => {
    const success = checkoutAdapter.decodeResponse(
      exchange('http://localhost:4173/api/checkout', 'POST', {
        success: true,
        status: 'success',
        orderId: 'order-1',
        message: 'Order confirmed',
      }),
    )!
    expect(success).toMatchObject({
      operationId: 'order-1',
      attempt: 0,
      phase: 'succeeded',
      result: 'success',
      profileId: 'checkout',
      retryEligibility: 'denied',
    })

    const rejected = checkoutAdapter.decodeResponse(
      exchange('http://localhost:4173/api/checkout', 'POST', {
        success: false,
        status: 'rejected',
        orderId: 'order-2',
        message: 'Card declined',
      }),
    )!
    expect(rejected).toMatchObject({ phase: 'rejected', result: 'rejected' })

    const failed = checkoutAdapter.decodeResponse(
      exchange('http://localhost:4173/api/checkout', 'POST', {
        success: false,
        status: 'failed',
        orderId: 'order-3',
        message: 'Payment processing failed',
        canRetry: true,
      }),
    )!
    expect(failed).toMatchObject({
      phase: 'failed',
      result: 'unknown',
      retryEligibility: 'allowed',
      retry: { permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: true },
    })
  })

  it('classifies cart writes as prepare and checkout as create, and only by origin+method+path', () => {
    const at = (path: string, method = 'POST') =>
      checkoutAdapter.classifyRequest({
        url: `http://localhost:4173${path}`,
        method,
        origin: 'http://localhost:4173',
      })
    expect(at('/api/checkout')).toEqual({ kind: 'create' })
    expect(at('/api/cart/add')).toEqual({ kind: 'prepare' })
    expect(at('/api/cart/remove')).toEqual({ kind: 'prepare' })
    expect(at('/api/checkout', 'GET')).toEqual({ kind: 'read' })
    expect(at('/api/orders')).toEqual({ kind: 'other-write' })
    expect(
      checkoutAdapter.classifyRequest({ url: 'not a url', method: 'POST', origin: '' }),
    ).toEqual({
      kind: 'foreign',
    })
  })
})

describe('export adapter (B02, B03)', () => {
  it('does not conclude success from the 202 that only starts the job', () => {
    const created = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports', 'POST', {
        jobId: 'job-abc',
        attempt: 0,
        version: 1,
        phase: 'processing',
        notice: 'Export started.',
      }),
    )!
    expect(created).toMatchObject({
      operationId: 'job-abc',
      attempt: 0,
      phase: 'processing',
      result: 'unknown',
    })
    expect(concludeBusinessResult([created])).toBe('unknown')
  })

  it('concludes success only from the correlated terminal status read', () => {
    const created = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports', 'POST', {
        jobId: 'job-abc',
        attempt: 0,
        version: 1,
        phase: 'processing',
        notice: 'Export started.',
      }),
    )!
    const done = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-abc', 'GET', {
        jobId: 'job-abc',
        attempt: 0,
        version: 2,
        phase: 'succeeded',
        notice: 'Export ready.',
      }),
    )!
    expect(done).toMatchObject({ phase: 'succeeded', result: 'success', version: 2 })
    expect(concludeBusinessResult([created, done])).toBe('success')
  })

  it('separates an eligible failure from a justified rejection', () => {
    const failed = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-1', 'GET', {
        jobId: 'job-1',
        attempt: 0,
        version: 2,
        phase: 'failed',
        notice: 'Export could not complete. You may try again.',
        retry: { permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: true },
      }),
    )!
    expect(failed).toMatchObject({ result: 'unknown', retryEligibility: 'allowed' })
    expect(retryVerdict(failed, exportContract)).toMatchObject({ eligible: true, attempt: 1 })

    const rejected = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-2', 'GET', {
        jobId: 'job-2',
        attempt: 0,
        version: 2,
        phase: 'rejected',
        notice: 'Export rejected: quota exhausted for this dataset.',
        retry: { permitted: false, remaining: 0, afterMs: 0, prerequisitesMet: true },
      }),
    )!
    expect(rejected).toMatchObject({ result: 'rejected', retryEligibility: 'denied' })
    expect(retryVerdict(rejected, exportContract)).toMatchObject({ eligible: false })
    // A rejection must never be graded as the same outcome as a recoverable failure.
    expect(rejected.result).not.toBe(failed.result)
  })

  it('classifies the retry route as a retry of one entity, never as a second create', () => {
    const at = (path: string) =>
      exportAdapter.classifyRequest({
        url: `http://localhost:4183${path}`,
        method: 'POST',
        origin: 'http://localhost:4183',
      })
    expect(at('/api/exports')).toEqual({ kind: 'create' })
    expect(at('/api/exports/job-1/retry')).toEqual({ kind: 'retry', operationPath: 'job-1' })
    expect(at('/api/exports/job-1')).toEqual({ kind: 'other-write' })
    expect(
      exportAdapter.classifyRequest({
        url: 'http://localhost:4183/api/exports/job-1',
        method: 'GET',
        origin: 'http://localhost:4183',
      }),
    ).toEqual({ kind: 'read' })
  })

  it('never emits a shopping compatibility field', () => {
    const fact = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports', 'POST', {
        jobId: 'job-x',
        attempt: 0,
        version: 1,
        phase: 'processing',
        notice: 'Export started.',
      }),
    )!
    expect(JSON.stringify(fact)).not.toContain('orderId')
    expect(fact.profileId).toBe('export')
  })
})

describe('fact integrity (B04, B05)', () => {
  it('ignores a non-business URL that happens to return success and an order id', () => {
    for (const url of [
      'http://localhost:4173/api/telemetry',
      'http://localhost:4173/health',
      'http://other.example/api/checkout',
      'http://localhost:4173/api/exports-metrics',
    ]) {
      // The run's business origin is the arena; a same-shaped body elsewhere is not its fact.
      expect(
        checkoutAdapter.decodeResponse(
          exchange(
            url,
            'POST',
            { success: true, orderId: 'order-9' },
            {
              allowedOrigin: 'http://localhost:4173',
            },
          ),
        ),
      ).toBeNull()
    }
  })

  it('ignores another job succeeding while this job is processing', () => {
    const mine = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-mine', 'GET', {
        jobId: 'job-mine',
        attempt: 0,
        version: 2,
        phase: 'processing',
        notice: 'Working.',
      }),
    )!
    const theirs = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-theirs', 'GET', {
        jobId: 'job-theirs',
        attempt: 0,
        version: 2,
        phase: 'succeeded',
        notice: 'Ready.',
      }),
    )!
    // Only facts whose identity is this operation may be considered.
    expect(concludeBusinessResult([mine])).toBe('unknown')
    expect([mine, theirs].map((f) => f.operationId)).toEqual(['job-mine', 'job-theirs'])
    expect(factOrderKey(mine)).not.toBe(factOrderKey(theirs))
  })

  it('rejects a response that does not identify its operation, or whose id disagrees with its path', () => {
    expect(
      exportAdapter.decodeResponse(
        exchange('http://localhost:4183/api/exports', 'POST', {
          attempt: 0,
          version: 1,
          phase: 'processing',
        }),
      ),
    ).toBeNull()
    expect(
      exportAdapter.decodeResponse(
        exchange('http://localhost:4183/api/exports/job-a', 'GET', {
          jobId: 'job-b',
          attempt: 0,
          version: 2,
          phase: 'succeeded',
        }),
      ),
    ).toBeNull()
  })

  it('treats malformed JSON and unreadable bodies as no fact, not as a null result', () => {
    const unreadable = exchange('http://localhost:4183/api/exports', 'POST', null, {
      bodyText: null,
      bodyReadFailed: true,
    })
    expect(exportAdapter.decodeResponse(unreadable)).toBeNull()
    expect(checkoutAdapter.decodeResponse(unreadable)).toBeNull()
    const truncated = exchange('http://localhost:4183/api/exports', 'POST', null, {
      bodyText: '{"jobId":"job-1","phase":"suc',
    })
    expect(exportAdapter.decodeResponse(truncated)).toBeNull()
  })

  it('does not treat an unknown phase, a missing attempt or a bad version as a fact', () => {
    for (const body of [
      { jobId: 'j', attempt: 0, version: 1, phase: 'weird' },
      { jobId: 'j', version: 1, phase: 'succeeded' },
      { jobId: 'j', attempt: -1, version: 1, phase: 'succeeded' },
      { jobId: 'j', attempt: 0, version: 1.5, phase: 'succeeded' },
      { jobId: '', attempt: 0, version: 1, phase: 'succeeded' },
    ])
      expect(
        exportAdapter.decodeResponse(exchange('http://localhost:4183/api/exports', 'POST', body)),
      ).toBeNull()
  })

  it('requires visible identity and notice before confirming, and reports absence otherwise', () => {
    const fact = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-1', 'GET', {
        jobId: 'job-1',
        attempt: 0,
        version: 2,
        phase: 'failed',
        notice: 'Export could not complete. You may try again.',
        retry: { permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: true },
      }),
    )!
    expect(
      exportAdapter.correlateVisible(fact, { pageText: 'Nothing here', visibleText: [] }),
    ).toEqual({ kind: 'absent' })
    expect(
      exportAdapter.correlateVisible(fact, { pageText: 'Job job-1 is failed', visibleText: [] }),
    ).toEqual({ kind: 'contradicted', reason: 'notice-not-visible' })
    expect(
      exportAdapter.correlateVisible(fact, {
        pageText: 'Job job-1: Export could not complete. You may try again.',
        visibleText: [],
      }),
    ).toMatchObject({ kind: 'confirmed', operationId: 'job-1' })
  })

  it('does not let a bare success label on the page confirm an operation', () => {
    const fact = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-1', 'GET', {
        jobId: 'job-1',
        attempt: 0,
        version: 2,
        phase: 'succeeded',
        notice: 'Export ready.',
      }),
    )!
    expect(
      exportAdapter.correlateVisible(fact, { pageText: 'Success!', visibleText: ['Success!'] }),
    ).toEqual({ kind: 'absent' })
  })
})

describe('fact ordering and retry eligibility (B06, B09)', () => {
  it('orders by identity, attempt and version so a late old response cannot overwrite a new success', () => {
    const processing = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-1', 'GET', {
        jobId: 'job-1',
        attempt: 0,
        version: 1,
        phase: 'processing',
        notice: 'Working.',
      }),
    )!
    const succeeded = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-1', 'GET', {
        jobId: 'job-1',
        attempt: 0,
        version: 2,
        phase: 'succeeded',
        notice: 'Ready.',
      }),
    )!
    expect(factOrderKey(succeeded) > factOrderKey(processing)).toBe(true)
    // Same key means the same fact: a repeated GET of one status deduplicates instead of creating
    // a second investigation or refreshing spent retry allowance.
    expect(factOrderKey(succeeded)).toBe(factOrderKey({ ...succeeded }))
    // A new attempt is a different key, so it re-correlates rather than reusing the old verdict.
    expect(factOrderKey({ ...succeeded, attempt: 1 })).not.toBe(factOrderKey(succeeded))
    expect(operationKey('job-1', 0)).not.toBe(operationKey('job-1', 1))
  })

  it('denies retry for cooldown, exhausted allowance, in-flight work and unmet prerequisites', () => {
    const failedWith = (retry: Record<string, unknown>, attempt = 0): BusinessFact =>
      exportAdapter.decodeResponse(
        exchange('http://localhost:4183/api/exports/job-1', 'GET', {
          jobId: 'job-1',
          attempt,
          version: 2,
          phase: 'failed',
          notice: 'Try again later.',
          retry,
        }),
      )!
    expect(
      retryVerdict(
        failedWith({ permitted: false, remaining: 0, afterMs: 0, prerequisitesMet: true }),
        exportContract,
      ),
    ).toMatchObject({ eligible: false, reason: 'retry-denied' })
    expect(
      retryVerdict(
        failedWith({ permitted: true, remaining: 0, afterMs: 0, prerequisitesMet: true }),
        exportContract,
      ),
    ).toMatchObject({ eligible: false, reason: 'retry-denied' })
    expect(
      retryVerdict(
        failedWith({ permitted: true, remaining: 1, afterMs: 4000, prerequisitesMet: true }),
        exportContract,
      ),
    ).toMatchObject({ eligible: false, reason: 'retry-denied' })
    expect(
      retryVerdict(
        failedWith({ permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: false }),
        exportContract,
      ),
    ).toMatchObject({ eligible: false, reason: 'retry-denied' })
    // Already used the one permitted retry.
    expect(
      retryVerdict(
        failedWith({ permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: true }, 1),
        exportContract,
      ),
    ).toMatchObject({ eligible: false, reason: 'retry-already-used' })
  })

  it('denies retry for a missing decision and for a processing operation', () => {
    const noDecision = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-1', 'GET', {
        jobId: 'job-1',
        attempt: 0,
        version: 2,
        phase: 'failed',
        notice: 'Failed.',
      }),
    )!
    expect(noDecision.retryEligibility).toBe('unknown')
    expect(retryVerdict(noDecision, exportContract)).toMatchObject({ eligible: false })

    const processing = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports/job-1', 'GET', {
        jobId: 'job-1',
        attempt: 0,
        version: 1,
        phase: 'processing',
        notice: 'Working.',
      }),
    )!
    expect(retryVerdict(processing, exportContract)).toMatchObject({
      eligible: false,
      reason: 'not-a-failed-operation',
    })
  })

  it('refuses a retry when the contract itself permits none', () => {
    const fact = checkoutAdapter.decodeResponse(
      exchange('http://localhost:4173/api/checkout', 'POST', {
        success: false,
        status: 'failed',
        orderId: 'order-1',
        message: 'retry?',
        canRetry: true,
      }),
    )!
    expect(retryVerdict(fact, checkout)).toMatchObject({
      eligible: false,
      reason: 'retry-not-permitted-by-contract',
    })
  })
})

describe('runtime snapshot binding (C07, B10)', () => {
  it('builds a runtime from the persisted snapshot, not from live config', () => {
    const runtime = createBusinessRuntime(exportContract)
    expect(runtime.adapterId).toBe('export')
    expect(runtime.adapterRevision).toBe('1')
    expect(runtime.contract.hash).toBe(exportContract.hash)
    expect(runtime.adapterAvailable()).toBe(true)
    // A typed-in URL, not an untyped invocation.
    expect(
      runtime.classifyRequest({
        url: 'http://localhost:4183/api/exports',
        method: 'POST',
        origin: 'http://localhost:4183',
      }),
    ).toEqual({ kind: 'create' })
  })

  it('fails explicitly when the recorded adapter revision is not loadable', () => {
    expect(() =>
      createBusinessRuntime({ ...exportContract, adapter: { id: 'export', revision: '9' } }),
    ).toThrow(AdapterUnavailableError)
    expect(() =>
      createBusinessRuntime({ ...exportContract, adapter: { id: 'export', revision: '9' } }),
    ).toThrow(/adapter-revision-unavailable/)
  })

  it('verifies its own snapshot hash and rejects a tampered record', () => {
    expect(verifyContractSnapshot(exportContract)).toBe(true)
    expect(verifyContractSnapshot({ ...exportContract, retryAvailabilityMs: 1 })).toBe(false)
    expect(
      verifyContractSnapshot({
        ...exportContract,
        environment: { ...exportContract.environment, entryUrl: 'http://evil' },
      }),
    ).toBe(false)
  })

  it('registers exactly two adapters and does not allow dynamic registration', () => {
    expect(registeredAdapters().map((a) => a.id)).toEqual(['checkout', 'export'])
    expect(Object.isFrozen(registeredAdapters())).toBe(true)
  })

  it('decodes only well formed persisted facts', () => {
    const fact = exportAdapter.decodeResponse(
      exchange('http://localhost:4183/api/exports', 'POST', {
        jobId: 'job-1',
        attempt: 0,
        version: 1,
        phase: 'processing',
        notice: 'Started.',
      }),
    )!
    expect(decodeFact(fact)).toMatchObject({ operationId: 'job-1', phase: 'processing' })
    expect(decodeFact({ ...fact, phase: 'nonsense' })).toBeNull()
    expect(decodeFact({ ...fact, attempt: -1 })).toBeNull()
    expect(decodeFact({ ...fact, retry: { permitted: 'yes' } })).toBeNull()
    expect(decodeFact(null)).toBeNull()
    expect(decodeFact('fact')).toBeNull()
  })
})
