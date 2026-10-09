import 'dotenv/config'
import { readFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { openCampaignLedger } from '../../evaluation/support/campaign-ledger.ts'
import { reconcileGeneration } from '../../evaluation/support/cost-reconciliation.ts'
const [directory, batchDirectory, requestId] = process.argv.slice(2)
if (!directory || !batchDirectory || !requestId || !process.env.OPENROUTER_API_KEY)
  throw Error(
    'Usage: reconcile-cost <campaign-directory> <batch-directory> <request-id>; OPENROUTER_API_KEY required',
  )
const identity = JSON.parse(await readFile(resolve(directory, 'campaign-id.json'), 'utf8'))
const manifest = JSON.parse(await readFile(resolve(batchDirectory, 'manifest.json'), 'utf8'))
const records = (await readFile(resolve(batchDirectory, 'ledger.jsonl'), 'utf8'))
  .trim()
  .split('\n')
  .map((s) => JSON.parse(s))
const request = records.find((r) => r.requestId === requestId)
if (!request) throw Error('request-not-recorded')
const ledger = await openCampaignLedger({
  campaignId: identity.campaignId,
  directory,
  limitUsd: manifest.costCeilingUsd,
})
const holder = 'reconciliation:' + randomUUID()
try {
  if (!(await ledger.acquireLease(holder)).ok) throw Error('campaign-busy')
  const result = await reconcileGeneration({
    ledger,
    request,
    apiKey: process.env.OPENROUTER_API_KEY,
  })
  await appendFile(
    resolve(directory, 'reconciliation-audit.jsonl'),
    JSON.stringify({
      at: new Date().toISOString(),
      batchDirectory: resolve(batchDirectory),
      ...result,
    }) + '\n',
  )
  console.log(JSON.stringify(result))
} catch (error) {
  await appendFile(
    resolve(directory, 'reconciliation-audit.jsonl'),
    JSON.stringify({
      at: new Date().toISOString(),
      batchDirectory: resolve(batchDirectory),
      requestId,
      outcome: 'unresolved',
      error: String(error),
      automaticResume: false,
    }) + '\n',
  )
  throw error
} finally {
  await ledger.releaseLease(holder)
  ledger.close()
}
