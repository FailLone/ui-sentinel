import type { CampaignLedger } from './campaign-ledger.ts'
/** Only a metadata GET. No generation, retry, stage mutation or authorization is possible here. */
export async function reconcileGeneration(input: {
  ledger: CampaignLedger
  request: {
    requestId: string
    responseId?: string
    model: string
    actualModel?: string
    provider: string
  }
  apiKey: string
  fetchMetadata?: typeof fetch
}) {
  const { request, ledger } = input
  const row = (await ledger.entries()).find((e) => e.requestId === request.requestId)
  if (
    !row ||
    row.status !== 'unknown' ||
    row.model !== request.model ||
    row.provider !== request.provider ||
    !request.responseId ||
    !request.actualModel
  )
    throw Error('reconciliation-source-mismatch')
  const response = await (input.fetchMetadata ?? fetch)(
    'https://openrouter.ai/api/v1/generation?id=' + encodeURIComponent(request.responseId),
    {
      method: 'GET',
      headers: { authorization: 'Bearer ' + input.apiKey },
      signal: AbortSignal.timeout(20000),
    },
  )
  if (!response.ok) throw Error('reconciliation-metadata-unavailable:' + response.status)
  const evidence = (await response.json()) as any
  const data = evidence?.data
  // Generation metadata may resolve a streamed alias to its dated model revision.
  // Only that exact family plus an eight-digit date is accepted; no other suffix/provider.
  const sameModel =
    data?.model === request.actualModel ||
    (typeof data?.model === 'string' &&
      data.model.startsWith(request.actualModel + '-') &&
      /^\d{8}$/.test(data.model.slice(request.actualModel.length + 1)))
  // Disconnected streams can have null finish_reason. A positive recorded generation duration,
  // completion count and positive billed cost still identify a published completed usage record.
  // A null finish with zero/absent cost remains unknown instead of being settled at zero.
  const ended =
    (typeof data?.finish_reason === 'string' && !!data.finish_reason) ||
    (Number.isFinite(data?.generation_time) &&
      data.generation_time > 0 &&
      Number.isInteger(data?.tokens_completion) &&
      data.tokens_completion >= 0 &&
      data?.total_cost > 0)
  if (
    data?.id !== request.responseId ||
    !sameModel ||
    data?.provider_name !== request.provider ||
    !ended ||
    typeof data?.total_cost !== 'number' ||
    !Number.isFinite(data.total_cost) ||
    data.total_cost < 0
  )
    throw Error('reconciliation-metadata-mismatch')
  // Store stable authoritative fields, so later metadata timing counters cannot break idempotency.
  await ledger.reconcile({
    requestId: request.requestId,
    generationId: data.id,
    model: request.model,
    provider: request.provider,
    actualUsd: data.total_cost,
    evidence: {
      id: data.id,
      model: data.model,
      responseModel: request.actualModel,
      provider: data.provider_name,
      totalCost: data.total_cost,
    },
  })
  return {
    requestId: request.requestId,
    generationId: data.id,
    actualUsd: data.total_cost,
    automaticResume: false,
    spending: await ledger.spending(),
  }
}
