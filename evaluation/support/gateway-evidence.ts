import { createHash } from 'node:crypto'
import type { PlanRow } from './execution-plan.ts'

/**
 * Reading the validation gateway's own logs back into scorer inputs.
 *
 * The scorer's binding and provenance assertions ask two questions only the *gateway* can answer: did
 * the agent really make a semantic binding call, and did the image that the receipt hashes really go
 * to the vision model? The product's report cannot answer either - it is the thing under test. So the
 * runner reads `requests.jsonl` (what was sent) and `responses.jsonl` (what came back) and pairs them.
 *
 * The pairing matters as much as the parsing: gateway runs are named `<case>-<repeat>`, which is a
 * prefix relationship, so a substring match would let D0-1's requests satisfy D0-3's evidence. Every
 * lookup here is an exact (run, seq) match for that reason.
 */

export interface GatewayCall {
  readonly model: string
  readonly tool: string
  readonly runId: string
  readonly body: Record<string, unknown>
}

export interface VisionExchange {
  readonly sha256: string
  /** The parsed raw vision response, or `null` when it did not survive or did not parse. */
  readonly raw: unknown
}

/** The gateway run id for a planned row. Exact, because `<case>-<repeat>` is a prefix relationship. */
export function rowRunId(row: Pick<PlanRow, 'case' | 'repeat'> & Partial<PlanRow>): string {
  return `${row.case}-${row.repeat}`
}

interface WireRecord {
  readonly run?: unknown
  readonly seq?: unknown
  readonly model?: unknown
  readonly body?: unknown
  readonly events?: unknown
}

const sha256 = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')

/** The text of one message-shaped object: a plain string, or the concatenated text parts. */
function messageText(message: unknown): string {
  const content = (message as { content?: unknown } | undefined)?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (part): part is { type: string; text: string } =>
        !!part &&
        typeof part === 'object' &&
        (part as any).type === 'text' &&
        typeof (part as any).text === 'string',
    )
    .map((part) => part.text)
    .join('')
}

/**
 * The assistant text of one choice, from either response shape.
 *
 * A streamed response puts the text on `delta`; a complete one nests it under `message`. The product's
 * vision request is non-streaming, but the gateway accepts both, so a reader that only understood one
 * shape would silently report "no response" for the other.
 */
function choiceText(choice: unknown): string {
  const container = (choice as { delta?: unknown; message?: unknown } | undefined) ?? {}
  return messageText(container.message ?? container.delta ?? choice)
}

/** The finished tool calls of one choice, for the non-streaming case. */
function choiceMessage(choice: unknown): unknown {
  const container = (choice as { delta?: unknown; message?: unknown } | undefined) ?? {}
  return container.message ?? container.delta ?? choice
}

function imageUrlsOf(body: unknown): string[] {
  const messages = (body as { messages?: unknown } | undefined)?.messages
  if (!Array.isArray(messages)) return []
  const urls: string[] = []
  for (const message of messages) {
    const content = (message as { content?: unknown } | undefined)?.content
    if (!Array.isArray(content)) continue
    for (const part of content) {
      const url = (part as { image_url?: { url?: unknown } } | undefined)?.image_url?.url
      if (typeof url === 'string' && url.startsWith('data:')) urls.push(url)
    }
  }
  return urls
}

/**
 * The tool calls a model really made, reassembled from the response stream.
 *
 * OpenRouter fragments a call across deltas: the first carries the function name, the rest append its
 * argument JSON in pieces. A call whose fragments never close is still a call - it is reported with an
 * empty body rather than dropped, because the scorer's question is whether the binding call happened,
 * and "it happened but its arguments were lost" is a different fact from "it never happened".
 */
export function assembleToolCalls(input: {
  requests: readonly WireRecord[]
  responses: readonly WireRecord[]
  /** The gateway run id of the row being read, `<case>-<repeat>`. Scopes the scan to that row only. */
  rowRunId: string
  /** The product run id stamped on each call, which is what the scorer matches against. */
  runId: string
}): GatewayCall[] {
  const responses = new Map(
    input.responses
      .filter((r) => typeof r.run === 'string' && typeof r.seq === 'number')
      .map((r) => [`${r.run}:${r.seq}`, r]),
  )
  const calls: GatewayCall[] = []
  for (const request of input.requests) {
    if (typeof request.run !== 'string' || typeof request.seq !== 'number') continue
    // Another repeat's calls are a different experiment; reading them here would attribute a
    // neighbouring row's probe to this one and pass the binding check on someone else's evidence.
    if (request.run !== input.rowRunId) continue
    const response = responses.get(`${request.run}:${request.seq}`)
    if (!response || !Array.isArray(response.events)) continue
    // A call is assembled per (event, choice, index): the index is the model's own slot for it, and a
    // message-shaped non-streaming response carries the finished call in one piece.
    const pending = new Map<string, { tool: string; args: string }>()
    for (const event of response.events) {
      for (const [choiceIndex, choice] of ((event as any)?.choices ?? []).entries()) {
        const container = (choiceMessage(choice) ?? {}) as {
          tool_calls?: readonly {
            index?: number
            function?: { name?: unknown; arguments?: unknown }
          }[]
        }
        for (const call of container.tool_calls ?? []) {
          const key = `${choiceIndex}:${call.index ?? 0}`
          const current = pending.get(key) ?? { tool: '', args: '' }
          if (typeof call.function?.name === 'string' && call.function.name)
            current.tool = call.function.name
          if (typeof call.function?.arguments === 'string') current.args += call.function.arguments
          pending.set(key, current)
        }
      }
    }
    for (const [, call] of pending) {
      if (!call.tool) continue
      let body: Record<string, unknown> = {}
      try {
        const parsed = JSON.parse(call.args)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
          body = parsed as Record<string, unknown>
      } catch {
        // Truncated or malformed arguments: the call is kept, the arguments are not guessed.
      }
      calls.push({
        model: typeof request.model === 'string' ? request.model : '',
        tool: call.tool,
        runId: input.runId,
        body,
      })
    }
  }
  return calls
}

/**
 * The images really sent to the vision model, each paired with the raw response it produced.
 *
 * The image hash comes from the request's own data URL, so it is the bytes that left this process -
 * the same bytes the receipt's `screenshotSha` must equal. A response that never arrived or never
 * parsed is `null`: an empty object would be indistinguishable from a model that returned `{}`, and
 * the provenance checks must fail on a lost response rather than read it as an answer.
 */
export function extractVisionExchanges(input: {
  requests: readonly WireRecord[]
  responses: readonly WireRecord[]
  runId: string
  visionModel: string
}): VisionExchange[] {
  const responses = new Map(
    input.responses
      .filter((r) => typeof r.run === 'string' && typeof r.seq === 'number')
      .map((r) => [`${r.run}:${r.seq}`, r]),
  )
  const exchanges: VisionExchange[] = []
  for (const request of input.requests) {
    if (request.run !== input.runId || request.model !== input.visionModel) continue
    const urls = imageUrlsOf(request.body)
    if (!urls.length) continue
    const response =
      typeof request.seq === 'number' ? responses.get(`${request.run}:${request.seq}`) : undefined
    const text = Array.isArray(response?.events)
      ? (response!.events as any[]).map((event) => choiceText(event?.choices?.[0])).join('')
      : ''
    let raw: unknown = null
    try {
      raw = JSON.parse(text)
    } catch {
      raw = null
    }
    for (const url of urls)
      exchanges.push({ sha256: sha256(Buffer.from(url.split(',')[1] ?? '', 'base64')), raw })
  }
  return exchanges
}
