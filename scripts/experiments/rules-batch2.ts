import { parseArgs } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const { values } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    'resource-origin': { type: 'string', multiple: true },
    'control-selector': { type: 'string', multiple: true },
    'image-selector': { type: 'string', multiple: true },
    help: { type: 'boolean' },
  },
  strict: true,
})
if (values.help || !values.url || !values.out) {
  console.log(
    'Usage: pnpm exec tsx scripts/experiments/rules-batch2.ts --url <URL> --out <new directory> [--control-selector <CSS>] [--image-selector <CSS>] [--resource-origin <origin>]\nOne read-only capture. D005 native text check and R005 review materials; no models or semantic approval.',
  )
  process.exit(values.help ? 0 : 2)
}
const output = resolve(values.out)
await mkdir(output, { recursive: false })
process.env.DATABASE_URL = 'file:' + resolve(output, 'experiment.db')
const { config } = await import('../../src/shared/config.ts')
const { openRulesBatch2Experiment } = await import('../../src/experiments/rules-batch2-host.ts')
const { buildReport } = await import('../../src/server/reports/run-report.ts')
const host = await openRulesBatch2Experiment({
  entryUrl: values.url,
  resourceOrigins: values['resource-origin'],
  trustedOrigins: config.urlScan.trustedOrigins,
})
try {
  const result = await host.capture({
    controls: values['control-selector'],
    images: values['image-selector'],
  })
  await writeFile(resolve(output, 'batch2.json'), JSON.stringify(result, null, 2))
  console.log(
    JSON.stringify({
      runId: host.runId,
      rule: result.result.verdict,
      reviewNeeded: result.review.rows.filter((r) => r.disposition === 'review-needed').length,
      reviewUnknown: result.review.rows.filter((r) => r.disposition === 'unknown').length,
      acceptanceClaim: false,
    }),
  )
} finally {
  await host.close()
}
await writeFile(
  resolve(output, 'report.json'),
  JSON.stringify(await buildReport(host.runId), null, 2),
)
