import { classifyHost, isPrivateAddress } from '../../inspection/url.ts'

/**
 * Connection-time address boundary for a `ui-scan` run (plan 4.3).
 *
 * Creation-time validation cannot be the only address check: a DNS answer may differ between the two
 * moments, which is the ordinary shape of DNS rebinding. This layer is deliberately small and pure -
 * it takes the resolved answers and decides - so it can be unit-tested exhaustively and reused by
 * whichever interception mechanism the run installs (route handler or connection-level pause).
 *
 * The refusal rules are conservative on purpose: *every* answer must be public, an empty answer is a
 * failure rather than a pass, and a resolver error refuses. A name is not trusted because it looked
 * public a moment ago.
 */

export type AddressReason = 'private-address' | 'resolution-failed' | 'port-not-allowed'

export interface DestinationCheck {
  readonly allow: boolean
  readonly reasonCode: AddressReason | 'allowed'
  readonly addresses: readonly string[]
  /** True when the destination was admitted because it is a server-configured fixture origin. */
  readonly trusted: boolean
}

export interface DestinationInput {
  /** `URL.hostname`, so an IPv6 literal keeps its brackets. */
  readonly host: string
  readonly port: number
  readonly fixtureOrigins: readonly string[]
  /**
   * True when this exact origin was *declared* by the run or the operator - the entry origin, a
   * configured fixture, or a resource/data origin the request explicitly named.
   *
   * The standard-port rule protects the default public-address case ("only reach standard web
   * ports"). An exact origin the run declared is not that case: the caller has already said which
   * host and port they depend on. This exemption deliberately does *not* cover the private-address
   * rule, so a declared origin cannot be used to reach an internal address.
   */
  readonly declaredOrigin?: boolean
  /** Resolves a hostname to every address it answers with. Absent answers are a failure. */
  readonly lookup: (host: string) => readonly string[]
}

/** The default ports of the two supported schemes. */
const STANDARD_PORTS = [80, 443]

function trustedMatch(host: string, port: number, fixtureOrigins: readonly string[]): boolean {
  for (const origin of fixtureOrigins) {
    try {
      const url = new URL(origin)
      const originHost =
        url.hostname.startsWith('[') && url.hostname.endsWith(']')
          ? url.hostname.slice(1, -1)
          : url.hostname
      const literal = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
      const originPort = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80
      if (originHost === literal && originPort === port) return true
    } catch {
      /* a malformed configured origin is not a match */
    }
  }
  return false
}

/**
 * Decide whether a destination may be connected to.
 *
 * A trusted fixture origin is exempt from the private-address rule because the operator configured
 * it explicitly; it is still held to its own exact host and port, so trusting `127.0.0.1:5055` never
 * admits `127.0.0.1:4111` - the service's own control plane.
 */
export function checkDestination(input: DestinationInput): DestinationCheck {
  const trusted = trustedMatch(input.host, input.port, input.fixtureOrigins)
  if (trusted) return { allow: true, reasonCode: 'allowed', addresses: [], trusted: true }

  if (!STANDARD_PORTS.includes(input.port) && !input.declaredOrigin)
    return { allow: false, reasonCode: 'port-not-allowed', addresses: [], trusted: false }

  const literal =
    input.host.startsWith('[') && input.host.endsWith(']') ? input.host.slice(1, -1) : input.host
  // `isPrivateAddress` fails closed on anything it cannot parse, so a hostname must be classified
  // first: only a literal address is judged directly here, and a name is judged by its answers below.
  if (classifyHost(input.host) !== 'needs-resolution')
    return {
      allow: false,
      reasonCode: isPrivateAddress(literal) ? 'private-address' : 'resolution-failed',
      addresses: [literal],
      trusted: false,
    }

  let answers: readonly string[]
  try {
    answers = input.lookup(input.host)
  } catch {
    return { allow: false, reasonCode: 'resolution-failed', addresses: [], trusted: false }
  }
  if (!answers.length)
    return { allow: false, reasonCode: 'resolution-failed', addresses: [], trusted: false }
  // Every answer must be public. A mixed answer is refused rather than filtered, because which
  // address the socket used is not something this layer can observe.
  if (answers.some((address) => isPrivateAddress(address)))
    return { allow: false, reasonCode: 'private-address', addresses: [...answers], trusted: false }
  return { allow: true, reasonCode: 'allowed', addresses: [...answers], trusted: false }
}
