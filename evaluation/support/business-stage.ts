import { writeFile } from 'node:fs/promises'
import { FORMAL_MATRIX } from '../private/export/campaign.ts'
import { readFile } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { execFileSync } from 'node:child_process'
import { openCampaignSession, writeJson } from './campaign-session.ts'
import { sealStage, verifyStageSeal } from './stage-seal.ts'
import { AGENT_MODEL, VISION_MODEL, REVIEW_MODEL } from './model-gateway.ts'

export const BUSINESS_PROFILE = {
  EXECUTION_VISUAL_DISCOVERY: '0',
  EXECUTION_ATOMIC_INVESTIGATION: '1',
  EXECUTION_BLOCKER_REVIEW: '1',
} as const
export async function prepareBusinessStage(input: {
  directory: string
  campaign?: string
  mode: 'diagnostic' | 'formal'
  source?: string
  build: { hash: string; files: Record<string, string> }
  providers: { agent: string; vision: string }
}) {
  const planned =
    input.mode === 'formal'
      ? FORMAL_MATRIX.flatMap((g) =>
          g.cases.flatMap((c) =>
            Array.from({ length: g.repeats }, (_, i) => ({
              group: g.group,
              case: c,
              repeat: i + 1,
              runId: null,
              status: 'not-run',
            })),
          ),
        )
      : ['smoke', 'E0', 'E1', 'E2', 'E3', 'E4'].map((c) => ({
          case: c,
          runId: null,
          status: 'not-run',
        }))
  await writeJson(resolve(input.directory, 'manifest.json'), {
    kind: 'business-' + input.mode,
    mode: 'real',
    passed: false,
  })
  await writeFile(
    resolve(input.directory, 'runs.jsonl'),
    planned.map((r) => JSON.stringify(r)).join('\n') + '\n',
  )
  let campaign = input.campaign
  const read = async (dir: string, name: string) =>
    JSON.parse(await readFile(resolve(dir, name), 'utf8'))
  if (input.mode === 'formal' && !campaign)
    campaign = (await read(input.source!, 'manifest.json')).campaignDirectory
  if (!campaign) campaign = resolve('data/campaigns', 'business-' + basename(input.directory))
  const session = await openCampaignSession(campaign)
  const identity = {
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    buildHash: input.build.hash,
    buildFiles: input.build.files,
    featureProfile: BUSINESS_PROFILE,
    models: { agent: AGENT_MODEL, vision: VISION_MODEL, review: REVIEW_MODEL },
    providers: input.providers,
    budget: { seconds: 300, actions: 40, modelCalls: 30 },
  }
  try {
    if (input.mode === 'formal') {
      if (
        !input.source ||
        !(await verifyStageSeal(input.source, [
          'manifest.json',
          'diagnostic-summary.json',
          'diagnostic-reference.json',
          'persistence-audit.json',
          'requests.jsonl',
          'ledger.jsonl',
        ]))
      )
        throw Error('business-diagnostic-evidence-unsealed')
      const source = await read(input.source, 'manifest.json')
      const summary = await read(input.source, 'diagnostic-summary.json'),
        audit = await read(input.source, 'persistence-audit.json')
      if (
        source.kind !== 'business-diagnostic' ||
        source.mode !== 'real' ||
        source.passed !== true ||
        source.campaignId !== session.campaignId ||
        JSON.stringify(source.freezeIdentity) !== JSON.stringify(identity) ||
        audit.passed !== true ||
        summary.results?.length !== 6 ||
        summary.results.some((r: any) => !r.passed)
      )
        throw Error('business-diagnostic-source-refused')
    }
    await session.startStage(input.directory, 'business-' + input.mode)
    await writeJson(resolve(input.directory, 'protocol.json'), identity)
  } catch (e) {
    await session.close()
    throw e
  }
  const abort = new AbortController()
  let activeCancel: (() => Promise<unknown>) | undefined
  const cancel = async () => {
    await activeCancel?.().catch(() => {})
  }
  const onSignal = () => {
    abort.abort()
    void cancel()
  }
  process.on('SIGINT', onSignal)
  process.on('SIGTERM', onSignal)
  return {
    signal: abort.signal,
    setActive(callback: (() => Promise<unknown>) | undefined) {
      activeCancel = callback
    },
    cancel,
    checkpoint() {
      if (abort.signal.aborted) throw Error('cancelled')
    },
    gatewayOptions: {
      limitUsd: session.limitUsd,
      phase: 'business-' + input.mode + ':' + input.directory,
      ledger: session.ledger,
      providers: input.providers,
    },
    remaining: async () =>
      Math.max(0, session.limitUsd - (await session.ledger.spending()).accountedUsd),
    async finish() {
      try {
        let manifest: any = {}
        try {
          manifest = await read(input.directory, 'manifest.json')
        } catch {}
        let passed = false
        try {
          passed =
            input.mode === 'diagnostic'
              ? (await read(input.directory, 'diagnostic-reference.json')).passed === true &&
                (await read(input.directory, 'persistence-audit.json')).passed === true
              : (await read(input.directory, 'scoreboard.json')).gatePassed === true
        } catch {}
        const spending = await session.ledger.spending()
        passed = passed && !process.exitCode && !spending.exceeded && !abort.signal.aborted
        await writeJson(resolve(input.directory, 'manifest.json'), {
          ...manifest,
          kind: 'business-' + input.mode,
          mode: 'real',
          passed,
          campaignId: session.campaignId,
          campaignDirectory: session.directory,
          freezeIdentity: identity,
          spending,
        })
        if (!passed) process.exitCode = abort.signal.aborted ? 130 : process.exitCode || 1
        await writeJson(resolve(input.directory, 'campaign-summary.json'), {
          campaignId: session.campaignId,
          spending,
          requests: await session.ledger.entries(),
        })
        await session.finishStage(input.directory, passed)
        await sealStage(input.directory)
      } finally {
        await cancel()
        await session.close()
        process.off('SIGINT', onSignal)
        process.off('SIGTERM', onSignal)
      }
    },
  }
}
