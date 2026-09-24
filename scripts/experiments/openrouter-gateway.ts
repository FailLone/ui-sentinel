import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { appendFile } from 'node:fs/promises'

export const AGENT_MODEL = 'deepseek/deepseek-v4.1-flash'
export const VISION_MODEL = 'qwen/qwen3.7-plus'
export async function startGateway(
  key: string,
  directory: string,
  upstreamFetch: typeof fetch = fetch,
  spending?: { limitUsd: number; estimateCost: (body: Record<string, unknown>) => number },
  agentReasoning: 'low' | 'disabled' = 'low',
) {
  const token = randomBytes(24).toString('hex')
  let active: {
    id: string
    limit: number
    deadline: number
    requests: any[]
    reasoning: 'low' | 'disabled'
    guardInput?: (body: Record<string, any>) => void
  } | null = null
  const controllers = new Set<AbortController>()
  let accountedUsd = 0
  let reservedUsd = 0
  let knownCostUsd = 0
  let unknownReservedUsd = 0
  let unknownCosts = 0
  const integrityViolations: { run: string; error: string }[] = []
  const redact = (value: string) =>
    value.split(key).join('[redacted]').split(token).join('[local-token]')
  const server = createServer(async (req, res) => {
    const reply = (status: number, message: string) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: { message } }))
    }
    if (req.headers.authorization !== `Bearer ${token}`) return reply(401, 'Unauthorized')
    if (req.url !== '/v1/chat/completions' || req.method !== 'POST')
      return reply(404, 'Only chat completions permitted')
    const run = active
    if (!run || run.requests.length >= run.limit || Date.now() >= run.deadline)
      return reply(429, 'experiment-budget-exhausted')
    let body: any
    try {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      body = JSON.parse(Buffer.concat(chunks).toString())
    } catch {
      return reply(400, 'invalid JSON')
    }
    if (active !== run || run.requests.length >= run.limit || Date.now() >= run.deadline)
      return reply(429, 'experiment-budget-exhausted')
    if (![AGENT_MODEL, VISION_MODEL].includes(body.model))
      return reply(400, 'Unexpected model; fallback disabled')
    if (body.model === AGENT_MODEL && run.guardInput) {
      try {
        run.guardInput(body)
      } catch (error) {
        const violation = { run: run.id, error: redact(String(error)) }
        integrityViolations.push(violation)
        await appendFile(
          `${directory}/integrity-violations.jsonl`,
          redact(JSON.stringify({ ...violation, body })) + '\n',
        )
        return reply(409, violation.error)
      }
    }
    // Same policy for both arms. SDK-specific tool/message schemas remain intact.
    body.max_tokens = 4096
    delete body.max_completion_tokens
    body.reasoning =
      body.model === AGENT_MODEL && run.reasoning === 'low' ? { effort: 'low' } : { enabled: false }
    const provider =
      body.model === AGENT_MODEL
        ? process.env.EXPERIMENT_AGENT_PROVIDER
        : process.env.EXPERIMENT_VISION_PROVIDER
    body.provider = {
      allow_fallbacks: false,
      require_parameters: true,
      ...(provider ? { only: [provider] } : {}),
    }
    if (body.stream) body.stream_options = { include_usage: true }
    const reservation = spending?.estimateCost(body) ?? 0
    if (
      spending &&
      (!Number.isFinite(reservation) ||
        reservation < 0 ||
        accountedUsd + reservedUsd + reservation > spending.limitUsd)
    )
      return reply(429, 'experiment-spending-limit')
    reservedUsd += reservation
    const record: any = {
      run: run.id,
      seq: run.requests.length + 1,
      model: body.model,
      startedAt: new Date().toISOString(),
      inputBytes: Buffer.byteLength(JSON.stringify(body)),
      status: 'pending',
      usage: null,
    }
    run.requests.push(record)
    const start = Date.now(),
      controller = new AbortController()
    const downstreamClosed = () => {
      if (!res.writableEnded) controller.abort(new Error('downstream-disconnected'))
    }
    res.once('close', downstreamClosed)
    controllers.add(controller)
    const timer = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(60000, run.deadline - Date.now())),
    )
    try {
      await appendFile(
        `${directory}/requests.jsonl`,
        redact(JSON.stringify({ event: 'request', ...record, body })) + '\n',
      )
      const upstream = await upstreamFetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      record.firstByteMs = Date.now() - start
      record.httpStatus = upstream.status
      const chunks: Uint8Array[] = []
      if (body.stream)
        res.writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') ?? 'application/json',
        })
      for await (const chunk of upstream.body!) {
        chunks.push(chunk)
        if (body.stream) res.write(chunk)
      }
      const raw = Buffer.concat(chunks).toString()
      const events = body.stream
        ? raw
            .split('\n')
            .filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'))
            .flatMap((l) => {
              try {
                return [JSON.parse(l.slice(6))]
              } catch {
                return []
              }
            })
        : [JSON.parse(raw)]
      for (const event of events) {
        if (event.usage) record.usage = event.usage
        if (event.id) record.responseId = event.id
        if (event.provider) record.provider = event.provider
      }
      record.status = upstream.ok && !events.some((e: any) => e.error) ? 'success' : 'error'
      await appendFile(
        `${directory}/responses.jsonl`,
        redact(JSON.stringify({ run: run.id, seq: record.seq, events })) + '\n',
      )
      if (!body.stream) {
        res.writeHead(upstream.status, { 'content-type': 'application/json' })
        res.end(raw)
      } else res.end()
    } catch (error) {
      record.status = 'error'
      record.error = redact(String(error))
      if (!res.destroyed) {
        if (!res.headersSent) reply(502, 'upstream request failed; see redacted ledger')
        else res.end()
      }
    } finally {
      clearTimeout(timer)
      res.removeListener('close', downstreamClosed)
      record.durationMs = Date.now() - start
      reservedUsd -= reservation
      const cost = record.usage?.cost
      if (typeof cost === 'number' && Number.isFinite(cost) && cost >= 0) {
        accountedUsd += cost
        knownCostUsd += cost
      } else {
        accountedUsd += reservation
        unknownReservedUsd += reservation
        unknownCosts++
      }
      try {
        await appendFile(`${directory}/ledger.jsonl`, JSON.stringify(record) + '\n')
      } finally {
        controllers.delete(controller)
      }
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  return {
    url: `http://127.0.0.1:${(server.address() as any).port}/v1`,
    token,
    begin(
      id: string,
      limit = 30,
      durationMs = 300000,
      policy?: {
        agentReasoning: 'low' | 'disabled'
        guardInput?: (body: Record<string, any>) => void
      },
    ) {
      if (active) throw Error('Previous experiment still active')
      active = {
        id,
        limit,
        deadline: Date.now() + durationMs,
        requests: [],
        reasoning: policy?.agentReasoning ?? agentReasoning,
        guardInput: policy?.guardInput,
      }
    },
    async end() {
      const result = active
      active = null
      for (const c of controllers) c.abort()
      const until = Date.now() + 3000
      while (controllers.size && Date.now() < until) await new Promise((r) => setTimeout(r, 20))
      return result?.requests ?? []
    },
    async close() {
      active = null
      for (const c of controllers) c.abort()
      server.closeAllConnections()
      await new Promise<void>((r) => server.close(() => r()))
    },
    spending: () => ({
      accountedUsd,
      knownCostUsd,
      unknownReservedUsd,
      reservedUsd,
      unknownCosts,
      limitUsd: spending?.limitUsd ?? null,
    }),
    integrityViolations: () => [...integrityViolations],
    redact,
  }
}
