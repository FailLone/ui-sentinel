import { isIP } from 'node:net'
/**
 * URL identity and address classification for a `ui-scan` run.
 *
 * Two rules shape this module, and both are about not rewriting the user's request:
 *
 * 1. The entry URL is *executed* as typed. Path, query order, repeated parameters and fragment are
 *    identity, not presentation (plan 4.1), so parsing here validates and preserves rather than
 *    normalizing. Decoding is used only to *refuse* a control surface, never to produce an address
 *    the run then visits.
 * 2. An address the executor cannot prove public is refused. DNS is not consulted here - that is the
 *    connection-time check - so a name is reported as `needs-resolution` and only a literal address
 *    is classified outright (plan 4.3, U19).
 */

/** Paths that belong to the service's own control and evaluation surface. */
const CONTROL_PATH_PREFIXES = ['/__control', '/evaluation', '/src/server', '/.git', '/.env']

export type EntryUrlReason =
  | 'url-not-absolute'
  | 'url-malformed'
  | 'unsupported-scheme'
  | 'url-has-credentials'
  | 'url-encoding-invalid'
  | 'control-surface'

export type EntryUrlParse =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reasonCode: EntryUrlReason; readonly message: string }

/** Decodes the path for refusal only; a malformed escape is itself a refusal, not a 500. */
function decodePath(
  url: URL,
): { ok: true; path: string } | { ok: false; reasonCode: EntryUrlReason } {
  try {
    return { ok: true, path: decodeURIComponent(url.pathname) }
  } catch {
    return { ok: false, reasonCode: 'url-encoding-invalid' }
  }
}

export function parseEntryUrl(raw: string): EntryUrlParse {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, reasonCode: 'url-malformed', message: 'The URL is empty.' }
  // A relative reference is a distinct, actionable refusal: the workbench asks for a full address.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed))
    return {
      ok: false,
      reasonCode: 'url-not-absolute',
      message: 'Enter an absolute URL including the scheme, for example https://example.org/page.',
    }
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { ok: false, reasonCode: 'url-malformed', message: 'The URL could not be parsed.' }
  }
  if (!/^https?:$/.test(url.protocol))
    return {
      ok: false,
      reasonCode: 'unsupported-scheme',
      message: 'Only http and https addresses are supported.',
    }
  if (url.username || url.password)
    return {
      ok: false,
      reasonCode: 'url-has-credentials',
      message: 'Credentials in the URL are not accepted; this run is anonymous.',
    }
  const decoded = decodePath(url)
  if (!decoded.ok)
    return {
      ok: false,
      reasonCode: decoded.reasonCode,
      message: 'The URL path contains an invalid percent escape.',
    }
  const control = CONTROL_PATH_PREFIXES.find(
    (prefix) => decoded.path === prefix || decoded.path.startsWith(`${prefix}/`),
  )
  if (control)
    return {
      ok: false,
      reasonCode: 'control-surface',
      message: 'The service control and evaluation surface is not a scannable destination.',
    }
  return { ok: true, url }
}

/** The resolved address of a host, as `dns.lookup` would report it. */
function parseIpv4(address: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address)
  if (!match) return null
  const octets = match.slice(1).map(Number)
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null
}

/** An IPv4-mapped IPv6 address (`::ffff:8.8.8.8`) carries a v4 address that must be re-flagged. */
function ipv4FromMapped(address: string): string | null {
  const match = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(address)
  return match ? match[1]! : null
}

function isPrivateIpv4(octets: readonly number[]): boolean {
  const [a, b] = octets as [number, number, number, number]
  return (
    a >= 224 || // multicast / reserved
    (a === 198 && (b === 18 || b === 19)) || // benchmark networks, including proxy fake-IP ranges
    (a === 192 && b === 0) ||
    (a === 198 && b === 51 && octets[2] === 100) ||
    (a === 203 && b === 0 && octets[2] === 113) ||
    a === 0 || // "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, includes cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
  )
}

/**
 * Fails closed: anything that is not a recognizable public address counts as private, so a parsing
 * gap refuses a destination rather than admitting one.
 */
export function isPrivateAddress(address: string): boolean {
  const value = address.trim()
  if (!value) return true
  const mapped = ipv4FromMapped(value)
  if (mapped) {
    const octets = parseIpv4(mapped)
    return octets ? isPrivateIpv4(octets) : true
  }
  const octets = parseIpv4(value)
  if (octets) return isPrivateIpv4(octets)
  if (isIP(value) !== 6) return true
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1).toLowerCase()
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized)
  if (hexMapped) {
    const a = parseInt(hexMapped[1]!, 16),
      b = parseInt(hexMapped[2]!, 16)
    return isPrivateIpv4([a >> 8, a & 255, b >> 8, b & 255])
  }
  // Only globally routable unicast. Reject compatible, translation, multicast and reserved space.
  if (!/^[23][0-9a-f]{3}:/.test(normalized) || normalized.startsWith('2001:db8:')) return true
  const firstGroup = normalized.split(':')[0] ?? ''
  if (normalized === '::1' || normalized === '::') return true
  if (/^f[cd][0-9a-f]{2}$/.test(firstGroup)) return true // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]$/.test(firstGroup)) return true // fe80::/10 link-local
  return false
}

export type HostClass = 'private-literal' | 'public-literal' | 'needs-resolution'

/** `host` is what `URL.hostname` returns, so an IPv6 literal keeps its brackets. */
export function classifyHost(host: string): HostClass {
  const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  const isLiteral = parseIpv4(literal) !== null || literal.includes(':')
  if (!isLiteral) return 'needs-resolution'
  return isPrivateAddress(literal) ? 'private-literal' : 'public-literal'
}

export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin
  } catch {
    return false
  }
}

/** Display-only: the executed URL keeps its credentials-free form, which parsing already refuses. */
export function stripUserinfo(raw: string): string {
  try {
    const url = new URL(raw)
    url.username = ''
    url.password = ''
    return url.href
  } catch {
    return raw
  }
}
