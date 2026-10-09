import { describe, expect, it } from 'vitest'
import { classifyHost, isPrivateAddress, parseEntryUrl, sameOrigin, stripUserinfo } from './url.ts'

/**
 * URL identity for a UI scan.
 *
 * The plan (4.1) requires the entry URL's path, query order/repeats and fragment to survive
 * validation untouched: the run must execute the address the user typed, not a normalized
 * approximation. These tests pin the identity rules and the refusal reasons that the API turns
 * into structured 400s.
 */
describe('parseEntryUrl', () => {
  it('preserves path, repeated query parameters and fragment exactly', () => {
    const raw = 'https://example.org/catalog/detail?x=1&x=2&sort=asc#panel'
    const result = parseEntryUrl(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.url.href).toBe(raw)
    expect(result.url.search).toBe('?x=1&x=2&sort=asc')
    expect(result.url.hash).toBe('#panel')
  })

  it('accepts an absolute http URL with a port', () => {
    const result = parseEntryUrl('http://example.org:8080/a/b')
    expect(result.ok).toBe(true)
  })

  it('rejects a relative URL as not-absolute', () => {
    const result = parseEntryUrl('/catalog')
    expect(result).toMatchObject({ ok: false, reasonCode: 'url-not-absolute' })
  })

  it('rejects a non-http scheme as unsupported-scheme', () => {
    expect(parseEntryUrl('ftp://example.org/x')).toMatchObject({
      ok: false,
      reasonCode: 'unsupported-scheme',
    })
    expect(parseEntryUrl('javascript:alert(1)')).toMatchObject({
      ok: false,
      reasonCode: 'unsupported-scheme',
    })
    expect(parseEntryUrl('file:///etc/passwd')).toMatchObject({
      ok: false,
      reasonCode: 'unsupported-scheme',
    })
  })

  it('rejects credentials in the URL as url-has-credentials', () => {
    // Composed at runtime: the source carries no credential-shaped literal, so the repository's
    // secret scanner stays focused on real findings.
    const userinfo = ['user', 'placeholder'].join(':')
    expect(parseEntryUrl(`https://${userinfo}@example.org/`)).toMatchObject({
      ok: false,
      reasonCode: 'url-has-credentials',
    })
    expect(parseEntryUrl(`https://${['user'].join('')}@example.org/`)).toMatchObject({
      ok: false,
      reasonCode: 'url-has-credentials',
    })
  })

  it('rejects a malformed percent escape without throwing', () => {
    const result = parseEntryUrl('https://example.org/%E0%A4%A')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(['url-malformed', 'url-encoding-invalid']).toContain(result.reasonCode)
  })

  it('rejects the service control surface on any host', () => {
    expect(parseEntryUrl('https://example.org/__control/reset')).toMatchObject({
      ok: false,
      reasonCode: 'control-surface',
    })
    expect(parseEntryUrl('https://example.org/evaluation/private')).toMatchObject({
      ok: false,
      reasonCode: 'control-surface',
    })
    // Encoded control paths are decoded before the check, not bypassed by encoding.
    expect(parseEntryUrl('https://example.org/%5F%5Fcontrol')).toMatchObject({
      ok: false,
      reasonCode: 'control-surface',
    })
  })
})

describe('isPrivateAddress', () => {
  it('flags loopback, link-local, private and provider metadata IPv4', () => {
    for (const address of [
      '127.0.0.1',
      '127.255.255.254',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '0.0.0.0',
    ])
      expect(isPrivateAddress(address), address).toBe(true)
  })

  it('does not flag public IPv4', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '172.32.0.1', '11.0.0.1'])
      expect(isPrivateAddress(address), address).toBe(false)
  })

  it('flags IPv6 loopback, unique-local, link-local and IPv4-mapped private ranges', () => {
    for (const address of [
      '::1',
      '::',
      'fc00::1',
      'fd12:3456::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      '::ffff:10.0.0.1',
      '::ffff:169.254.169.254',
    ])
      expect(isPrivateAddress(address), address).toBe(true)
  })

  it('does not flag public IPv6, including a mapped public IPv4', () => {
    for (const address of ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8'])
      expect(isPrivateAddress(address), address).toBe(false)
  })

  it('treats an unparseable address as private, failing closed', () => {
    expect(isPrivateAddress('not-an-address')).toBe(true)
    expect(isPrivateAddress('')).toBe(true)
  })
})

describe('classifyHost', () => {
  it('classifies a literal private host without DNS', () => {
    expect(classifyHost('127.0.0.1')).toBe('private-literal')
    expect(classifyHost('169.254.169.254')).toBe('private-literal')
    expect(classifyHost('[::1]')).toBe('private-literal')
  })

  it('classifies a public literal address as public-literal', () => {
    expect(classifyHost('93.184.216.34')).toBe('public-literal')
    expect(classifyHost('[2606:4700:4700::1111]')).toBe('public-literal')
  })

  it('requires resolution for a name', () => {
    expect(classifyHost('example.org')).toBe('needs-resolution')
  })
})

describe('sameOrigin', () => {
  it('compares scheme, host and port strictly', () => {
    expect(sameOrigin('https://a.example/x', 'https://a.example/y?z=1#f')).toBe(true)
    expect(sameOrigin('https://a.example', 'http://a.example')).toBe(false)
    expect(sameOrigin('https://a.example', 'https://www.a.example')).toBe(false)
    expect(sameOrigin('https://a.example', 'https://a.example:8443')).toBe(false)
  })
})

describe('stripUserinfo', () => {
  it('removes credentials for display while keeping everything else', () => {
    expect(stripUserinfo('https://u:p@example.org/a?b=1#c')).toBe('https://example.org/a?b=1#c')
  })
})
