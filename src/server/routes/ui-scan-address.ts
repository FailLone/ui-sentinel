import { lookup } from 'node:dns/promises'

/**
 * Production DNS lookup for the `ui-scan` address boundary (plan 4.3, U19).
 *
 * The contract resolver is pure and takes the lookup as an argument so its rules can be unit-tested.
 * This is the one place the running server supplies a real one, and it is the *creation-time* check
 * only; the connect-time address boundary in `src/execution/network/` is authoritative, because a
 * name can resolve differently between the two moments (DNS rebinding).
 *
 * It fails closed in the direction that matters: a name that cannot be resolved yields `null`, which
 * the contract reads as "no positive evidence of a private address" rather than as "private". A
 * transient resolver failure must not turn a reachable public site into a permanent refusal, and the
 * connect-time check still refuses the connection if the name turns out to point somewhere private.
 */
export async function resolveHostAddress(host: string): Promise<string | null> {
  try {
    const { address } = await lookup(host)
    return address
  } catch {
    return null
  }
}
