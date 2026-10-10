/** One diagnostic invocation of the actual popup provider. --prepare and --free never generate. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createPopupProvider } from '../../src/agent/popup/provider.ts'
import { wireQuestion, type PopupQuestion } from '../../src/agent/popup/contract.ts'
import { openCampaignSession } from '../../evaluation/support/campaign-session.ts'
const digest = (s: string | Buffer) => createHash('sha256').update(s).digest('hex')
const policy = {
  scope: 'single-popup-jev-diagnostic-1',
  maxRequests: 1,
  maxCostUsd: 0.003,
  timeoutMs: 8000,
  totalMs: 25000,
  retries: 0,
  mainRequests: 0,
  model: 'typesafe/jev-1.13',
  provider: 'TypeSafe',
  fallback: false,
}
function sourceFiles() {
  const names = execFileSync(
    'git',
    ['ls-files', 'src', 'scripts', 'evaluation', 'package.json', 'pnpm-lock.yaml', 'tsconfig.json'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
  return Object.fromEntries(names.map((p) => [p, digest(readFileSync(p))]))
}
async function main() {
  if (process.env.DOTENV_CONFIG_PATH !== '/dev/null') throw Error('explicit-empty-dotenv-required')
  const [mode, a, b, c] = process.argv.slice(2)
  if (mode === '--prepare') {
    const dir = resolve(a!)
    if (existsSync(dir)) throw Error('fresh-preparation-required')
    if (
      execFileSync(
        'git',
        [
          'diff',
          '--name-only',
          'HEAD',
          '--',
          'src',
          'scripts',
          'evaluation',
          'package.json',
          'pnpm-lock.yaml',
        ],
        { encoding: 'utf8' },
      ).trim()
    )
      throw Error('commit-runtime-before-freeze')
    const prior = 'plans/parallel-check-tasks/real-result-20261010'
    const index = JSON.parse(readFileSync(join(prior, 'evidence/artifact-index.json'), 'utf8'))
    const artifact = index.find(
      (v: any) =>
        v.type === 'popup-jev-request' && v.runId === 'check-d7beeffe-8807-4a0e-9bc6-68dad3a4d030',
    )
    const original = readFileSync(join(prior, artifact.archivePath))
    if (digest(original) !== artifact.sha256) throw Error('original-artifact-mismatch')
    const packet: PopupQuestion = JSON.parse(original.toString()).state
    const wire = wireQuestion(packet)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'packet.json'), JSON.stringify(packet, null, 2) + '\n', { flag: 'wx' })
    writeFileSync(join(dir, 'request.json'), wire, { flag: 'wx' })
    const manifest = {
      policy,
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      node: process.version,
      installedLockSha256: digest(readFileSync('node_modules/.pnpm/lock.yaml')),
      sourceFiles: sourceFiles(),
      original: artifact,
      packetSha256: digest(readFileSync(join(dir, 'packet.json'))),
      wireSha256: digest(wire),
      wireBytes: Buffer.byteLength(wire),
      authorization:
        'proposal only; separate explicit human approval required; old approval is invalid',
    }
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {
      flag: 'wx',
    })
    return {
      prepared: dir,
      generated: 0,
      manifestSha256: digest(readFileSync(join(dir, 'manifest.json'))),
    }
  }
  if (!['--run', '--free'].includes(mode!)) throw Error('use-prepare-free-or-run')
  const manifestPath = resolve(a!),
    bytes = readFileSync(manifestPath),
    manifest = JSON.parse(bytes.toString())
  if (
    JSON.stringify(manifest.policy) !== JSON.stringify(policy) ||
    manifest.node !== process.version ||
    manifest.installedLockSha256 !== digest(readFileSync('node_modules/.pnpm/lock.yaml')) ||
    JSON.stringify(manifest.sourceFiles) !== JSON.stringify(sourceFiles())
  )
    throw Error('frozen-runtime-mismatch')
  const packetBytes = readFileSync(join(dirname(manifestPath), 'packet.json'))
  const packet: PopupQuestion = JSON.parse(packetBytes.toString()),
    wire = wireQuestion(packet)
  if (
    digest(packetBytes) !== manifest.packetSha256 ||
    digest(wire) !== manifest.wireSha256 ||
    wire !== readFileSync(join(dirname(manifestPath), 'request.json'), 'utf8')
  )
    throw Error('frozen-request-mismatch')
  const free = mode === '--free',
    output = resolve((free ? b : c)!)
  if (existsSync(output) || !output.startsWith(resolve('data/popup-single-diagnostic') + '/'))
    throw Error('fresh-single-output-required')
  if (free && process.env.POPUP_DIAGNOSTIC_API_KEY) throw Error('free-refuses-credential')
  const key = free ? 'synthetic-only' : process.env.POPUP_DIAGNOSTIC_API_KEY
  if (!free) {
    const approval = JSON.parse(readFileSync(resolve(b!), 'utf8'))
    if (
      !key ||
      approval.scope !== policy.scope ||
      approval.manifestSha256 !== digest(bytes) ||
      approval.maxRequests !== 1 ||
      approval.maxCostUsd !== 0.003 ||
      approval.retries !== 0 ||
      approval.authorizeNewIsolatedAccount !== true ||
      !approval.approvedBy ||
      !approval.approvalReference ||
      !(Date.parse(approval.expiresAt) > Date.now())
    )
      throw Error('new-single-request-human-approval-required')
    const claims = resolve('data/popup-single-diagnostic/.claims')
    mkdirSync(claims, { recursive: true })
    writeFileSync(
      join(claims, digest(bytes) + '.json'),
      JSON.stringify({ approval, output, at: new Date().toISOString() }),
      { flag: 'wx', flush: true },
    )
  }
  for (const name of Object.keys(process.env))
    if (!['PATH', 'HOME', 'TMPDIR', 'DOTENV_CONFIG_PATH'].includes(name)) delete process.env[name]
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, 'manifest.json'), bytes)
  const directory = join(output, 'account'),
    created = await openCampaignSession(directory, '0.003')
  await created.close()
  const controller = new AbortController(),
    deadline = Date.now() + policy.totalMs
  const timer = setTimeout(
    () => controller.abort(new DOMException('diagnostic deadline', 'TimeoutError')),
    policy.totalMs,
  )
  const interrupted = () => controller.abort(Error('operator-cancelled'))
  process.once('SIGINT', interrupted)
  process.once('SIGTERM', interrupted)
  let calls = 0,
    result: unknown,
    problem: string | undefined
  try {
    const decide = createPopupProvider({
      configuration: { directory, limitUsd: 0.003, key: () => key! },
      runId: 'single-popup-diagnostic',
      timeRemaining: () => deadline - Date.now(),
      countCall: async () => {
        if (++calls !== 1) throw Error('single-request-cap')
      },
      save: async (kind, body) => {
        writeFileSync(join(output, kind + '.json'), body, { flag: 'wx' })
        return kind
      },
      emit: async (payload, refs) => {
        writeFileSync(
          join(output, 'provider-event.json'),
          JSON.stringify({ payload, refs }, null, 2),
        )
      },
      observeTransport: (record) => {
        if (record.failureSequence && !controller.signal.aborted) {
          try {
            writeFileSync(join(output, 'first-failure.json'), JSON.stringify(record), {
              flag: 'wx',
              flush: true,
            })
          } finally {
            controller.abort(Error('diagnostic-' + record.outcome))
          }
        }
      },
      ...(free
        ? {
            quote: async () => {},
            http: (async (_url, init) => {
              if (String(init?.body) !== wire) throw Error('wire-mismatch')
              const body = JSON.parse(wire),
                q = body.questions.popup
              if (
                typeof q.instructions !== 'string' ||
                typeof q.criteria !== 'object' ||
                'choices' in q
              )
                return Response.json({ error: 'invalid choice schema' }, { status: 400 })
              return Response.json({
                id: 'gen-synthetic-only',
                model: 'typesafe/jev-1.13-20260917',
                provider: 'TypeSafe',
                answers: {
                  popup: {
                    type: 'choice',
                    choice: 'handoff',
                    confidence: 1,
                    probabilities: Object.fromEntries(
                      Object.keys(q.criteria).map((k) => [k, k === 'handoff' ? 1 : 0]),
                    ),
                  },
                },
                usage: { input_tokens: 1, output_tokens: 0, cost: 0.000001 },
              })
            }) as typeof fetch,
          }
        : {}),
    })
    result = await decide(packet, controller.signal)
  } catch {
    problem = 'single-provider-diagnostic-failed-see-original-evidence'
  } finally {
    clearTimeout(timer)
    process.removeListener('SIGINT', interrupted)
    process.removeListener('SIGTERM', interrupted)
    const db = new DatabaseSync(join(directory, 'campaign.db'), { readOnly: true })
    try {
      writeFileSync(
        join(output, 'result.json'),
        JSON.stringify(
          {
            free,
            realRequests: free ? 0 : calls,
            calls,
            result,
            problem,
            requests: db.prepare('SELECT * FROM ledger_requests').all(),
            stopEvents: db.prepare('SELECT * FROM ledger_stop_events').all(),
            automaticResume: false,
          },
          null,
          2,
        ),
      )
    } finally {
      db.close()
    }
  }
  return { output, free, calls, stopped: problem }
}
main().then(
  (result) => {
    console.log(JSON.stringify(result))
    process.exit('stopped' in result && result.stopped ? 2 : 0)
  },
  (error) => {
    console.error(String(error))
    process.exit(1)
  },
)
