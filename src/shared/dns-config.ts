import { isIP } from 'node:net'

export type DnsConfig = Readonly<{
  mode: 'system' | 'doh'
  timeoutMs: number
  endpoint?: string
  bootstrapAddress?: string
  allowedHosts: readonly string[]
}>

/** Deployment configuration only. Never derive this object from a run or page. */
export function readDnsConfig(env: NodeJS.ProcessEnv): DnsConfig {
  const mode = env.URL_SCAN_DNS_MODE ?? 'system'
  if (mode !== 'system' && mode !== 'doh') throw Error('Invalid URL_SCAN_DNS_MODE')
  const timeoutMs = Number(env.URL_SCAN_DNS_TIMEOUT_MS ?? 5000)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000)
    throw Error('Invalid URL_SCAN_DNS_TIMEOUT_MS (1..15000)')
  if (mode === 'system') return Object.freeze({ mode, timeoutMs, allowedHosts: Object.freeze([]) })
  let endpoint: URL
  try {
    endpoint = new URL(env.URL_SCAN_DOH_ENDPOINT ?? '')
    if (
      endpoint.protocol !== 'https:' ||
      endpoint.username ||
      endpoint.password ||
      endpoint.hash ||
      endpoint.search ||
      isIP(endpoint.hostname.replace(/^\[|\]$/g, ''))
    )
      throw Error()
  } catch {
    throw Error(
      'Invalid URL_SCAN_DOH_ENDPOINT (HTTPS hostname URL without credentials, query or fragment)',
    )
  }
  const bootstrapAddress = env.URL_SCAN_DOH_BOOTSTRAP_ADDRESS ?? ''
  if (!isIP(bootstrapAddress) || bootstrapAddress.includes('%'))
    throw Error('Invalid URL_SCAN_DOH_BOOTSTRAP_ADDRESS (one explicit IP required)')
  const allowedHosts = (env.URL_SCAN_DOH_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  if (
    !allowedHosts.length ||
    allowedHosts.some(
      (host) =>
        host.length > 253 ||
        !host.includes('.') ||
        host.split('.').some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) ||
        isIP(host),
    )
  )
    throw Error('Invalid URL_SCAN_DOH_ALLOWED_HOSTS (comma-separated exact DNS names required)')
  return Object.freeze({
    mode,
    timeoutMs,
    endpoint: endpoint.href,
    bootstrapAddress,
    allowedHosts: Object.freeze([...new Set(allowedHosts)]),
  })
}
