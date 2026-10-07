/** Evaluation-side joins: sealed hashes alone do not prove request or accounting ownership. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { Compiled } from '../../src/agent/decisions/jev-provider/compile.ts'
import {
  normalizeResponse,
  readUsage,
  unknownUsage,
} from '../../src/agent/decisions/jev-provider/response.ts'
import { parseStrictJson } from '../../src/agent/decisions/jev-provider/strict-json.ts'
import { sha256, type Profile } from '../../src/agent/decisions/jev-provider/profile.ts'
import {
  usageSchema,
  type NormalizedReceipt,
  type Usage,
} from '../../src/agent/decisions/exploration/receipt.ts'
import { scoreResultSchema } from '../../src/agent/decisions/exploration/result.ts'
import { safeFile } from './evidence.ts'
import type { inspectLedger } from './ledger.ts'

const eventSchema = z
  .object({
    attemptId: z.string().min(1),
    requestDigest: z.string(),
    wireDigest: z.string().nullable(),
    stage: z.enum(['prepared', 'dispatch', 'response', 'failure']),
    wire: z.string().optional(),
    mapping: z.unknown().optional(),
    byteLength: z.number().int().nonnegative().optional(),
    status: z.number().int().optional(),
    responseText: z.string().optional(),
    responseDigest: z.string().optional(),
    receipt: z.unknown().optional(),
    usage: usageSchema.optional(),
    code: z.string().optional(),
    durationMs: z.number().nonnegative().optional(),
  })
  .strict()
type Event = z.infer<typeof eventSchema>
export const semanticReasons = [
  'uncertain',
  'insufficient-information',
  'requires-agent-investigation',
]
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sameUsage = (a: Usage, b: Usage) =>
  a.status === b.status &&
  a.costUsd === b.costUsd &&
  a.inputTokens === b.inputTokens &&
  a.outputTokens === b.outputTokens &&
  a.source === b.source

export function evidenceAuditor(
  evidence: string,
  accounting: ReturnType<typeof inspectLedger>,
  quoteUsd: number | null,
) {
  const groups = new Map<string, Map<Event['stage'], Event>>()
  const attempts = join(evidence, 'attempts')
  for (const file of existsSync(attempts) ? readdirSync(attempts) : []) {
    const match = /^(.*)-(prepared|dispatch|response|failure)\.json$/.exec(file)
    if (!match) throw new Error('unexpected-attempt-file')
    const event = eventSchema.parse(
      JSON.parse(readFileSync(safeFile(evidence, `attempts/${file}`), 'utf8')),
    )
    if (event.stage !== match[2]) throw new Error('attempt-stage-binding')
    const group = groups.get(match[1]) ?? new Map<Event['stage'], Event>()
    group.set(event.stage, event)
    groups.set(match[1], group)
  }
  const seen = new Set<string>()
  const dispatched = new Set<string>()
  return {
    row(
      key: string,
      result: z.infer<typeof scoreResultSchema>,
      compiled: Compiled,
      profile: Profile,
    ) {
      if (seen.has(result.trace.attemptId)) throw new Error('duplicate-result-attempt')
      seen.add(result.trace.attemptId)
      const events = groups.get(key) ?? new Map<Event['stage'], Event>()
      groups.delete(key)
      const prepared = events.get('prepared'),
        dispatch = events.get('dispatch'),
        response = events.get('response'),
        failure = events.get('failure')
      if (events.size && !result.trace.attempted) throw new Error('unattempted-provider-events')
      if (
        result.trace.attempted &&
        (!events.size || result.trace.requestDigest !== compiled.requestDigest)
      )
        throw new Error('attempt-evidence-missing')
      for (const event of events.values()) {
        if (
          event.attemptId !== result.trace.attemptId ||
          event.requestDigest !== compiled.requestDigest ||
          (event.wireDigest !== compiled.wireDigest &&
            !(event.stage === 'failure' && !prepared && event.wireDigest === null))
        )
          throw new Error('attempt-event-binding')
      }
      if (
        prepared &&
        (prepared.wire !== compiled.wire ||
          prepared.byteLength !== compiled.byteLength ||
          !equal(prepared.mapping, compiled.mapping))
      )
        throw new Error('prepared-request-mismatch')
      if (
        (dispatch && !prepared) ||
        (response && !dispatch) ||
        (result.trace.attempted && !response && !failure)
      )
        throw new Error('attempt-event-chain')
      const ticket = accounting.tickets[result.trace.attemptId]
      if (!!dispatch !== !!ticket) throw new Error('dispatch-ledger-mismatch')
      if (ticket && ticket.quote !== quoteUsd) throw new Error('ledger-quote-mismatch')
      if (dispatch) {
        if (dispatched.has(dispatch.attemptId)) throw new Error('duplicate-dispatch-attempt')
        dispatched.add(dispatch.attemptId)
      }
      let normalized: NormalizedReceipt | null = null
      let observed: Usage = { ...unknownUsage }
      if (response) {
        if (
          typeof response.responseText !== 'string' ||
          sha256(response.responseText) !== response.responseDigest ||
          response.status === undefined ||
          response.status < 200 ||
          response.status >= 300
        )
          throw new Error('response-binding')
        let raw: unknown
        try {
          raw = parseStrictJson(response.responseText)
        } catch {
          /* Invalid JSON is failure evidence, never advice. */
        }
        observed = readUsage(raw)
        if (!response.usage || !sameUsage(response.usage, observed))
          throw new Error('response-usage-mismatch')
        try {
          normalized = normalizeResponse(raw, compiled, profile)
        } catch {
          /* Preserve invalid-response failures. */
        }
        if (response.receipt !== undefined && !equal(response.receipt, normalized))
          throw new Error('response-receipt-mismatch')
        if (failure?.usage && !sameUsage(failure.usage, observed))
          throw new Error('failure-usage-mismatch')
      } else if (failure) {
        if (!failure.usage || !failure.code) throw new Error('failure-evidence-missing')
        observed = failure.usage
        // Without a raw response, a sent request has unknown cost. An abort before fetch may
        // retain the transport's explicit zero usage; no arbitrary known fee is accepted.
        if (
          observed.status === 'known' &&
          (observed.costUsd !== 0 ||
            observed.inputTokens !== 0 ||
            observed.outputTokens !== 0 ||
            (dispatch && failure.code !== 'aborted'))
        )
          throw new Error('unsupported-known-cost')
      }
      if (
        !dispatch &&
        (events.size
          ? observed.status !== 'known' || observed.costUsd !== 0
          : result.trace.usage.status !== 'known' || result.trace.usage.costUsd !== 0)
      )
        throw new Error('undispatched-cost')
      if (ticket && ticket.cost !== (observed.status === 'known' ? observed.costUsd : null))
        throw new Error('ledger-response-cost-mismatch')
      const semantic = result.kind === 'handoff' && semanticReasons.includes(result.reasonCode)
      if (result.kind === 'ranked' || semantic) {
        if (!response || !normalized) throw new Error('advice-response-missing')
        if (!sameUsage(result.trace.usage, observed)) throw new Error('result-usage-mismatch')
      } else if (
        result.trace.usage.status === 'known' &&
        result.trace.attempted &&
        !sameUsage(result.trace.usage, observed)
      ) {
        throw new Error('result-usage-mismatch')
      }
      if (
        semantic &&
        (normalized?.kind !== 'handoff' || normalized.reasonCode !== result.reasonCode)
      )
        throw new Error('handoff-replay-mismatch')
      return { normalized, semanticHandoff: semantic && normalized?.kind === 'handoff' }
    },
    finish() {
      if (groups.size) throw new Error('unrepresented-provider-attempt')
      if (Object.keys(accounting.tickets).some((id) => !dispatched.has(id)))
        throw new Error('unrepresented-paid-attempt')
    },
  }
}
