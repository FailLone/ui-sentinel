import { describe, expect, it } from 'vitest'
import { checkDestination } from './address.ts'

/**
 * The connection-time address check (plan 4.3, U19).
 *
 * A name that passed creation time is re-resolved here, immediately before a socket is opened, so a
 * DNS answer that changes between the two checks cannot be used to reach an internal address. Two
 * properties are load-bearing: *every* answer is inspected (a rebound name often returns one public
 * and one private record), and an unanswerable or unclassifiable result refuses rather than admits.
 */
const TRUSTED = ['http://127.0.0.1:5055']

function checker(answers: Record<string, string[]>) {
  return (host: string) => answers[host] ?? []
}

describe('checkDestination', () => {
  it('allows a public name that resolves only to public addresses', () => {
    const result = checkDestination({
      host: 'example.org',
      port: 443,
      fixtureOrigins: TRUSTED,
      lookup: checker({ 'example.org': ['93.184.216.34'] }),
    })
    expect(result).toMatchObject({ allow: true, addresses: ['93.184.216.34'] })
  })

  it('refuses when any answer is private, even alongside a public one', () => {
    // The mixed answer is exactly what DNS rebinding produces; taking the public one would be a
    // coin flip on which address the socket actually used.
    const result = checkDestination({
      host: 'rebind.example.org',
      port: 443,
      fixtureOrigins: TRUSTED,
      lookup: checker({ 'rebind.example.org': ['93.184.216.34', '127.0.0.1'] }),
    })
    expect(result).toMatchObject({ allow: false, reasonCode: 'private-address' })
  })

  it('refuses a name that resolves to a provider metadata address', () => {
    const result = checkDestination({
      host: 'metadata.internal',
      port: 80,
      fixtureOrigins: TRUSTED,
      lookup: checker({ 'metadata.internal': ['169.254.169.254'] }),
    })
    expect(result).toMatchObject({ allow: false, reasonCode: 'private-address' })
  })

  it('refuses a literal private address without consulting the resolver', () => {
    let called = false
    const result = checkDestination({
      host: '10.1.2.3',
      port: 80,
      fixtureOrigins: TRUSTED,
      lookup: () => {
        called = true
        return []
      },
    })
    expect(result).toMatchObject({ allow: false, reasonCode: 'private-address' })
    expect(called).toBe(false)
  })

  it('refuses when the name does not resolve at all', () => {
    const result = checkDestination({
      host: 'nope.example.org',
      port: 443,
      fixtureOrigins: TRUSTED,
      lookup: checker({}),
    })
    expect(result).toMatchObject({ allow: false, reasonCode: 'resolution-failed' })
  })

  it('refuses a non-http(s) port', () => {
    for (const port of [22, 3306, 6379]) {
      expect(
        checkDestination({
          host: 'example.org',
          port,
          fixtureOrigins: TRUSTED,
          lookup: checker({ 'example.org': ['93.184.216.34'] }),
        }),
      ).toMatchObject({ allow: false, reasonCode: 'port-not-allowed' })
    }
  })

  it('allows 80 and 443 and the configured fixture port', () => {
    for (const port of [80, 443]) {
      expect(
        checkDestination({
          host: 'example.org',
          port,
          fixtureOrigins: TRUSTED,
          lookup: checker({ 'example.org': ['93.184.216.34'] }),
        }).allow,
        String(port),
      ).toBe(true)
    }
  })

  it('allows a trusted fixture origin at its own port', () => {
    const result = checkDestination({
      host: '127.0.0.1',
      port: 5055,
      fixtureOrigins: TRUSTED,
      lookup: checker({}),
    })
    expect(result).toMatchObject({ allow: true, trusted: true })
  })

  it('does not treat the service control port as a trusted fixture', () => {
    // The control plane is on another loopback port; trusting the fixture does not trust it. It is
    // refused either as a non-standard port or as a private address, so the test pins the refusal.
    const result = checkDestination({
      host: '127.0.0.1',
      port: 4111,
      fixtureOrigins: TRUSTED,
      lookup: checker({}),
    })
    expect(result.allow).toBe(false)
    expect(['private-address', 'port-not-allowed']).toContain(result.reasonCode)
  })

  it('refuses an IPv6 unique-local destination', () => {
    const result = checkDestination({
      host: 'internal.example.org',
      port: 443,
      fixtureOrigins: TRUSTED,
      lookup: checker({ 'internal.example.org': ['fd00::1'] }),
    })
    expect(result).toMatchObject({ allow: false, reasonCode: 'private-address' })
  })

  it('fails closed when the resolver throws', () => {
    const result = checkDestination({
      host: 'example.org',
      port: 443,
      fixtureOrigins: TRUSTED,
      lookup: () => {
        throw new Error('servfail')
      },
    })
    expect(result).toMatchObject({ allow: false, reasonCode: 'resolution-failed' })
  })
})
