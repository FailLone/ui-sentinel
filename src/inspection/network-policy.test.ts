import { describe, expect, it } from 'vitest'
import { createNetworkPolicy, UI_NETWORK_POLICY_REVISION } from './network-policy.ts'

/**
 * The request decision table of plan 4.2.
 *
 * Each refusal here is a boundary the plan says must hold *before dispatch*: a write is refused
 * because the user goal or a button's wording asked for it just as much as when nothing did, and a
 * granted resource origin does not silently become an API, navigation or write permission.
 */
const ENTRY = 'https://shop.example.org/catalog'
const CDN = 'https://cdn.example.org'
const API = 'https://api.example.org'

function policy(overrides: Partial<Parameters<typeof createNetworkPolicy>[0]> = {}) {
  return createNetworkPolicy({
    entryUrl: ENTRY,
    resourceOrigins: [],
    dataOrigins: [],
    reachableOrigins: [],
    ...overrides,
  })
}

const document = {
  requestId: 'r1',
  method: 'GET',
  destination: 'document',
  isNavigation: true,
  redirectFrom: null,
  actionId: null,
  resolvedAddress: null,
} as const

describe('navigation decisions', () => {
  it('allows the entry origin document navigation', () => {
    const decision = policy().decide({ ...document, url: `${ENTRY}?a=1#x` })
    expect(decision.allow).toBe(true)
    expect(decision.policyRevision).toBe(UI_NETWORK_POLICY_REVISION)
  })

  it('refuses a subdomain as a different origin', () => {
    expect(policy().decide({ ...document, url: 'https://www.shop.example.org/' })).toMatchObject({
      allow: false,
      reasonCode: 'outside-navigation-scope',
    })
  })

  it('refuses an http downgrade of the same host', () => {
    expect(policy().decide({ ...document, url: 'http://shop.example.org/' })).toMatchObject({
      allow: false,
      reasonCode: 'outside-navigation-scope',
    })
  })

  it('refuses a registered resource origin as a navigation destination', () => {
    // A resource grant is not a navigation grant (plan 4.2).
    const withCdn = policy({ resourceOrigins: [CDN] })
    expect(withCdn.decide({ ...document, url: `${CDN}/app.js` })).toMatchObject({
      allow: false,
      reasonCode: 'outside-navigation-scope',
    })
  })

  it('refuses the control surface even on the entry origin', () => {
    expect(
      policy().decide({ ...document, url: 'https://shop.example.org/__control/reset' }),
    ).toMatchObject({ allow: false, reasonCode: 'control-surface' })
  })

  it('refuses a private literal destination', () => {
    expect(
      policy().decide({ ...document, url: 'http://169.254.169.254/latest/meta-data' }),
    ).toMatchObject({ allow: false, reasonCode: 'private-address' })
  })

  it('refuses when resolution produced a private address for a public name', () => {
    // DNS rebinding: the name looks public, the address does not.
    expect(
      policy().decide({
        ...document,
        url: 'https://rebind.example.org/',
        resolvedAddress: '127.0.0.1',
      }),
    ).toMatchObject({ allow: false, reasonCode: 'private-address' })
  })

  it('refuses a navigation whose public semantics say it writes', () => {
    expect(
      policy().decide({
        ...document,
        url: `${ENTRY.replace('/catalog', '')}/logout`,
        declaredWrite: true,
      }),
    ).toMatchObject({ allow: false, reasonCode: 'write-denied' })
  })

  it('navigates a configured local fixture entry and refuses other local origins', () => {
    // `reachableOrigins` lets a private fixture be *reached*; it does not make it a page. The fixture
    // is navigable because it is this run's entry origin.
    const fixture = 'http://127.0.0.1:5055'
    const local = createNetworkPolicy({
      entryUrl: `${fixture}/fixture`,
      resourceOrigins: [],
      dataOrigins: [],
      reachableOrigins: [fixture],
    })
    expect(local.decide({ ...document, url: `${fixture}/step-2` }).allow).toBe(true)
    // The service's own control plane is a different origin and is never a fixture.
    const serviceApi = local.decide({ ...document, url: 'http://127.0.0.1:4111/api/runs' })
    expect(serviceApi.allow).toBe(false)
    expect(['outside-navigation-scope', 'private-address']).toContain(serviceApi.reasonCode)
  })

  it('never treats a declared resource origin as a page destination', () => {
    // Listing a CDN so its CSS loads must not make the CDN a URL the run can visit; otherwise an
    // in-page script could convert a resource grant into a navigation grant.
    const withCdn = policy({ resourceOrigins: [CDN], reachableOrigins: [CDN] })
    expect(withCdn.decide({ ...document, url: `${CDN}/somewhere` })).toMatchObject({
      allow: false,
      reasonCode: 'outside-navigation-scope',
    })
  })
})

describe('subresource decisions', () => {
  const image = { ...document, destination: 'image', isNavigation: false, url: '' }

  it('allows a same-origin script, style and font', () => {
    for (const destination of ['script', 'style', 'font', 'image', 'media', 'manifest']) {
      const decision = policy().decide({ ...image, destination, url: 'https://shop.example.org/a' })
      expect(decision.allow, destination).toBe(true)
    }
  })

  it('allows a declared cross-origin resource origin', () => {
    expect(
      policy({ resourceOrigins: [CDN] }).decide({ ...image, url: `${CDN}/theme.css` }).allow,
    ).toBe(true)
  })

  it('refuses an undeclared cross-origin resource', () => {
    expect(policy().decide({ ...image, url: 'https://ads.example.net/pixel.png' })).toMatchObject({
      allow: false,
      reasonCode: 'resource-origin-denied',
    })
  })

  it('refuses a declared resource origin that reaches a control path', () => {
    // A page cannot widen its own permissions by naming a resource it "needs".
    expect(
      policy({ resourceOrigins: [CDN] }).decide({ ...image, url: `${CDN}/__control/x.png` }),
    ).toMatchObject({ allow: false, reasonCode: 'control-surface' })
  })

  it('refuses a resource whose resolved address is private', () => {
    expect(
      policy({ resourceOrigins: [CDN] }).decide({
        ...image,
        url: `${CDN}/a.png`,
        resolvedAddress: '10.0.0.5',
      }),
    ).toMatchObject({ allow: false, reasonCode: 'private-address' })
  })

  it('allows a page-generated data or blob subresource', () => {
    for (const url of ['data:image/png;base64,AAAA', 'blob:https://shop.example.org/abc'])
      expect(policy().decide({ ...image, url }).allow, url).toBe(true)
  })
})

describe('data request decisions', () => {
  const fetch = { ...document, destination: 'fetch', isNavigation: false }

  it('allows a same-origin GET', () => {
    expect(policy().decide({ ...fetch, url: 'https://shop.example.org/api/items' }).allow).toBe(
      true,
    )
  })

  it('allows a declared data origin GET and HEAD', () => {
    const withApi = policy({ dataOrigins: [API] })
    expect(withApi.decide({ ...fetch, url: `${API}/items` }).allow).toBe(true)
    expect(withApi.decide({ ...fetch, method: 'HEAD', url: `${API}/items` }).allow).toBe(true)
  })

  it('allows OPTIONS to a declared data origin as a preflight only', () => {
    const withApi = policy({ dataOrigins: [API] })
    expect(withApi.decide({ ...fetch, method: 'OPTIONS', url: `${API}/items` }).allow).toBe(true)
    // The preflight grants nothing to the request that follows it. The plan permits either the
    // write or the unsupported-method reason here, so the test asserts the refusal, not the label.
    const followUp = withApi.decide({ ...fetch, method: 'POST', url: `${API}/items` })
    expect(followUp.allow).toBe(false)
    expect(['write-denied', 'unsupported-data-method']).toContain(followUp.reasonCode)
  })

  it('refuses a declared resource origin as a data destination', () => {
    // Resource permission does not grant API permission (plan 4.2, U05).
    expect(
      policy({ resourceOrigins: [CDN] }).decide({ ...fetch, url: `${CDN}/api/items` }),
    ).toMatchObject({ allow: false, reasonCode: 'data-origin-denied' })
  })

  it('refuses a non-GET data method even on a granted origin', () => {
    const withApi = policy({ dataOrigins: [API] })
    expect(withApi.decide({ ...fetch, method: 'POST', url: `${API}/graphql` })).toMatchObject({
      allow: false,
      reasonCode: 'unsupported-data-method',
    })
  })

  it('refuses a same-origin POST as a write', () => {
    const decision = policy().decide({
      ...fetch,
      method: 'POST',
      url: 'https://shop.example.org/api/items',
    })
    expect(decision.allow).toBe(false)
    expect(['write-denied', 'unsupported-data-method']).toContain(decision.reasonCode)
  })

  it('refuses a same-origin GET that the public semantics declare to write', () => {
    expect(
      policy().decide({
        ...fetch,
        url: 'https://shop.example.org/api/unsubscribe',
        declaredWrite: true,
      }),
    ).toMatchObject({ allow: false, reasonCode: 'write-denied' })
  })

  it('refuses a sendBeacon from a granted data origin', () => {
    const decision = policy({ dataOrigins: [API] }).decide({
      ...fetch,
      method: 'POST',
      url: `${API}/collect`,
      destination: 'ping',
    })
    expect(decision.allow).toBe(false)
    expect(['write-denied', 'unsupported-data-method']).toContain(decision.reasonCode)
  })
})

describe('unsupported channels', () => {
  it('refuses a websocket channel', () => {
    expect(
      policy().decide({ ...document, url: 'wss://shop.example.org/socket', isNavigation: false }),
    ).toMatchObject({ allow: false, reasonCode: 'unsupported-channel' })
  })

  it('refuses an iframe document navigation', () => {
    expect(
      policy().decide({
        ...document,
        url: 'https://shop.example.org/widget',
        destination: 'iframe',
      }),
    ).toMatchObject({ allow: false, reasonCode: 'unsupported-channel' })
  })

  it('refuses a data or blob URL as a navigation target', () => {
    expect(policy().decide({ ...document, url: 'data:text/html,<h1>hi</h1>' })).toMatchObject({
      allow: false,
      reasonCode: 'unsupported-channel',
    })
  })
})

describe('decision receipts', () => {
  it('echoes the request identity needed to attribute the decision', () => {
    const decision = policy().decide({
      ...document,
      url: 'https://ads.example.net/x',
      requestId: 'req-7',
      actionId: 'act-3',
    })
    expect(decision).toMatchObject({ allow: false, requestId: 'req-7', actionId: 'act-3' })
  })
})
