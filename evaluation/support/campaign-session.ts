import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import { mkdir, readFile, writeFile, rename, link, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { openCampaignLedger, resolveLimit } from './campaign-ledger.ts'

export async function writeJson(path: string, value: unknown) {
  const temp = path + '.' + randomUUID() + '.tmp'
  await mkdir(resolve(path, '..'), { recursive: true })
  await writeFile(temp, JSON.stringify(value, null, 2) + '\n')
  await rename(temp, path)
}
export async function campaignIdentity(directory: string): Promise<string> {
  await mkdir(directory, { recursive: true })
  const file = resolve(directory, 'campaign-id.json')
  const temporary = file + '.' + randomUUID() + '.tmp'
  await writeFile(temporary, JSON.stringify({ campaignId: randomUUID() }))
  try {
    await link(temporary, file)
  } catch (e) {
    if ((e as any).code !== 'EEXIST') throw e
  } finally {
    await unlink(temporary)
  }
  const value = JSON.parse(await readFile(file, 'utf8'))
  if (typeof value.campaignId !== 'string' || !value.campaignId) throw Error('invalid-campaign-id')
  return value.campaignId
}

/** All runners share this durable account. The holder owns cleanup, including startup failures. */
export async function openCampaignSession(
  directory: string,
  rawLimit = process.env.VALIDATION_MAX_COST_USD,
) {
  const campaignId = await campaignIdentity(directory),
    limitUsd = resolveLimit(rawLimit).limitUsd
  const ledger = await openCampaignLedger({ campaignId, directory, limitUsd })
  const holder = JSON.stringify({ host: hostname(), pid: process.pid, nonce: randomUUID() })
  const lease = await ledger.acquireLease(holder)
  if (!lease.ok) {
    let dead = false
    try {
      const old = JSON.parse(lease.holder!)
      if (old.host === hostname() && Number.isSafeInteger(old.pid) && old.pid > 0) {
        try {
          process.kill(old.pid, 0)
        } catch (e) {
          dead = (e as any).code === 'ESRCH'
        }
      }
    } catch {}
    if (dead) {
      // Recovery preserves unknown costs and never resumes a partly completed matrix.
      for (const entry of await ledger.entries())
        if (entry.status === 'held')
          await ledger.markUnknown(entry.requestId, 'owner-process-terminated')
      const stages = await readStages(directory)
      for (const stage of stages)
        if (stage.status === 'running') {
          stage.status = 'interrupted'
          stage.passed = false
          await writeJson(resolve(stage.directory, 'recovery.json'), {
            passed: false,
            reason: 'owner-process-terminated',
            automaticResume: false,
          })
        }
      await writeJson(resolve(directory, 'stages.json'), stages)
      await writeJson(resolve(directory, 'recovery.json'), {
        previousHolder: lease.holder,
        spending: await ledger.spending(),
        passed: false,
      })
      await ledger.releaseLease(lease.holder!)
    }
    ledger.close()
    throw Error(
      dead
        ? 'campaign-recovered-incomplete: inspect recovery.json before starting a new batch'
        : `campaign-lease-held:${lease.holder}`,
    )
  }
  let closed = false
  return {
    campaignId,
    directory: resolve(directory),
    ledger,
    limitUsd,
    async startStage(stageDirectory: string, kind: string) {
      const stages = await readStages(directory)
      if (stages.some((s) => s.directory === resolve(stageDirectory)))
        throw Error('stage-already-exists')
      stages.push({ directory: resolve(stageDirectory), kind, status: 'running', passed: false })
      await writeJson(resolve(directory, 'stages.json'), stages)
    },
    async finishStage(stageDirectory: string, passed: boolean) {
      const stages = await readStages(directory)
      const stage = stages.find((s) => s.directory === resolve(stageDirectory))
      if (!stage) throw Error('stage-not-registered')
      stage.status = 'finished'
      stage.passed = passed
      await writeJson(resolve(directory, 'stages.json'), stages)
      await writeJson(resolve(directory, 'campaign-summary.json'), {
        campaignId,
        stages,
        spending: await ledger.spending(),
        requests: await ledger.entries(),
        passed: false,
        note: 'Individual stages do not imply P4 acceptance.',
      })
    },
    async close() {
      if (closed) return
      closed = true
      try {
        await ledger.releaseLease(holder)
      } finally {
        ledger.close()
      }
    },
  }
}
async function readStages(directory: string): Promise<any[]> {
  try {
    const value = JSON.parse(await readFile(resolve(directory, 'stages.json'), 'utf8'))
    if (!Array.isArray(value)) throw Error('invalid-stages')
    return value
  } catch (e) {
    if ((e as any).code === 'ENOENT') return []
    throw e
  }
}
