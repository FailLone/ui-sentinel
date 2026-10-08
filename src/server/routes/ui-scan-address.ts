import { config } from '../../shared/config.ts'
import { createResolver } from '../../execution/network/resolver.ts'
import { isPrivateAddress } from '../../inspection/url.ts'

/** Admission is advisory; every connection resolves and checks all answers again. */
export async function resolveHostAddress(host: string): Promise<string | null> {
  try {
    const addresses = await createResolver(config.urlScan.dns).resolve(host)
    // Preserve the contract's single-address interface without hiding a mixed unsafe answer.
    return addresses.find(isPrivateAddress) ?? addresses[0] ?? null
  } catch {
    // Existing deferred-admission behaviour. Execution fails closed with detailed diagnostics.
    return null
  }
}
