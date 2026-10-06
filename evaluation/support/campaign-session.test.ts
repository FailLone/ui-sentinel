import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, hostname } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { campaignIdentity, openCampaignSession, writeJson } from './campaign-session.ts'
import { openCampaignLedger } from './campaign-ledger.ts'
import { sealStage, verifyStageSeal } from './stage-seal.ts'
import { readFormalSource } from './formal-source.ts'
const dirs: string[] = []
async function dir() {
  const d = await mkdtemp(join(tmpdir(), 'p3-session-'))
  dirs.push(d)
  return d
}
afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true })
})
const reservation = (id: string, phase = 'visual-diagnostic') => ({
  requestId: id,
  runId: 'r-' + id,
  phase,
  model: 'fixed',
  provider: 'fixed',
  reservedUsd: 0.6,
  priceSource: 'test-only',
})
it('C01 simultaneous reservations cannot double spend', async () => {
  const s = await openCampaignSession(await dir(), '1')
  try {
    const results = await Promise.all([
      s.ledger.reserve(reservation('a')),
      s.ledger.reserve(reservation('b')),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect((await s.ledger.spending()).accountedUsd).toBeCloseTo(0.6)
  } finally {
    await s.close()
  }
})
it('C02/C04 holds a live lease and accumulates visual and business phases after reopening', async () => {
  const directory = await dir(),
    first = await openCampaignSession(directory, '2')
  await first.ledger.reserve(reservation('visual'))
  await first.ledger.markUnknown('visual', 'no-usage')
  await expect(openCampaignSession(directory, '2')).rejects.toThrow('campaign-lease-held')
  await first.close()
  const next = await openCampaignSession(directory, '2')
  try {
    await next.ledger.reserve(reservation('business', 'business-formal'))
    await next.ledger.settle('business', 0.4)
    expect((await next.ledger.spending()).accountedUsd).toBeCloseTo(1)
    await expect(openCampaignSession(directory, '5')).rejects.toThrow('campaign-limit-immutable')
  } finally {
    await next.close()
  }
})
it('R07/C04 recovers only a dead owner, preserves unknown cost and refuses automatic continuation', async () => {
  const directory = await dir(),
    campaignId = await campaignIdentity(directory)
  const ledger = await openCampaignLedger({ directory, campaignId, limitUsd: 2 })
  await ledger.acquireLease(JSON.stringify({ host: hostname(), pid: 2147483647 }))
  await ledger.reserve(reservation('lost'))
  const stage = join(directory, 'stage')
  await writeJson(join(directory, 'stages.json'), [
    { directory: stage, status: 'running', passed: false },
  ])
  ledger.close()
  await expect(openCampaignSession(directory, '2')).rejects.toThrow('campaign-recovered-incomplete')
  expect(JSON.parse(await readFile(join(stage, 'recovery.json'), 'utf8'))).toMatchObject({
    passed: false,
    automaticResume: false,
  })
  const next = await openCampaignSession(directory, '2')
  try {
    expect((await next.ledger.spending()).unknownReservedUsd).toBeCloseTo(0.6)
  } finally {
    await next.close()
  }
})
it('R02 a passed manifest without actual sealed evidence cannot authorize a formal run', async () => {
  const directory = await dir(),
    expected = { campaignId: 'c', buildHash: 'a'.repeat(64) }
  await writeJson(join(directory, 'manifest.json'), {
    ...expected,
    kind: 'visual-focus-diagnostic',
    mode: 'real',
    passed: true,
    fixtureRevision: {
      revision: 'test',
      hash: 'f'.repeat(64),
      purpose: 'holdout',
      reviewedBy: 'reviewer',
      reviewedAt: '2026-10-06',
    },
  })
  expect((await readFormalSource(directory, expected)).reason).toBe('diagnostic-evidence-unsealed')
  await sealStage(directory)
  expect((await readFormalSource(directory, expected)).reason).toBe('diagnostic-evidence-unsealed')
})
it('E03 sealing verifies bytes and missing files, not just a passed field', async () => {
  const directory = await dir()
  await writeJson(join(directory, 'manifest.json'), { passed: true })
  await writeFile(join(directory, 'receipt.json'), 'original')
  await sealStage(directory)
  expect(await verifyStageSeal(directory, ['manifest.json', 'receipt.json'])).toBe(true)
  await writeFile(join(directory, 'receipt.json'), 'modified')
  expect(await verifyStageSeal(directory, ['manifest.json', 'receipt.json'])).toBe(false)
  await rm(join(directory, 'receipt.json'))
  expect(await verifyStageSeal(directory, ['manifest.json'])).toBe(false)
})

it('C02 accumulates one account across five separate stage processes', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { pathToFileURL } = await import('node:url')
  const { resolve } = await import('node:path')
  const directory = await dir(),
    moduleUrl = pathToFileURL(resolve('evaluation/support/campaign-session.ts')).href
  for (const phase of [
    'smoke',
    'visual-diagnostic',
    'visual-formal',
    'business-diagnostic',
    'business-formal',
  ]) {
    const code = `import {openCampaignSession} from ${JSON.stringify(moduleUrl)}; const s=await openCampaignSession(${JSON.stringify(directory)},'2'); await s.ledger.reserve({requestId:${JSON.stringify(phase)},runId:'test-run',phase:${JSON.stringify(phase)},model:'fixed',provider:'fixed',reservedUsd:0.3,priceSource:'test'}); await s.ledger.markUnknown(${JSON.stringify(phase)},'test-unknown'); await s.close();`
    await promisify(execFile)(process.execPath, [
      '--import',
      'tsx',
      '--input-type=module',
      '-e',
      code,
    ])
  }
  const final = await openCampaignSession(directory, '2')
  try {
    expect((await final.ledger.spending()).unknownReservedUsd).toBeCloseTo(1.5)
    expect(await final.ledger.entries()).toHaveLength(5)
  } finally {
    await final.close()
  }
})
