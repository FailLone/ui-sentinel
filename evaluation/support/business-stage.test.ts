import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { prepareBusinessStage, BUSINESS_PROFILE } from './business-stage.ts'
import { writeJson, openCampaignSession } from './campaign-session.ts'
import { verifyStageSeal } from './stage-seal.ts'
const dirs: string[] = []
const beforeExit = process.exitCode
async function directory() {
  const d = await mkdtemp(join(tmpdir(), 'p3-business-'))
  dirs.push(d)
  return d
}
afterEach(async () => {
  process.exitCode = beforeExit
  for (const d of dirs.splice(0)) await rm(d, { force: true, recursive: true })
})
const common = {
  build: { hash: 'test-build', files: {} },
  providers: { agent: 'Alibaba', vision: 'Alibaba' },
}
it('B02 business pins visual off even in a contaminated caller environment', () => {
  expect({ ...{ EXECUTION_VISUAL_DISCOVERY: '1' }, ...BUSINESS_PROFILE }).toEqual({
    EXECUTION_VISUAL_DISCOVERY: '0',
    EXECUTION_ATOMIC_INVESTIGATION: '1',
    EXECUTION_BLOCKER_REVIEW: '1',
  })
})
it('C02/C05 business uses the existing campaign account and startup failure releases its lease', async () => {
  const root = await directory(),
    campaign = join(root, 'campaign'),
    output = join(root, 'diagnostic')
  await mkdir(output)
  const visual = await openCampaignSession(campaign)
  await visual.ledger.reserve({
    requestId: 'visual',
    runId: 'v',
    phase: 'visual',
    model: 'fixed',
    provider: 'fixed',
    reservedUsd: 1.7,
    priceSource: 'test',
  })
  await visual.ledger.markUnknown('visual', 'unknown')
  await visual.close()
  const business = await prepareBusinessStage({
    ...common,
    directory: output,
    campaign,
    mode: 'diagnostic',
  })
  expect(await business.remaining()).toBeCloseTo(0.3)
  expect(
    await business.gatewayOptions.ledger.reserve({
      requestId: 'business',
      runId: 'b',
      phase: 'business',
      model: 'fixed',
      provider: 'fixed',
      reservedUsd: 0.4,
      priceSource: 'test',
    }),
  ).toMatchObject({ ok: false })
  await business.finish()
  expect(JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')).passed).toBe(false)
  expect(await verifyStageSeal(output, ['manifest.json', 'runs.jsonl'])).toBe(true)
  const reopened = await openCampaignSession(campaign)
  await reopened.close()
})
it('R02 rejects a manifest-only business diagnostic while preserving all 45 not-run rows', async () => {
  const root = await directory(),
    campaign = join(root, 'campaign'),
    source = join(root, 'source'),
    output = join(root, 'formal')
  await mkdir(output)
  await writeJson(join(source, 'manifest.json'), {
    passed: true,
    mode: 'real',
    kind: 'business-diagnostic',
  })
  await expect(
    prepareBusinessStage({ ...common, directory: output, campaign, mode: 'formal', source }),
  ).rejects.toThrow('business-diagnostic-evidence-unsealed')
  const rows = (await readFile(join(output, 'runs.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))
  expect(rows).toHaveLength(45)
  expect(rows.every((r) => r.status === 'not-run')).toBe(true)
  const session = await openCampaignSession(campaign)
  await session.close()
})
