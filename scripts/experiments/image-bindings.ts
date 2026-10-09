import { parseArgs } from 'node:util'
import { createInterface } from 'node:readline'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    interactive: { type: 'boolean', default: false },
    'resource-origin': { type: 'string', multiple: true },
    help: { type: 'boolean' },
  },
  strict: true,
})
if (values.help || !values.url || !values.out) {
  console.log(
    'Usage: pnpm exec tsx scripts/experiments/image-bindings.ts --url <http(s) URL> --out <new directory> [--interactive] [--resource-origin <exact origin>]\nNo model calls. Interactive commands: observe | diagnose <candidateId> | check <review.json path> | quit.\nOnly program facts are collected. Fill intent and basis yourself; exported candidates cannot be resumed in a new session.',
  )
  process.exit(values.help ? 0 : 2)
}
const output = resolve(values.out)
// Never overwrite another experiment or its database, and never use the default/R0 database.
await mkdir(output, { recursive: false })
process.env.DATABASE_URL = 'file:' + resolve(output, 'experiment.db')
const { config } = await import('../../src/shared/config.ts')
const { openImageBindingExperiment } = await import('../../src/experiments/image-binding-host.ts')
const host = await openImageBindingExperiment({
  entryUrl: values.url,
  resourceOrigins: values['resource-origin'],
  trustedOrigins: config.urlScan.trustedOrigins,
})
const lines = values.interactive
  ? createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: !!process.stdin.isTTY,
    })
  : undefined
let sequence = 0
let currentObservationId = ''
async function observe() {
  const batch = await host.observe()
  currentObservationId = batch.observationId
  const filename = `candidates-${++sequence}.json`
  await writeFile(resolve(output, filename), JSON.stringify(batch, null, 2))
  await writeFile(
    resolve(output, 'review-template.json'),
    JSON.stringify(
      {
        candidateId: null,
        observationId: batch.observationId,
        intent: null,
        basis: { reference: null, statement: null, confirmedBy: null },
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      file: resolve(output, filename),
      runId: host.runId,
      artifactDirectory: resolve('data/artifacts', host.runId),
      factsReady: batch.candidates.filter((c) => c.status === 'facts-ready').length,
      totalImages: batch.totalImages,
      omittedImages: batch.omittedImages,
      pending: [
        'select candidateId',
        'intent',
        'basis.reference',
        'basis.statement',
        'basis.confirmedBy',
      ],
    }),
  )
}
try {
  await observe()
  if (lines) {
    console.log(
      'Review candidates and fill a copy of review-template.json. Commands: diagnose <candidateId> | check <path> | observe | quit. Facts expire after five minutes; observe supersedes previous candidates.',
    )
    for await (const line of lines) {
      const command = line.trim()
      if (command === 'quit') break
      try {
        if (command === 'observe') await observe()
        else if (command.startsWith('diagnose ')) {
          const result = await host.diagnose({
            candidateId: command.slice(9).trim(),
            observationId: currentObservationId,
          })
          const filename = resolve(output, `diagnosis-${++sequence}.json`)
          await writeFile(filename, JSON.stringify(result, null, 2))
          console.log(
            JSON.stringify({
              file: filename,
              diagnosticId: result.diagnosticId,
              machineBinding: result.sections.machineBinding.status,
              machineReasons: result.consumption.machineGateReasons,
              semanticCheck: 'not-executed',
            }),
          )
        } else if (command.startsWith('check ')) {
          const review = JSON.parse(await readFile(resolve(command.slice(6).trim()), 'utf8'))
          const result = await host.check(review)
          const filename = resolve(output, `check-${++sequence}.json`)
          await writeFile(filename, JSON.stringify(result, null, 2))
          console.log(
            JSON.stringify({ file: filename, verdict: result.verdict, actual: result.actual }),
          )
        } else console.log('Expected: observe | diagnose <candidateId> | check <path> | quit')
      } catch (error) {
        console.error(String(error))
      }
    }
  }
} finally {
  lines?.close()
  await host.close()
}
