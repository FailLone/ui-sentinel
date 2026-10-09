import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import packet from 'dns-packet'
import type { DnsConfig } from '../../shared/dns-config.ts'
import { createBodyBudget, readPinnedResponse, TransportRefusal } from './transport.ts'

export class ResolutionFailure extends Error {
  constructor(
    readonly detail:
      | 'failed'
      | 'timeout'
      | 'cancelled'
      | 'scope-denied'
      | 'tls'
      | 'invalid-response'
      | 'unavailable',
  ) {
    super(`resolution-${detail}`)
  }
}
export async function systemLookup(host: string): Promise<readonly string[]> {
  host = host.replace(/^\[|\]$/g, '')
  if (isIP(host)) return [host]
  return (await lookup(host, { all: true })).map((answer) => answer.address)
}
const canonical = (host: string) => host.toLowerCase().replace(/\.$/, '')

/** No caching, retries, endpoint discovery, fallback or independent target sockets. */
export function createResolver(config: DnsConfig, system = systemLookup) {
  return {
    mode: config.mode,
    async resolve(host: string, parent?: AbortSignal): Promise<readonly string[]> {
      const controller = new AbortController()
      let timedOut = false
      const cancel = () => controller.abort()
      parent?.addEventListener('abort', cancel, { once: true })
      if (parent?.aborted) cancel()
      const timer = setTimeout(() => {
        timedOut = true
        cancel()
      }, config.timeoutMs)
      let onAbort: () => void = () => {}
      const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(new ResolutionFailure(timedOut ? 'timeout' : 'cancelled'))
        controller.signal.addEventListener('abort', onAbort, { once: true })
        if (controller.signal.aborted) onAbort()
      })
      try {
        // Do not dispatch even a system lookup when already cancelled.
        if (controller.signal.aborted) return await aborted
        const work = async () => {
          const literal = host.replace(/^\[|\]$/g, '')
          if (isIP(literal)) return [literal]
          if (config.mode === 'system') return system(host)
          const name = canonical(host)
          if (!config.allowedHosts.includes(name)) throw new ResolutionFailure('scope-denied')
          const query = async (type: 'A' | 'AAAA') => {
            const url = new URL(config.endpoint!)
            url.searchParams.set(
              'dns',
              packet
                .encode({
                  type: 'query',
                  id: 0,
                  flags: packet.RECURSION_DESIRED,
                  questions: [{ type, name, class: 'IN' }],
                })
                .toString('base64url'),
            )
            const response = await readPinnedResponse({
              url: url.href,
              address: config.bootstrapAddress!,
              method: 'GET',
              headers: { accept: 'application/dns-message' },
              budget: createBodyBudget(65535, 65535),
              signal: controller.signal,
              timeoutMs: config.timeoutMs,
            })
            if (response.status !== 200) throw new ResolutionFailure('unavailable')
            if (
              response.headers
                .find((h) => h.name.toLowerCase() === 'content-type')
                ?.value.split(';')[0]
                ?.trim()
                .toLowerCase() !== 'application/dns-message'
            )
              throw new ResolutionFailure('invalid-response')
            let decoded: packet.DecodedPacket
            try {
              decoded = packet.decode(response.body)
            } catch {
              throw new ResolutionFailure('invalid-response')
            }
            const question = decoded.questions?.[0]
            if (
              packet.decode.bytes !== response.body.length ||
              decoded.type !== 'response' ||
              decoded.id !== 0 ||
              decoded.flag_tc ||
              (decoded.flags! & 0x780f) !== 0 ||
              decoded.questions?.length !== 1 ||
              question?.type !== type ||
              question.class !== 'IN' ||
              canonical(question.name) !== name
            )
              throw new ResolutionFailure('invalid-response')
            // Follow only the aliases present in this authenticated response; never launch recursive
            // extra queries. All address answers, including both families, remain subject to policy.
            const answers = decoded.answers ?? []
            if (answers.length > 256) throw new ResolutionFailure('invalid-response')
            const names = new Set([name])
            for (let i = 0; i < answers.length; i++)
              for (const answer of answers)
                if (answer.type === 'CNAME' && names.has(canonical(answer.name)))
                  names.add(canonical(answer.data))
            return answers.flatMap((answer) => {
              if (answer.type !== 'A' && answer.type !== 'AAAA') return []
              if (answer.class !== 'IN' || !names.has(canonical(answer.name)) || !isIP(answer.data))
                throw new ResolutionFailure('invalid-response')
              return [answer.data]
            })
          }
          const results = await Promise.all([query('A'), query('AAAA')])
          const addresses = [...new Set(results.flat())]
          if (!addresses.length) throw new ResolutionFailure('failed')
          return addresses
        }
        return await Promise.race([work(), aborted])
      } catch (error) {
        if (error instanceof ResolutionFailure) throw error
        if (controller.signal.aborted)
          throw new ResolutionFailure(timedOut ? 'timeout' : 'cancelled')
        if (error instanceof TransportRefusal)
          throw new ResolutionFailure(
            error.detail === 'tls' ? 'tls' : error.detail === 'timeout' ? 'timeout' : 'unavailable',
          )
        throw new ResolutionFailure('failed')
      } finally {
        clearTimeout(timer)
        parent?.removeEventListener('abort', cancel)
        controller.signal.removeEventListener('abort', onAbort)
        controller.abort() // also cancel the sibling family on failure
      }
    },
  }
}
