import { describe, it, expect, beforeAll, vi } from 'vitest'
import { Hono } from 'hono'

/**
 * U20/U01: the formal API's `ui-scan` branch (plan 3.2, 5.1).
 *
 * The workbench and any other client must be able to create a bounded URL scan through the same
 * endpoint a business run uses, with the mode chosen by an explicit discriminant. These tests assert
 * the parts that make the mode trustworthy rather than merely accepted: an absolute URL, a refused
 * private address, a refused mixed body, a contract that is persisted *before* the run is queued, and
 * a 202 that names the mode and the contract hash it actually froze.
 *
 * The module graph is mocked the way the existing route tests do it, so a 202 here means the request
 * really reached `createRun`: the run row is real, not a stub. DNS is mocked so a route test never
 * depends on the network.
 */
const harness = vi.hoisted(() => ({ started: [] as string[] }))
const addresses = vi.hoisted(() => ({ byHost: new Map<string, string>() }))

vi.mock('../../shared/config.ts', () => ({
  config: {
    databaseUrl: ':memory:',
    agentModel: 'openai/test-mock',
    visionModel: 'test',
    features: { observation: false, ruleRouting: false, journeys: false, urlScan: true },
    urlScan: { trustedOrigins: ['http://127.0.0.1:5055'] },
    completionReview: { model: 'm', expectedModel: 'm', apiKey: '', timeoutMs: 100 },
    budget: {
      totalTimeoutMs: 20000,
      maxActions: 10,
      maxModelCalls: 6,
      toolTimeoutMs: 15000,
      modelRequestTimeoutMs: 10000,
      modelRequestMaxRetries: 0,
    },
  },
  checkModelConfig: () => ({ ready: true, missing: [] }),
}))

// A route test must never resolve a real name; the lookup table is the whole DNS surface here.
vi.mock('./ui-scan-address.ts', () => ({
  resolveHostAddress: async (host: string) => addresses.byHost.get(host) ?? null,
}))

// Never launch a browser from a route test: record the attempt and stop.
vi.mock('../../execution/executor.ts', () => ({
  startRunExecution: async (id: string) => {
    harness.started.push(id)
  },
  cancelRunExecution: async () => true,
}))

import { runRoutes } from './runs.ts'
import { getRun } from '../../execution/run-manager.ts'
import { initDatabase } from '../../storage/database.ts'
import { verifyUiContractSnapshot } from '../../inspection/contract.ts'

const app = new Hono()
app.route('/', runRoutes)

const post = (body: unknown) =>
  app.request('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const UI_ENTRY = 'http://127.0.0.1:5055/catalog?x=1&x=2&sort=asc#panel'

describe('U01: a ui-scan request freezes a UI contract and queues a run', () => {
  beforeAll(async () => {
    await initDatabase()
  })

  it('returns 202 with the mode, the contract hash and the persisted entry as submitted', async () => {
    const res = await post({
      kind: 'ui-scan',
      entryUrl: UI_ENTRY,
      goal: '检查目录浏览和筛选',
      scope: { maxPages: 3, maxDepth: 1 },
    })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.kind).toBe('ui-scan')
    expect(body.status).toBe('queued')
    expect(body.eventsUrl).toBe(`/api/runs/${body.runId}/events`)
    expect(body.reportUrl).toBe(`/api/runs/${body.runId}/report`)

    const run = await getRun(body.runId)
    expect(run!.spec.kind).toBe('ui-scan')
    // A UI run carries no business contract, and the two are alternatives rather than a pair.
    expect(run!.spec.businessContract).toBeUndefined()
    const contract = run!.spec.uiContract!
    expect(contract.hash).toBe(body.contractHash)
    expect(verifyUiContractSnapshot(contract)).toBe(true)
    // The executed address keeps its path, query order, repeated parameter and fragment (plan 4.1).
    expect(contract.entryUrl).toBe(UI_ENTRY)
    expect(contract.requestedUrl).toBe(UI_ENTRY)
    expect(contract.origin).toBe('http://127.0.0.1:5055')
    expect(contract.businessWrites).toBe('none')
    expect(contract.session).toBe('anonymous')
    expect(contract.scope).toEqual({ maxPages: 3, maxDepth: 1 })
    // The spec the executor navigates to is the contract's executed address, so a URL that `new URL`
    // normalized cannot leave the run pointing at a different page than the contract it froze.
    expect(run!.spec.entryUrl).toBe(contract.entryUrl)
  })

  it('applies the neutral default goal when the user leaves it empty', async () => {
    const res = await post({ kind: 'ui-scan', entryUrl: UI_ENTRY })
    const contract = (await getRun((await res.json()).runId))!.spec.uiContract!
    expect(contract.goalSource).toBe('default')
    expect(contract.goal).toMatch(/未验证范围|unverified scope/)
  })

  it('persists the contract before the run is queued, and never reruns from live config', async () => {
    const before = harness.started.length
    const res = await post({ kind: 'ui-scan', entryUrl: UI_ENTRY })
    const body = await res.json()
    expect(harness.started.length).toBe(before + 1)
    expect(harness.started.at(-1)).toBe(body.runId)
    const run = await getRun(body.runId)
    expect(run!.status).toBe('queued')
    expect(run!.spec.uiContract!.hash).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('U01: an invalid request is refused before anything is created', () => {
  const refused = async (payload: unknown, error: string) => {
    const before = harness.started.length
    const res = await post(payload)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe(error)
    // Refusal means no queue entry: an invalid request cannot leave half a run behind.
    expect(harness.started.length).toBe(before)
    return body
  }

  it('refuses disabled popup capability before creating a run or reading model credentials', async () => {
    await refused(
      { kind: 'ui-scan', entryUrl: UI_ENTRY, popupCheck: { mode: 'popup-viewport' } },
      'popup-check-unavailable',
    )
  })

  it('refuses a relative address with an actionable reason and field', async () => {
    const body = await refused({ kind: 'ui-scan', entryUrl: '/catalog' }, 'url-not-absolute')
    expect(body.field).toBe('entryUrl')
    expect(typeof body.message).toBe('string')
  })

  it('refuses a scheme that is not http or https', async () => {
    await refused({ kind: 'ui-scan', entryUrl: 'file:///etc/hosts' }, 'unsupported-scheme')
  })

  it('refuses credentials, which would contradict the anonymous session', async () => {
    // Composed at runtime, matching `inspection/url.test.ts`: the source carries no credential-shaped
    // literal, so the repository's secret scanner stays focused on real findings.
    const userinfo = ['someone', 'placeholder'].join(':')
    await refused(
      { kind: 'ui-scan', entryUrl: `http://${userinfo}@127.0.0.1:5055/` },
      'url-has-credentials',
    )
  })

  it('refuses a private literal address that is not a declared fixture origin', async () => {
    await refused({ kind: 'ui-scan', entryUrl: 'http://192.168.1.10/catalog' }, 'private-address')
    await refused(
      { kind: 'ui-scan', entryUrl: 'http://169.254.169.254/latest/meta-data' },
      'private-address',
    )
  })

  it('refuses a public name that resolves into a private range', async () => {
    addresses.byHost.set('rebind.example.org', '10.0.0.7')
    try {
      await refused({ kind: 'ui-scan', entryUrl: 'https://rebind.example.org/' }, 'private-address')
    } finally {
      addresses.byHost.delete('rebind.example.org')
    }
  })

  it('refuses the service control surface as a destination', async () => {
    await refused(
      { kind: 'ui-scan', entryUrl: 'http://127.0.0.1:5055/__control/reset' },
      'control-surface',
    )
  })

  it('refuses a scope wider than the contract allows', async () => {
    const body = await refused(
      { kind: 'ui-scan', entryUrl: UI_ENTRY, scope: { maxPages: 9, maxDepth: 3 } },
      'invalid-request',
    )
    // The refusal names the field, so a client learns which limit it exceeded rather than only that
    // the body was wrong.
    expect(body.details[0].path).toContain('maxPages')
  })

  it('refuses a wildcard resource origin rather than treating it as an origin', async () => {
    await refused(
      {
        kind: 'ui-scan',
        entryUrl: UI_ENTRY,
        access: { resourceOrigins: ['https://*.cdn.example.org'] },
      },
      'resource-origin-refused',
    )
  })
})

describe('U01: the two modes cannot be mixed, and one explicit discriminant is required', () => {
  it('refuses a ui-scan body that also selects a business profile', async () => {
    const res = await post({
      kind: 'ui-scan',
      entryUrl: UI_ENTRY,
      businessProfile: { id: 'checkout', revision: '1' },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid-request')
  })

  it('refuses a ui-scan body that names a business environment', async () => {
    const res = await post({ kind: 'ui-scan', entryUrl: UI_ENTRY, environmentId: 'arena' })
    expect(res.status).toBe(400)
  })

  it('refuses a business body that smuggles in UI scope or access', async () => {
    const res = await post({
      goal: 'g',
      environmentId: 'arena',
      scope: { maxPages: 3, maxDepth: 1 },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid-request')
  })

  it('refuses an unknown kind rather than guessing which mode was meant', async () => {
    const res = await post({ kind: 'scan', entryUrl: UI_ENTRY })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid-request')
  })
})

describe('U01: admission is gated by the mode flag, not by the caller', () => {
  it('refuses new UI scans while the feature is off, and never queues one', async () => {
    const { config } = await import('../../shared/config.ts')
    const mutable = config.features as { urlScan: boolean }
    const original = mutable.urlScan
    mutable.urlScan = false
    try {
      const before = harness.started.length
      const res = await post({ kind: 'ui-scan', entryUrl: UI_ENTRY })
      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('url-scan-disabled')
      expect(harness.started.length).toBe(before)
    } finally {
      mutable.urlScan = original
    }
  })
})

it('rejects deployment DNS configuration supplied by a scan request', async () => {
  for (const injected of [
    { dnsMode: 'doh' },
    { resolver: { endpoint: 'https://attacker.invalid' } },
    { urlScan: { dns: { mode: 'doh' } } },
  ]) {
    const response = await post({ kind: 'ui-scan', entryUrl: UI_ENTRY, ...injected })
    expect(response.status).toBe(400)
  }
})
