import { readFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { dryRun, runCampaign } from './runner.ts'
import { verifyEvidence, writeJson } from './evidence.ts'
import { evaluateEvidence } from './score.ts'
import { calibrateEvidence } from './calibrate.ts'
function parse(argv: string[]) {
  const result: Record<string, string | true> = {}
  const flags = new Set(['--dry-run', '--run', '--score', '--verify', '--calibrate'])
  const values = new Set([
    '--config',
    '--output',
    '--freeze',
    '--authorization',
    '--evidence',
    '--labels',
  ])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--') continue
    if (arg in result) throw new Error('duplicate-argument')
    if (flags.has(arg)) result[arg] = true
    else if (values.has(arg) && argv[i + 1] && !argv[i + 1].startsWith('--'))
      result[arg] = argv[++i]
    else throw new Error('invalid-arguments')
  }
  if ([...flags].filter((f) => result[f]).length !== 1) throw new Error('choose-one-mode')
  return result
}
export async function main(argv: string[], root = process.cwd()) {
  const args = parse(argv)
  const required = (key: string) => {
    const v = args[key]
    if (typeof v !== 'string') throw new Error(`missing-${key.slice(2)}`)
    return resolve(root, v)
  }
  const json = (key: string) => JSON.parse(readFileSync(required(key), 'utf8'))
  if (args['--verify']) return verifyEvidence(required('--evidence'))
  if (args['--score'] || args['--calibrate']) {
    const result = (args['--calibrate'] ? calibrateEvidence : evaluateEvidence)(
      root,
      required('--evidence'),
      required('--labels'),
    )
    const output = required('--output')
    mkdirSync(output, { recursive: false })
    writeJson(join(output, 'report.json'), result)
    return result
  }
  if (args['--dry-run']) return dryRun(root, json('--config'), required('--output'))
  const controller = new AbortController()
  const abort = () => controller.abort()
  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)
  try {
    return await runCampaign({
      root,
      freeze: json('--freeze'),
      authorization: json('--authorization'),
      output: required('--output'),
      getKey: () => process.env.R1_JEV_API_KEY ?? '',
      signal: controller.signal,
    })
  } finally {
    process.removeListener('SIGINT', abort)
    process.removeListener('SIGTERM', abort)
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2))
    .then((result) => {
      console.log(JSON.stringify(result, null, 2))
      if ('stopped' in result && result.stopped) process.exitCode = 1
      if ('verdict' in result && !['scoring-gate-met', 'development-only'].includes(result.verdict))
        process.exitCode = 1
    })
    .catch(() => {
      console.error(
        JSON.stringify({
          status: 'failed',
          detail:
            'Command rejected; check arguments, evidence, freeze, authorization and protocol prerequisites. No error body or credentials are printed.',
        }),
      )
      process.exitCode = 1
    })
}
