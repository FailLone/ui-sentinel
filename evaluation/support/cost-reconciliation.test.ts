import { it, expect } from 'vitest'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openCampaignLedger } from './campaign-ledger.ts'
import { reconcileGeneration } from './cost-reconciliation.ts'
it('appends idempotent reconciliations, retains unknown rows, survives reopening and never resumes stages', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cost-reconcile-'))
  const options = { directory, campaignId: 'campaign', limitUsd: 2 }
  let ledger = await openCampaignLedger(options)
  try {
    await writeFile(join(directory, 'stages.json'), '[{"status":"finished","passed":false}]')
    await ledger.reserve({
      requestId: 'request',
      runId: 'run',
      phase: 'diagnostic',
      model: 'model',
      provider: 'provider',
      reservedUsd: 0.5,
      priceSource: 'frozen',
    })
    await ledger.markUnknown('request', 'usage-unavailable')
    const request = {
      requestId: 'request',
      responseId: 'generation',
      model: 'model',
      actualModel: 'canonical',
      provider: 'provider',
    }
    const metadata = {
      data: {
        id: 'generation',
        model: 'canonical',
        provider_name: 'provider',
        total_cost: 0.2,
        finish_reason: 'stop',
      },
    }
    const get: typeof fetch = async (_, init) => {
      expect(init?.method).toBe('GET')
      return Response.json(metadata)
    }
    const query = () =>
      reconcileGeneration({ ledger, request, apiKey: 'fixture', fetchMetadata: get })
    await Promise.all([query(), query()])
    expect(await ledger.spending()).toMatchObject({
      knownCostUsd: 0.2,
      unknownCount: 0,
      unknownReservedUsd: 0,
    })
    expect((await ledger.entries())[0]).toMatchObject({
      status: 'unknown',
      reservedUsd: 0.5,
      actualUsd: null,
    })
    ledger.close()
    ledger = await openCampaignLedger(options)
    await query()
    expect((await ledger.spending()).knownCostUsd).toBe(0.2)
    expect(await readFile(join(directory, 'stages.json'), 'utf8')).toBe(
      '[{"status":"finished","passed":false}]',
    )
    metadata.data.total_cost = 0.3
    await expect(query()).rejects.toThrow('conflict')
    metadata.data.provider_name = 'other'
    await expect(query()).rejects.toThrow('mismatch')
    await expect(
      reconcileGeneration({
        ledger,
        request,
        apiKey: 'fixture',
        fetchMetadata: async () => new Response('', { status: 404 }),
      }),
    ).rejects.toThrow('unavailable')
    expect((await ledger.spending()).knownCostUsd).toBe(0.2)
    expect(
      (
        await ledger.reserve({
          requestId: 'next',
          runId: 'next',
          phase: 'diagnostic',
          model: 'model',
          provider: 'provider',
          reservedUsd: 1.81,
          priceSource: 'frozen',
        })
      ).ok,
    ).toBe(false)
  } finally {
    ledger.close()
    await rm(directory, { recursive: true, force: true })
  }
})
it('keeps unknown reservations for unavailable or mismatched metadata and records an over-limit actual without new authorization', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cost-reconcile-negative-'))
  const ledger = await openCampaignLedger({ directory, campaignId: 'negative', limitUsd: 2 })
  try {
    for (const requestId of ['a', 'b']) {
      await ledger.reserve({
        requestId,
        runId: 'run',
        phase: 'diagnostic',
        model: 'model',
        provider: 'provider',
        reservedUsd: 0.5,
        priceSource: 'frozen',
      })
    }
    for (const requestId of ['a', 'b']) await ledger.markUnknown(requestId, 'cancelled')
    const request = {
      requestId: 'a',
      responseId: 'generation-a',
      model: 'model',
      actualModel: 'canonical',
      provider: 'provider',
    }
    const valid = {
      id: 'generation-a',
      model: 'canonical',
      provider_name: 'provider',
      total_cost: 0,
      finish_reason: 'stop',
    }
    for (const data of [
      { ...valid, id: 'other' },
      { ...valid, model: 'other' },
      { ...valid, finish_reason: null },
      { ...valid, total_cost: -1 },
      { ...valid, total_cost: null },
    ]) {
      await expect(
        reconcileGeneration({
          ledger,
          request,
          apiKey: 'fixture',
          fetchMetadata: async () => Response.json({ data }),
        }),
      ).rejects.toThrow('mismatch')
      expect(await ledger.spending()).toMatchObject({
        knownCostUsd: 0,
        unknownCount: 2,
        unknownReservedUsd: 1,
      })
    }
    await expect(
      reconcileGeneration({
        ledger,
        request,
        apiKey: 'fixture',
        fetchMetadata: async () => {
          throw Error('lookup-unavailable')
        },
      }),
    ).rejects.toThrow('lookup-unavailable')
    await reconcileGeneration({
      ledger,
      request,
      apiKey: 'fixture',
      fetchMetadata: async () => Response.json({ data: { ...valid, total_cost: 2.1 } }),
    })
    expect(await ledger.spending()).toMatchObject({
      knownCostUsd: 2.1,
      unknownCount: 1,
      unknownReservedUsd: 0.5,
      exceeded: true,
    })
    await expect(
      ledger.reconcile({
        requestId: 'b',
        generationId: 'generation-a',
        model: 'model',
        provider: 'provider',
        actualUsd: 0,
        evidence: valid,
      }),
    ).rejects.toThrow('conflict')
    expect(
      await ledger.reserve({
        requestId: 'c',
        runId: 'run',
        phase: 'diagnostic',
        model: 'model',
        provider: 'provider',
        reservedUsd: 0.01,
        priceSource: 'frozen',
      }),
    ).toMatchObject({ ok: false, reason: 'cost-unknown' })
    expect(
      (await ledger.entries()).every((e) => e.status === 'unknown' && e.reservedUsd === 0.5),
    ).toBe(true)
  } finally {
    ledger.close()
    await rm(directory, { recursive: true, force: true })
  }
})
it('reconciles a disconnected stream with a dated alias and published usage, but never another model family', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cost-cancelled-'))
  const ledger = await openCampaignLedger({ directory, campaignId: 'cancelled', limitUsd: 2 })
  try {
    await ledger.reserve({
      requestId: 'cancelled',
      runId: 'run',
      phase: 'diagnostic',
      model: 'vendor/model',
      provider: 'provider',
      reservedUsd: 0.1,
      priceSource: 'frozen',
    })
    await ledger.markUnknown('cancelled', 'downstream-disconnected')
    const request = {
      requestId: 'cancelled',
      responseId: 'generation',
      model: 'vendor/model',
      actualModel: 'vendor/model',
      provider: 'provider',
    }
    const data = {
      id: 'generation',
      model: 'vendor/other-20261007',
      provider_name: 'provider',
      total_cost: 0.003,
      finish_reason: null,
      generation_time: 27000,
      tokens_completion: 713,
    }
    const query = () =>
      reconcileGeneration({
        ledger,
        request,
        apiKey: 'fixture',
        fetchMetadata: async () => Response.json({ data }),
      })
    await expect(query()).rejects.toThrow('mismatch')
    data.model = 'vendor/model-20261007'
    data.total_cost = 0
    await expect(query()).rejects.toThrow('mismatch')
    data.total_cost = 0.003
    await query()
    await query()
    expect(await ledger.spending()).toMatchObject({ knownCostUsd: 0.003, unknownCount: 0 })
    expect((await ledger.entries())[0]).toMatchObject({ status: 'unknown', reservedUsd: 0.1 })
  } finally {
    ledger.close()
    await rm(directory, { recursive: true, force: true })
  }
})
