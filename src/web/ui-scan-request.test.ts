import { describe, it, expect } from 'vitest'
import { buildUiScanRequest, uiScanClientHint } from './ui-scan-request.ts'

/**
 * The workbench's `ui-scan` request, built on the client (plan 3.2 step 2).
 *
 * The server is authoritative - it re-resolves and can refuse - but the form still has to produce a
 * body the API will accept, and it must not send fields the mode does not have. These tests pin the
 * shape: the discriminant and URL are always present, empty optional groups are omitted rather than
 * sent as zeroes, and a visibly wrong URL is caught before a request is made.
 */
describe('U20: the workbench builds a ui-scan request body', () => {
  it('always carries the discriminant and the address as typed', () => {
    expect(
      buildUiScanRequest({ entryUrl: 'https://example.org/catalog?x=1#panel', goal: '' }),
    ).toMatchObject({
      kind: 'ui-scan',
      entryUrl: 'https://example.org/catalog?x=1#panel',
    })
  })

  it('omits the goal when the user left it blank, so the server applies its own default', () => {
    const body = buildUiScanRequest({ entryUrl: 'https://example.org/', goal: '   ' })
    expect(body.goal).toBeUndefined()
  })

  it('keeps a short goal verbatim', () => {
    expect(buildUiScanRequest({ entryUrl: 'https://example.org/', goal: ' 检查筛选 ' }).goal).toBe(
      '检查筛选',
    )
  })

  it('omits scope, access and budget rather than sending empty or zeroed groups', () => {
    const body = buildUiScanRequest({ entryUrl: 'https://example.org/' })
    expect(body.scope).toBeUndefined()
    expect(body.access).toBeUndefined()
    expect(body.budget).toBeUndefined()
  })

  it('narrows the scope only with the limits the contract permits', () => {
    const body = buildUiScanRequest({ entryUrl: 'https://example.org/', maxPages: 2, maxDepth: 0 })
    expect(body.scope).toEqual({ maxPages: 2, maxDepth: 0 })
  })

  it('splits a newline- or comma-separated origin list into exact origins', () => {
    const body = buildUiScanRequest({
      entryUrl: 'https://example.org/',
      resourceOrigins: 'https://cdn.example.org\nhttps://fonts.example.org',
      dataOrigins: 'https://api.example.org, https://data.example.org',
    })
    expect(body.access).toEqual({
      resourceOrigins: ['https://cdn.example.org', 'https://fonts.example.org'],
      dataOrigins: ['https://api.example.org', 'https://data.example.org'],
    })
  })

  it('does not invent a budget from untouched fields', () => {
    const body = buildUiScanRequest({ entryUrl: 'https://example.org/', maxActions: 12 })
    expect(body.budget).toEqual({ maxActions: 12 })
  })

  it('never sends a business field, whichever options are set', () => {
    const body = buildUiScanRequest({
      entryUrl: 'https://example.org/',
      goal: 'g',
      maxPages: 3,
      maxDepth: 1,
      maxActions: 5,
    })
    expect(body).not.toHaveProperty('businessProfile')
    expect(body).not.toHaveProperty('environmentId')
  })
})

describe('U20: the workbench warns about a visibly wrong address before sending', () => {
  it('asks for a scheme when the address looks relative', () => {
    expect(uiScanClientHint('/catalog')).toMatch(/http/)
  })

  it('refuses a scheme that cannot be a page', () => {
    expect(uiScanClientHint('file:///etc/hosts')).toMatch(/http|https/)
    expect(uiScanClientHint('javascript:void(0)')).toMatch(/http|https/)
  })

  it('accepts an ordinary absolute address', () => {
    expect(uiScanClientHint('https://example.org/catalog?x=1#panel')).toBeNull()
  })

  it('does not pre-judge the host address policy, which only the server can decide', () => {
    // A private-looking literal is not refused here: whether it is an allowed fixture origin is
    // server configuration, and guessing would either block a valid fixture or imply an approval the
    // client cannot give.
    expect(uiScanClientHint('http://127.0.0.1:5055/')).toBeNull()
  })
})
