/** Free evidence collation; preserves the original live failure, never dispatches a model. */
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { hashTree } from './url-scan-freeze.ts'
const root = resolve('data/r2-product-acceptance/registration-recovery-free-20261012')
const browser = resolve(process.argv[2]!)
assert.ok(process.argv[2], 'Pass final successful free browser directory')
const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'))
const save = (name: string, value: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(value, null, 2) + '\n')
const fixturePath = 'evaluation/private/r2-product-acceptance/registration-recovery-failure.json'
const original = await read(fixturePath)
for (const [name, hash] of Object.entries(original.originalFiles))
  assert.equal(
    createHash('sha256')
      .update(await readFile(resolve(original.origin, name)))
      .digest('hex'),
    hash,
  )
const visibility = original.requests.map((r: any) => {
  const packet = JSON.parse(r.body.messages.find((m: any) => m.role === 'user').content)
  return {
    request: r.seq,
    latest: packet.latestToolResults,
    history: packet.history,
    diagnostics: packet.productPath.registration.diagnostics,
    budget: packet.budgetRemaining,
  }
})
assert.equal(
  visibility[1].latest.tools.find((t: any) => t.tool === 'product_source_read').text,
  original.source.markdown,
)
const sdk = await read(resolve(root, 'sdk-repair-wire-short.json'))
const repairedPacket = JSON.parse(sdk.wires[1].messages.find((m: any) => m.role === 'user').content)
assert.equal(
  repairedPacket.productPath.registration.repairContext.fields[0].excerpt.text,
  original.source.markdown,
)
const results = await read(resolve(browser, 'results.json'))
const rows = []
for (const row of results) {
  const calls = await read(resolve(browser, row.mode + '-calls.json'))
  const events = await read(resolve(browser, row.mode + '-events.json'))
  const report = await read(resolve(browser, row.mode + '-report.json'))
  assert.deepEqual(report, await read(resolve(browser, row.mode + '-restarted-report.json')))
  rows.push({
    ...row,
    calls: calls.length,
    registrationRejections: events.filter((e: any) => e.type === 'product:registration-rejected'),
    deliveryOpportunities: events.filter(
      (e: any) => e.type === 'execution:source-recovery-delivery',
    ),
    sourceQueries: events.filter((e: any) => e.type === 'product:decision-query'),
    actions: events.filter((e: any) => e.type === 'action:executing'),
    fullReportRecovered: true,
  })
}
const fallback = rows.find((r) => r.mode === 'feedback-healthy')!
assert.equal(fallback.deliveryOpportunities.length, 1)
assert.equal(fallback.deliveryOpportunities[0].payload.preservedNoProgressStreak, 3)
assert.equal(fallback.deliveryOpportunities[0].payload.consumed, true)
await save('flow-comparison.json', {
  original: {
    executionCommit: 'ebe21c224a32bcac45861e9faaedc776d58b4777',
    fixture: fixturePath,
    fixtureSha256: createHash('sha256')
      .update(await readFile(fixturePath))
      .digest('hex'),
    visibility,
    rejection: original.events.filter((e: any) => e.type === 'product:registration-rejected'),
    queries: original.events.filter((e: any) => e.type === 'product:decision-query'),
    correction:
      'Full 609 characters were present in request 2; later history omitted the source body. Requests 3 and 4 recovered different pages for a stated repair purpose. Closure followed the second receipt with no opportunity to apply it; extra time does not prove repair success.',
  },
  current: {
    sdkWireFiles: ['sdk-repair-wire-short.json', 'sdk-repair-wire-long.json'],
    actualSdkRepairPacket: repairedPacket,
    directDelivery:
      'Field, unchanged authored requirement, issued citation/range and exact text appear in productPath.registration.repairContext independently of older history allocation. Short original needs no historical JSON retrieval. Long excerpts are explicitly omitted with source cursor, <=6000 serialized bytes, <=3 diagnostic fields.',
    structuralContract:
      'No new predicate. targetName/bind covers structural target admission. The model must explain classification versus a distinct source business condition. No automatic deletion or text-equals-name substitute.',
    fallback:
      'Original source-read receipt JSON gains verified decoded sourceRecovery ranges. Current request visibility and run-wide recovered coverage are distinct from ever-returned source coverage. At most two continuation opportunities / 3000 decoded UTF-8 bytes; canonical source hash+range and merged visible/recovered text deduplicate references and content. Same slice or wrapper cannot renew allowance. Mark consumption only on dispatch of the actual packet containing the excerpt.',
    progressChange:
      'Factual progress detector and noToolStreak are unchanged. An eligible recovery packet may defer source-stage no-progress closure; phase closure evaluates only that no-progress trigger as zero for this iteration, without resetting the real streak. Original model/time closing reserve is checked first and can terminate without using the allowance. All model/tool/read/action limits unchanged.',
    limitations:
      'Fallback decodes product_source_read text only, not arbitrary history or source-search wrappers. Those retain ordinary read/search cursors and original limits. Fixed author responses show mechanics, not live model success.',
  },
  browserRows: rows,
  originalSixRowScore:
    '5/6 unchanged; no paid retry, calibration or new claim. New candidate can be reviewed/frozen for the original six rows, not represented as live accepted.',
  paidCalls: 0,
})
const identity = await read(resolve(browser, 'identity.json'))
const source = await hashTree('src'),
  dist = await hashTree('dist')
assert.equal(source.hash, identity.source.hash)
assert.equal(dist.hash, identity.dist.hash)
await save('browser-build-consistency.json', {
  source,
  dist,
  browser,
  identity,
  matching: true,
  validationHarnessOnlyEditsSinceBuild: true,
})
console.log(
  JSON.stringify({
    sourceHash: source.hash,
    distHash: dist.hash,
    browser,
    rows: rows.length,
    paidCalls: 0,
  }),
)
