/** Read-only provenance comparison: original paid failure + author-controlled free SDK evidence. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { progressHarness } from '../../../evaluation/support/product-sources/progress.ts'
import { hashTree } from '../../validation/url-scan-freeze.ts'
import { productPathSkill } from '../../../src/agent/skills/product-path.ts'
const root = resolve('data/r2-product-acceptance/registration-decision-free-20261011')
const original = resolve('data/r2-product-acceptance/real-handoff-price-authorized-20261011')
const browserRoot = resolve(process.argv[2]!)
assert.ok(process.argv[2], 'Pass the successful free browser evidence directory')
const read = async (p: string) => JSON.parse(await readFile(p, 'utf8'))
const write = async (name: string, data: unknown) =>
  writeFile(resolve(root, name), JSON.stringify(data, null, 2) + '\n')
const hash = async (p: string) =>
  createHash('sha256')
    .update(await readFile(p))
    .digest('hex')
await mkdir(root, { recursive: true })
const requestPath = resolve(original, 'requests.jsonl'),
  responsePath = resolve(original, 'responses.jsonl')
const requests = (await readFile(requestPath, 'utf8'))
  .trim()
  .split('\n')
  .map((v) => JSON.parse(v))
  .filter((r) => r.run === 'r2-row:R1')
const responses = (await readFile(responsePath, 'utf8'))
  .trim()
  .split('\n')
  .map((v) => JSON.parse(v))
  .filter((r) => r.run === 'r2-row:R1')
assert.equal(requests.length, 5)
assert.equal(responses.length, 5)
const contexts = (await read(resolve(original, 'request-context-audit.json'))).filter(
  (r: any) => r.row === 'R1',
)
const receipts = (await read(resolve(original, 'tool-receipt-audit.json'))).find(
  (r: any) => r.row === 'R1',
)
const h = progressHarness(undefined, true)
for (const receipt of receipts.receipts.filter((r: any) => r.requestSeq <= 2))
  await h.call(receipt.toolName, receipt.originalArguments)
assert.equal(h.source.contentHash, contexts[2].productPath.source.contentHash)
assert.equal(h.source.markdown.length, 609)
assert.equal((await h.runtime.status()).registration.sourceCoverage.complete, true)
await write('original-r1-complete-contexts.json', {
  origin: {
    requestPath,
    requestFileSha256: await hash(requestPath),
    responsePath,
    responseFileSha256: await hash(responsePath),
    executionCommit: '8ef46a110b8a46d232797302f358d1500ec680af',
  },
  source: h.source,
  requests,
  responses,
  contexts,
  receipts,
  scope:
    'All five original R1 wire requests (including complete last three model contexts), full recorded responses and tool receipts. Source is unchanged. No old run replay or paid request.',
})
const calls = await read(resolve(browserRoot, 'feedback-healthy-calls.json'))
const after = calls.find((c: any) => c.packet.productPath.stage.decisionRequired)
assert.deepEqual(after.packet.activeTools, ['product_path_decide'])
assert.equal(after.args.decision.kind, 'draft')
assert.ok(
  calls
    .filter((c: any) => c.name === 'page_act')
    .every(
      (c: any) => JSON.stringify(c.args) === JSON.stringify(c.packet.productPath.nextAction.args),
    ),
)
const sdk = await read(resolve(root, 'sdk-decision-gap-receipts.json'))
assert.deepEqual(sdk.wires[0].tool_choice, {
  type: 'function',
  function: { name: 'product_path_decide' },
})
await write('flow-comparison.json', {
  sourceHash: h.source.contentHash,
  before: {
    requests: contexts.slice(2).map((c: any) => ({
      seq: c.seq,
      productPath: c.productPath,
      guidance: c.remainingObligationGuidance,
      responseTools: c.responseTools,
      budgetRemaining: c.budgetRemaining,
    })),
    fullWireFile: 'original-r1-complete-contexts.json',
    maxSteps: 1,
    toolChoice: 'required',
    explanation:
      'Any offered tool fulfilled SDK required. Register and direct source reads coexisted. R1 chose reads after the reminder; maxSteps=1 limited generations, not the type of deliverable.',
  },
  after: {
    actualBrowserDecision: after,
    originalSchemaReused: h.schema('product_path_register'),
    decisionSchema: h.schema('product_path_decide'),
    skill: productPathSkill,
    actualSdkWireFile: 'sdk-decision-gap-receipts.json',
    sdkScope:
      'Unit host supplies source status and the real SDK tool definitions. Browser packet and dispatch are captured independently in actualBrowserDecision; no reconstructed wire is represented as a captured browser request.',
    maxSteps: 1,
    toolChoice: sdk.wires[0].tool_choice,
    allowed: ['product_path_decide'],
    initialStatusAfterOriginalRead: await h.runtime.status(),
  },
  dispatch: {
    draft: 'Same original resolveProductPlan/readiness validator; no parallel plan service.',
    retrieve:
      'One counted model request containing 1-3 typed queries. Existing reader bodies run within one serial tool deadline; nested work consumes original tool/read counters. No nested serial or permission round-trip.',
    unsupported:
      'Persist explanation/unchecked scope as interpretation, then original finishInspection unverified-scope in bounded program context after the queue resolves; zero extra model requests.',
    malformed:
      'No dispatch from invalid schema; incorrect citation/assumption gets original diagnostics; no-progress and original three-rejection limit bound repair.',
    perResponse:
      'Original offered-tool snapshot and one-decision guard plus SDK named choice. State changes cannot authorize a second decision or another unoffered tool in the same response.',
    progress:
      'Only exact newly returned character coverage or original plan/action/measurement facts; wording and decision records add no progress. Registration cannot borrow post-closure reminder/contract-repair scheduling.',
  },
  cost: {
    normalDraft:
      'read -> draft: same two model requests as an immediate old read -> register; no added turn',
    missingEvidence:
      'one retrieve decision executes its queries now, then the next original counted request reviews the results; no separate permission request',
    unsupported: 'one decide request, then no-model finish',
    unknown: 'Real model tokens, latency, adoption and success rate not measured.',
  },
  browserCalls: Object.fromEntries(
    await Promise.all(
      (await read(resolve(browserRoot, 'results.json'))).map(async (r: any) => [
        r.mode,
        (await read(resolve(browserRoot, r.mode + '-calls.json'))).length,
      ]),
    ),
  ),
  historicalResult:
    'Latest real batch remains 5/6; original six-row/five-condition/eight-effect criteria unchanged; free authored decisions are not real model adoption.',
  paidCalls: 0,
})
const identity = await read(resolve(browserRoot, 'identity.json'))
const source = await hashTree('src'),
  dist = await hashTree('dist')
assert.equal(identity.source.hash, source.hash)
assert.equal(identity.dist.hash, dist.hash)
await write('browser-build-consistency.json', {
  source,
  dist,
  browserRoot,
  browserIdentity: identity,
  runtimeSourceAndBuildMatch: true,
  validationHarnessOnlyEditsSinceBuild: false,
})
console.log(
  JSON.stringify({
    sourceHash: source.hash,
    distHash: dist.hash,
    originalR1Requests: requests.length,
    browserRoot,
    paidCalls: 0,
  }),
)
