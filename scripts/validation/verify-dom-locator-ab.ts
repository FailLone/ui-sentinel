/** Offline provenance and semantic A/B verification. Never invokes a browser or model. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { deepStrictEqual, strictEqual, ok } from 'node:assert'
import { decisionMemory, readToolResult } from '../../src/agent/context/decision-memory.ts'
import { inspectInput } from '../../src/execution/investigation/program.ts'
import type { HistoryEntry } from '../../src/agent/context/compact-history.ts'

const directory = process.argv[2] ?? 'data/r0-dom-locator-free'
const read = (name: string) => JSON.parse(readFileSync(join(directory, name), 'utf8'))
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')
const original = read('original-request-record.json')
const rawLine = read('original-request-line.json')
const source = read('static-ab-index.json')
strictEqual(digest(source.sourceRequestsPath), source.sourceRequestsSha256)
const lines = readFileSync(source.sourceRequestsPath, 'utf8').trimEnd().split('\n')
strictEqual(
  lines[source.sourceJsonlLine - 1] + '\n',
  readFileSync(join(directory, 'original-request-line.json'), 'utf8'),
)
deepStrictEqual(original, rawLine)
const A = read('A.original.json'),
  B = read('B.locator-only.json')
deepStrictEqual(A, original.body)
const messageIndex = A.messages.findIndex((m: any) => m.role === 'user')
const packetA = JSON.parse(A.messages[messageIndex].content)
const packetB = JSON.parse(B.messages[messageIndex].content)
const targetIndex = packetA.history.findIndex((e: any) =>
  e.tools.some((t: any) => t.resultRef === '8.0'),
)
const toolIndex = packetA.history[targetIndex].tools.findIndex((t: any) => t.resultRef === '8.0')
const receiptA = packetA.history[targetIndex].tools[toolIndex]
const receiptB = packetB.history[targetIndex].tools[toolIndex]
strictEqual(receiptA.omitted, true)
strictEqual(receiptB.omitted, true)
const rawReceipt = read('original-dom-receipt-8.0.json')
strictEqual(digest(source.sourceArtifactPath), source.sourceArtifactSha256)
deepStrictEqual(
  JSON.parse(readFileSync(source.sourceArtifactPath, 'utf8')),
  Object.fromEntries(
    Object.entries(rawReceipt.payload.result).filter(([key]) => key !== 'evidenceRefs'),
  ),
)
deepStrictEqual(
  rawReceipt,
  JSON.parse(readFileSync('src/agent/context/fixtures/r0-overlay-dom-receipt.json', 'utf8')),
)
deepStrictEqual(receiptB.args, rawReceipt.payload.args)
strictEqual(receiptB.total, rawReceipt.payload.result.total)
strictEqual(receiptB.nextOffset, rawReceipt.payload.result.nextOffset)
const fields = ['args', 'total', 'nextOffset'] as const
const restored = structuredClone(packetB)
for (const key of fields) {
  strictEqual(key in receiptA, false)
  delete restored.history[targetIndex].tools[toolIndex][key]
}
deepStrictEqual(restored, packetA)
const bodyRestored = structuredClone(B)
bodyRestored.messages[messageIndex].content = A.messages[messageIndex].content
deepStrictEqual(bodyRestored, A)

const history: HistoryEntry[] = read('history-at-cutoff.json')
const memory = JSON.parse(JSON.stringify(decisionMemory(history)))
deepStrictEqual(memory, { latestToolResults: packetB.latestToolResults, history: packetB.history })
const nextQuery = inspectInput.parse({
  selector: receiptB.args.selector,
  offset: receiptB.nextOffset,
})
deepStrictEqual(nextQuery, { selector: 'body *', offset: 12 })
let offset: number | null = 0,
  reconstructed = '',
  fragments = 0
while (offset !== null) {
  const result = readToolResult(history, receiptB.resultRef, offset)
  if ('error' in result) throw Error(result.error)
  reconstructed += result.chunk
  offset = result.nextOffset
  fragments++
}
deepStrictEqual(JSON.parse(reconstructed), rawReceipt)
const beforeBytes = Buffer.byteLength(
  JSON.stringify({ latestToolResults: packetA.latestToolResults, history: packetA.history }),
)
const afterBytes = Buffer.byteLength(JSON.stringify(memory))
ok(afterBytes <= 8000)
const diff = {
  sourceRequestId: original.requestId,
  messageIndex,
  decodedPacketChanges: fields.map((key) => ({
    op: 'add',
    path: `/history/${targetIndex}/tools/${toolIndex}/${key}`,
    value: receiptB[key],
  })),
  allOtherDecodedFieldsIdentical: true,
  allOtherBodyFieldsIdentical: true,
  originalReceiptOmitted: true,
  newModelCalls: 0,
  newBrowserRuns: 0,
  newPaidCostUsd: 0,
}
writeFileSync(join(directory, 'locator-only-diff.json'), JSON.stringify(diff, null, 2) + '\n')
const result = {
  staticABVerified: true,
  candidateRecompressionEqualsBMemory: true,
  memoryBeforeBytes: beforeBytes,
  memoryAfterBytes: afterBytes,
  memoryBudgetBytes: 8000,
  historyIndicesPreserved: memory.history.map((e: any) => e.index),
  latestIndexPreserved: memory.latestToolResults.index,
  originalReceiptRetrievalFragments: fragments,
  originalReceiptRecoveredExactly: true,
  nextDOMQueryValidated: nextQuery,
  preservedPacketFields: [
    'inspectionScope',
    'task',
    'finishReadiness',
    'budgetRemaining',
    'latestToolResults',
  ],
  Asha256: digest(join(directory, 'A.original.json')),
  Bsha256: digest(join(directory, 'B.locator-only.json')),
  sourceReceiptSha256: digest(join(directory, 'original-dom-receipt-8.0.json')),
  limitation: 'Information delivery only; no new model decision or R0 acceptance result.',
}
writeFileSync(
  join(directory, 'static-ab-verification.json'),
  JSON.stringify(result, null, 2) + '\n',
)
console.log(JSON.stringify(result))
