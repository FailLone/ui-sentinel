/** Free deterministic product contract test: real SDK/server/browser, loopback model only. */
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile, readFile, rename, copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { hashTree } from './url-scan-freeze.ts'
import { documentFor, type Variant } from '../../evaluation/fixtures/r2-product-acceptance/page.ts'
import { citationSource, r4Draft, r4Quotes, r4WithReferences } from './r2-citation-replay.ts'
import {
  originalReadinessInput,
  correctedReadinessPlan,
  confirmedReview,
  readinessRows,
} from './r2-readiness-replay.ts'
import { continuationReply, continuationRows } from './r2-continuation-replay.ts'
import { progressReply, progressRow } from './r2-progress-replay.ts'
const decisionOnly = process.argv.includes('--registration-decision-only')
const handoffOnly = process.argv.includes('--registration-action-handoff-only')
const handoffFixture = JSON.parse(
  await readFile(
    'evaluation/private/r2-product-acceptance/registration-action-handoff-failures.json',
    'utf8',
  ),
)
const originalHandoff = (row: string) => handoffFixture.rows.find((r: any) => r.row === row)
let registrationPrefix = 0
const retrievalOnly = process.argv.includes('--stage-retrieval-only')
const stageBoundaryOnly = process.argv.includes('--stage-boundary-only')
const stageOnly =
  process.argv.includes('--stage-decisions-only') ||
  stageBoundaryOnly ||
  retrievalOnly ||
  handoffOnly ||
  decisionOnly
const feedbackOnly = process.argv.includes('--progress-feedback-only') || stageOnly
const continuationOnly = process.argv.includes('--continuation-only') || feedbackOnly
const continuationModes = decisionOnly
  ? [
      'feedback-healthy',
      'feedback-defect',
      'feedback-unavailable-enabled',
      'feedback-registration-stall',
      'feedback-unsupported',
      'feedback-budget',
    ]
  : handoffOnly
    ? [
        'feedback-healthy',
        'feedback-defect',
        'feedback-registration-stall',
        'feedback-unavailable-enabled',
        'feedback-unknown',
      ]
    : retrievalOnly
      ? ['feedback-healthy', 'feedback-unavailable-enabled', 'feedback-unknown']
      : stageBoundaryOnly
        ? ['feedback-healthy']
        : feedbackOnly
          ? [
              'feedback-healthy',
              'feedback-defect',
              'feedback-unavailable-enabled',
              ...(stageOnly ? ['feedback-unknown'] : []),
              'dynamic-pending',
            ]
          : [
              'continuation-healthy',
              'continuation-defect',
              'continuation-unavailable',
              'continuation-unavailable-enabled',
              'dynamic-pending',
            ]
const readinessOnly = process.argv.includes('--readiness-only')
const readinessModes = [
  'readiness-healthy',
  'readiness-defect',
  'readiness-unavailable',
  'readiness-unavailable-enabled',
  'dynamic-pending',
]
const readinessVariant = () =>
  mode === 'readiness-unavailable-enabled' ? 'unavailable' : (mode.slice(10) as Variant)
const citationsOnly = process.argv.includes('--citations-only')
const citationModes = ['citation-healthy', 'citation-defect', 'citation-unavailable']
const citationRefs = new Map<string, string>()
const dynamicOnly = process.argv.includes('--dynamic-only')
const dynamicModes = [
  'dynamic-healthy',
  'dynamic-defect',
  'dynamic-missing',
  'dynamic-duplicate',
  'dynamic-extra',
  'dynamic-pending',
]
const root = resolve('data/r2-product-sources', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const save = (p: string, v: unknown) =>
  writeFile(resolve(root, p), JSON.stringify(v, null, 2) + '\n')
await save('identity.json', {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  source: await hashTree('src'),
  dist: await hashTree('dist'),
  validationScripts: await hashTree('scripts/validation'),
  fixtures: await hashTree('evaluation/fixtures/r2-product-acceptance'),
  mode: decisionOnly
    ? 'registration-decision-only'
    : handoffOnly
      ? 'registration-action-handoff-only'
      : retrievalOnly
        ? 'stage-retrieval-only'
        : stageBoundaryOnly
          ? 'stage-boundary-only'
          : stageOnly
            ? 'stage-decisions-only'
            : feedbackOnly
              ? 'progress-feedback-only'
              : continuationOnly
                ? 'continuation-only'
                : readinessOnly
                  ? 'readiness-only'
                  : citationsOnly
                    ? 'citations-only'
                    : dynamicOnly
                      ? 'dynamic-only'
                      : 'all',
})
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function listen(s: ReturnType<typeof createServer>) {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r))
  return 'http://127.0.0.1:' + (s.address() as any).port
}
const reserve = createServer(),
  base = await listen(reserve)
await new Promise<void>((r) => reserve.close(() => r()))
let originalReceiptRead = false
let mode = '',
  turn = 0,
  source: any,
  plan: any,
  calls: any[] = [],
  requests: any[] = [],
  runId = ''
const fixture = createServer((req, res) => {
  requests.push({ method: req.method, url: req.url })
  res.writeHead(200, { 'content-type': 'text/html' })
  if (mode.startsWith('feedback-')) {
    const html = documentFor(
      mode.includes('unavailable')
        ? 'unavailable'
        : ['feedback-registration-stall', 'feedback-unsupported', 'feedback-budget'].includes(mode)
          ? 'healthy'
          : mode === 'feedback-unknown'
            ? 'defect'
            : (mode.slice(9) as Variant),
    )
    res.end(mode.includes('unavailable') ? html.replace(' disabled', '') : html)
    return
  }
  if (mode.startsWith('continuation-')) {
    const html = documentFor(
      mode.includes('unavailable') ? 'unavailable' : (mode.slice(13) as Variant),
    )
    res.end(mode === 'continuation-unavailable-enabled' ? html.replace(' disabled', '') : html)
    return
  }
  if (mode.startsWith('readiness-')) {
    const html = documentFor(readinessVariant())
    // Fault injection for the prerequisite gate only: same unavailable DOM, enabled button.
    res.end(mode === 'readiness-unavailable-enabled' ? html.replace(' disabled', '') : html)
    return
  }
  if (mode.startsWith('citation-')) {
    res.end(documentFor(mode.slice(9) as Variant))
    return
  }
  const dynamic = mode.startsWith('dynamic-')
  const reveal = dynamic
    ? `
    ${
      mode === 'dynamic-missing'
        ? ''
        : `
    const details = document.createElement('button'); details.id='details'; details.type='button'; details.textContent='Details';
    details.onclick=()=>{document.querySelector('#detail-result').textContent='${mode === 'dynamic-defect' ? 'Wrong details' : 'Details ready'}'};
    document.body.append(details);
    ${mode === 'dynamic-duplicate' ? "const duplicate=details.cloneNode(true); duplicate.id='duplicate'; document.body.append(duplicate);" : ''}`
    }
    const extra=document.createElement('button'); extra.type='button'; extra.textContent='Extra'; extra.id='extra';
    extra.onclick=()=>{document.body.dataset.extra='clicked'}; document.body.append(extra);
  `
    : ''
  res.end(
    `<!doctype html><html><head><title>Catalog preview</title></head><body><h1>Catalog preview</h1><p id=availability>${mode === 'missing' ? 'Unavailable' : 'Available'}</p><button type=button id=preview>Preview</button><div role=status id=result>Idle</div>${dynamic ? '<div id=detail-result role=region>Closed</div>' : ''}${mode === 'dynamic-pending' ? '<button type=button id=pending>Other default</button>' : ''}${mode === 'two-step' || mode === 'pending' ? '<button type=button id=details>Details</button><div id=detail-result role=region>Closed</div>' : ''}<script>preview.onclick=()=>{result.textContent='${['defect', 'async-wrong'].includes(mode) ? 'Wrong' : 'Ready'}';document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1);${reveal}};if(document.querySelector('#details'))details.onclick=()=>{document.querySelector('#detail-result').textContent='Details ready'}</script></body></html>`,
  )
})
const origin = await listen(fixture)
function setup(m: string) {
  mode = m
  originalReceiptRead = false
  turn = 0
  calls = []
  requests = []
  citationRefs.clear()
  if (
    m.startsWith('feedback-') ||
    m.startsWith('citation-') ||
    m.startsWith('readiness-') ||
    m.startsWith('continuation-')
  ) {
    source = citationSource
    return
  }
  const quote =
    m === 'ambiguous'
      ? 'Click Preview to see a suitable result.'
      : m === 'async-wrong'
        ? 'Click Preview: show Ready in the status area.'
        : 'Click Preview: immediately show Ready in the status area.'
  const pre = 'Prerequisite: availability must be Available.'
  const second = 'Click Details: immediately show Details ready in the details area.'
  const markdown =
    '# Preview\n' +
    pre +
    '\n' +
    quote +
    '\n# Additional scope\n' +
    second +
    '\nSaving requires login and is outside the anonymous path.'
  source = { title: 'Catalog product brief', markdown }
  const cite = (q: string) => ({
    start: markdown.indexOf(q),
    end: markdown.indexOf(q) + q.length,
    quote: q,
  })
  plan = {
    title: 'Preview catalog',
    rationale: 'Primary anonymous preview path; no business write required.',
    unchecked: [
      'Saving and login are not checked.',
      'Other document sections are not claimed as covered.',
    ],
    assumptions: [],
    steps: [
      {
        title: 'Preview',
        citation: cite(quote),
        certainty: m === 'ambiguous' ? 'ambiguous' : 'explicit',
        action: 'click',
        ...(m === 'ambiguous'
          ? {}
          : { expectation: { condition: 'text-equals', expected: 'Ready' } }),
        timing: ['ambiguous', 'async-wrong'].includes(m) ? 'unspecified' : 'action-complete',
        preconditions: [
          {
            description: 'Availability is Available',
            citation: cite(pre),
            expectation: { condition: 'text-equals', expected: 'Available' },
          },
        ],
      },
    ],
  }
  if (m === 'two-step' || m.startsWith('dynamic-'))
    plan.steps.push({
      title: 'Details',
      citation: cite(second),
      certainty: 'explicit',
      action: 'click',
      expectation: { condition: 'text-equals', expected: 'Details ready' },
      timing: 'action-complete',
      preconditions: [],
    })
}
const model = createServer(async (req, res) => {
  let raw = ''
  for await (const b of req) raw += b
  const body = JSON.parse(raw),
    packet = JSON.parse(body.messages.find((m: any) => m.role === 'user').content)
  const additionalCalls: { name: string; args: any }[] = []
  let name = 'run_finish',
    args: any = {
      reason: [
        'ambiguous',
        'missing',
        'pending',
        'async-wrong',
        'dynamic-missing',
        'dynamic-duplicate',
        'dynamic-extra',
        'dynamic-pending',
      ].includes(mode)
        ? 'unverified-scope'
        : 'scope-covered',
    }
  if (
    decisionOnly &&
    ['feedback-registration-stall', 'feedback-unsupported', 'feedback-budget'].includes(mode)
  ) {
    name = 'product_source_read'
    args = { offset: 0 }
    if (turn > 0) {
      name = 'product_path_decide'
      args = {
        decision:
          mode === 'feedback-unsupported'
            ? {
                kind: 'unsupported',
                reason:
                  'This fixed operator cannot derive a supported plan; the document and local buttons alone do not verify the path.',
                unchecked: ['访客预览到详情路径未执行', '当前前置条件与效果均未测量'],
              }
            : {
                kind: 'retrieve',
                missing: `Rephrased gap ${turn}: preview source requirement`,
                queries: [{ tool: 'product_source_read', args: { offset: 0 } }],
              },
      }
    }
    if (mode === 'feedback-budget' && packet.runPhase?.phase === 'finalizing') {
      name = 'run_finish'
      args = { reason: 'unverified-scope' }
    }
    if (
      mode === 'feedback-budget' &&
      packet.activeTools.length === 1 &&
      packet.activeTools[0] === 'run_finish'
    ) {
      name = 'run_finish'
      args = { reason: 'unverified-scope' }
    }
  } else if (mode === 'feedback-registration-stall') {
    const original = originalHandoff('R1').receipts.filter((r: any) => r.requestSeq === turn + 1)
    assert.ok(original.length, 'R1 replay must close within its original six decisions')
    name = original[0].toolName
    args = original[0].originalArguments
    additionalCalls.push(
      ...original.slice(1).map((r: any) => ({ name: r.toolName, args: r.originalArguments })),
    )
  } else if (mode.startsWith('feedback-')) {
    // Reuse the exact DOM receipt already returned to this scripted operator.
    const prior = calls
      .filter((c) => c.packet.latestToolResults?.tools?.some((t: any) => t.tool === 'page_inspect'))
      .at(-1)?.packet.latestToolResults
    const replayPacket = turn === 4 ? { ...packet, latestToolResults: prior } : packet
    if (mode === 'feedback-unknown' && turn >= 9) {
      assert.equal(packet.productPath.execution.phase, 'verify-original-action')
      if (turn === 9) {
        const original = packet.inspectionScope.checkInteractions.find(
          (c: any) => c.actionId === packet.productPath.execution.actionId,
        )
        assert.ok(original)
        name = 'interaction_verify'
        args = {
          checkRef: original.checkRef,
          purpose: 'verify-effect',
          requirementId: packet.productPath.execution.requirementId,
        }
      } else if (turn === 10) {
        name = 'page_act' // Deliberately violate the stage; SDK/executor must refuse replay.
        args = { type: 'click', role: 'button', name: '查看详情' }
      } else {
        name = 'run_finish'
        args = { reason: 'unverified-scope' }
      }
    } else {
      const reply = progressReply(mode, turn, replayPacket)
      name = reply.name
      args = structuredClone(reply.args)
      if (mode === 'feedback-unknown' && name === 'product_path_register')
        for (const step of args.steps) step.timing = 'unspecified'
    }
  } else if (mode.startsWith('continuation-')) {
    const reply = continuationReply(mode, turn, packet)
    name = reply.name
    args = reply.args
    additionalCalls.push(...reply.additionalCalls)
  } else if (mode.startsWith('readiness-')) {
    const unavailable = mode.includes('unavailable')
    args = { reason: unavailable ? 'unverified-scope' : 'scope-covered' }
    if (turn === 0) {
      name = 'product_source_read'
      args = { offset: 0 }
    } else if (turn === 1) {
      name = 'product_source_search'
      args = { quote: r4Quotes[0], offset: 0 }
      for (const quote of r4Quotes.slice(1))
        additionalCalls.push({ name, args: { quote, offset: 0 } })
      // R5 original detail/availability IDs refer to shorter quotes; issue these too.
      const original = readinessRows.find((r) => r.row === 'R5')!.originalPersistedPlan
      for (const step of original.steps)
        for (const p of [step, ...step.preconditions])
          if (!r4Quotes.includes(p.citation.quote))
            additionalCalls.push({ name, args: { quote: p.citation.quote, offset: 0 } })
    } else if (turn === 2) {
      for (const t of packet.latestToolResults.tools) {
        assert.equal(t.matches.length, 1)
        const c = t.matches[0].citation
        citationRefs.set(c.quote, c.citationId)
      }
      name = 'product_path_register'
      args = originalReadinessInput('R5')
    } else if (turn === 3) {
      const result = packet.latestToolResults.tools[0]
      assert.equal(result.frozen, false)
      assert.ok(result.diagnostics.some((d: any) => d.field === 'assumptions[0]'))
      name = 'product_path_register'
      args = correctedReadinessPlan('R5', citationRefs)
    } else if (turn === 4 || (turn === 6 && !unavailable)) {
      const step = turn === 4 ? 0 : 1,
        target = step === 0 ? '预览目录' : '查看详情'
      name = 'product_path_bind'
      args = {
        step,
        ref:
          packet.inspectionScope.candidates.find((c: any) => c.description.includes(target))?.ref ??
          'unavailable-control',
        resultSelector: step === 0 ? '#preview-state' : '#details-state',
        preconditionSelectors: [step === 0 ? '#availability' : '#preview-state'],
      }
    } else if (
      (turn === 5 && !unavailable) ||
      (turn === 7 && !unavailable) ||
      (turn === 5 && mode === 'readiness-unavailable-enabled')
    ) {
      name = 'page_act'
      args = { type: 'click', role: 'button', name: turn === 7 ? '查看详情' : '预览目录' }
    }
  } else if (mode.startsWith('citation-')) {
    args = { reason: mode === 'citation-unavailable' ? 'unverified-scope' : 'scope-covered' }
    if (turn === 3) {
      for (const result of packet.latestToolResults.tools) {
        assert.equal(result.matches.length, 1)
        const citation = result.matches[0].citation
        citationRefs.set(citation.quote, citation.citationId)
      }
      assert.equal(citationRefs.size, r4Quotes.length)
    }
    const citationTurn = mode === 'citation-healthy' && turn >= 4 ? turn - 1 : turn
    if (citationTurn === 0) {
      name = 'product_source_overview'
      args = {}
    } else if (citationTurn === 1) {
      name = 'product_source_read'
      args = { offset: 0 }
    } else if (citationTurn === 2) {
      name = 'product_source_search'
      args = { quote: r4Quotes[0], offset: 0 }
      for (const quote of r4Quotes.slice(1))
        additionalCalls.push({ name, args: { quote, offset: 0 } })
    } else if (citationTurn === 3) {
      name = 'product_path_register'
      args = r4WithReferences(citationRefs)
      // Exact R4 prose is tested separately; neutralize page-specific commentary here.
      args.rationale = '固定本地模型免费集成：同一原文的两步匿名路径。'
      args.steps.forEach((s: any) => {
        delete s.limitation
      })
      plan = args
      if (mode === 'citation-healthy' && turn === 3) args = r4Draft()
    } else if (citationTurn === 4 || (citationTurn === 6 && mode !== 'citation-unavailable')) {
      const step = citationTurn === 4 ? 0 : 1,
        target = step === 0 ? '预览目录' : '查看详情'
      name = 'product_path_bind'
      args = {
        step,
        ref:
          packet.inspectionScope.candidates.find((c: any) => c.description.includes(target))?.ref ??
          'unavailable-control',
        resultSelector: step === 0 ? '#preview-state' : '#details-state',
        preconditionSelectors: [step === 0 ? '#availability' : '#preview-state'],
      }
    } else if ((citationTurn === 5 || citationTurn === 7) && mode !== 'citation-unavailable') {
      name = 'page_act'
      args = { type: 'click', role: 'button', name: citationTurn === 5 ? '预览目录' : '查看详情' }
    }
  } else if (mode === 'legacy') {
    if (turn === 0) {
      name = 'page_act'
      args = { type: 'click', role: 'button', name: 'Preview' }
    }
  } else if (turn === 0) {
    name = 'product_source_overview'
    args = {}
  } else if (turn === 1) {
    name = 'product_source_search'
    args = { keyword: 'Preview', offset: 0 }
  } else if (turn === 2) {
    name = 'product_source_read'
    args = { offset: 0 }
  } else if (turn === 3) {
    assert.equal(packet.latestToolResults.tools[0].text, source.markdown)
    name = 'product_path_register'
    args = {
      ...plan,
      sourceId: packet.productPath.source.sourceId,
      contentHash: packet.productPath.source.contentHash,
    }
  } else if (turn === 4 && mode !== 'ambiguous') {
    name = 'product_path_bind'
    args = {
      step: 0,
      ref: packet.inspectionScope.candidates.find((c: any) => c.description.includes('Preview'))
        .ref,
      resultSelector: '#result',
      preconditionSelectors: ['#availability'],
    }
  } else if (turn === 5 && !['ambiguous', 'missing'].includes(mode)) {
    name = 'page_act'
    args = { type: 'click', role: 'button', name: 'Preview' }
  } else if ((mode === 'two-step' || mode.startsWith('dynamic-')) && turn === 6) {
    name = 'product_path_bind'
    args = {
      step: 1,
      ref:
        packet.inspectionScope.candidates.find((c: any) =>
          c.description.includes(mode === 'dynamic-extra' ? 'Extra' : 'Details'),
        )?.ref ?? 'missing-target',
      resultSelector: '#detail-result',
      preconditionSelectors: [],
    }
  } else if (
    ['two-step', 'dynamic-healthy', 'dynamic-defect', 'dynamic-pending'].includes(mode) &&
    turn === 7
  ) {
    name = 'page_act'
    args = { type: 'click', role: 'button', name: 'Details' }
  } else if (mode === 'dynamic-extra' && turn === 7) {
    name = 'exploration_update'
    args = {
      state: 'Inspecting extra control boundary',
      unexploredBranches: [],
      selectItems: [
        {
          itemId: packet.inspectionScope.candidates.find((c: any) =>
            c.description.includes('Extra'),
          ).itemId,
          basis: 'Extra is not in the frozen path',
        },
      ],
    }
  } else if (mode === 'dynamic-extra' && turn === 8) {
    name = 'page_act'
    args = { type: 'click', role: 'button', name: 'Extra' }
  } else if ((turn === 6 && mode === 'pending') || (turn === 8 && mode === 'dynamic-pending')) {
    name = 'run_finish'
    args = { reason: 'scope-covered' }
  }
  if (name === 'product_path_register' && !mode.startsWith('readiness-'))
    for (const step of args.steps) step.review = { ...confirmedReview }
  if ((stageBoundaryOnly || retrievalOnly) && mode === 'feedback-healthy' && [0, 1].includes(turn))
    additionalCalls.push({ name: 'product_source_read', args: { offset: 0 } })
  let receiptSubturn = false
  if (handoffOnly && mode === 'feedback-healthy' && turn === 1 && registrationPrefix === 0) {
    // R1 had the complete text before these four exact searches; then explicitly decide.
    const originals = originalHandoff('R1').receipts.filter((r: any) => r.requestSeq === 3)
    name = originals[0].toolName
    args = originals[0].originalArguments
    additionalCalls.push(
      ...originals.slice(1).map((r: any) => ({ name: r.toolName, args: r.originalArguments })),
    )
    registrationPrefix++
    receiptSubturn = true
  } else if (handoffOnly && mode === 'feedback-healthy' && turn === 1) {
    assert.equal(packet.remainingObligationGuidance?.kind, 'product-registration')
    assert.equal(packet.remainingObligationGuidance.sourceCoverage.complete, true)
  }
  if (
    handoffOnly &&
    ['feedback-healthy', 'feedback-defect', 'feedback-unknown'].includes(mode) &&
    [5, 8].includes(turn)
  ) {
    const next = packet.productPath.nextAction
    assert.equal(next?.tool, 'page_act')
    assert.ok(next.args.requirementId.startsWith('requirement:'))
    assert.notEqual(
      next.args.requirementId,
      packet.productPath.steps[packet.productPath.stage.step].itemId,
    )
    assert.equal(
      next.args.requirementId,
      packet.productPath.steps[packet.productPath.stage.step].requirementId,
    )
    const bindReceipt = packet.latestToolResults.tools.find(
      (t: any) => t.tool === 'product_path_bind',
    )
    assert.deepEqual(bindReceipt.nextAction, next)
    if (mode === 'feedback-unknown') {
      name = next.tool
      args = next.args
    } else {
      const originals = originalHandoff(mode === 'feedback-defect' ? 'R5' : 'R6').errors.filter(
        (e: any) => e.stage.step === (turn === 5 ? 0 : 1),
      )
      assert.ok(originals.length)
      const negatives = originals.map((e: any) => ({
        name: 'page_act',
        args: { ...e.input, ref: next.args.ref },
      }))
      name = negatives[0].name
      args = negatives[0].args
      additionalCalls.push(...negatives.slice(1), { name: next.tool, args: next.args })
    }
  }

  if (decisionOnly) {
    if (name === 'product_path_register') {
      name = 'product_path_decide'
      args = { decision: { kind: 'draft', plan: args } }
      if (mode === 'feedback-healthy') {
        // A second decision and newly available DOM tool in this SAME reply may not run.
        additionalCalls.push(
          {
            name: 'product_path_decide',
            args: {
              decision: {
                kind: 'retrieve',
                missing: 'duplicate after freeze',
                queries: [{ tool: 'product_source_read', args: { offset: 0 } }],
              },
            },
          },
          { name: 'page_inspect', args: { selector: 'main', offset: 0 } },
        )
      }
    }
    if (packet.productPath.stage.decisionRequired) {
      assert.deepEqual(packet.activeTools, ['product_path_decide'])
      assert.deepEqual(body.tool_choice, {
        type: 'function',
        function: { name: 'product_path_decide' },
      })
    }
    if (['feedback-healthy', 'feedback-defect'].includes(mode) && [5, 8].includes(turn)) {
      const next = packet.productPath.nextAction
      assert.equal(next.tool, 'page_act')
      assert.ok(next.args.requirementId.startsWith('requirement:'))
      name = next.tool
      args = next.args
    }
  }

  if (retrievalOnly && mode === 'feedback-unknown' && turn === 9 && !originalReceiptRead) {
    const receipt = packet.latestToolResults.tools.find((t: any) => t.tool === 'page_act')
    assert.ok(receipt.resultRef)
    name = 'tool_result_read'
    args = { resultRef: receipt.resultRef, offset: 0 }
    originalReceiptRead = true
    receiptSubturn = true
  }
  if (stageOnly)
    assert.deepEqual(
      body.tools.map((t: any) => t.function.name).sort(),
      [...packet.activeTools].sort(),
    )
  calls.push({
    turn,
    name,
    args,
    additionalCalls,
    packet,
    wireChoice: body.tool_choice,
    wireTools: stageOnly ? body.tools.map((t: any) => t.function.name) : undefined,
  })
  if (!receiptSubturn) turn++
  if (turn > 13) {
    res.writeHead(500)
    res.end('fixed-model-unexpected-loop')
    return
  }
  const common = {
    id: randomUUID(),
    object: 'chat.completion.chunk',
    created: 1,
    model: body.model,
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' })
  const dynamic = mode.startsWith('dynamic-')
  const reveal = dynamic
    ? `
    ${
      mode === 'dynamic-missing'
        ? ''
        : `
    const details = document.createElement('button'); details.id='details'; details.type='button'; details.textContent='Details';
    details.onclick=()=>{document.querySelector('#detail-result').textContent='${mode === 'dynamic-defect' ? 'Wrong details' : 'Details ready'}'};
    document.body.append(details);
    ${mode === 'dynamic-duplicate' ? "const duplicate=details.cloneNode(true); duplicate.id='duplicate'; document.body.append(duplicate);" : ''}`
    }
    const extra=document.createElement('button'); extra.type='button'; extra.textContent='Extra'; extra.id='extra';
    extra.onclick=()=>{document.body.dataset.extra='clicked'}; document.body.append(extra);
  `
    : ''
  res.end(
    `data: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: { role: 'assistant', tool_calls: [{ name, args }, ...additionalCalls].map((call, index) => ({ index, id: randomUUID(), type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ ...common, choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } })}\n\ndata: [DONE]\n\n`,
  )
})
const modelOrigin = await listen(model),
  dbfile = resolve(root, 'runs.db'),
  logs: string[] = []
function start(database = dbfile) {
  const child = spawn(process.execPath, ['dist/server/index.js'], {
    env: {
      ...process.env,
      DOTENV_CONFIG_PATH: '/dev/null',
      PORT: new URL(base).port,
      DATABASE_URL: 'file:' + database,
      AGENT_MODEL: 'openai/fixed-local',
      OPENAI_BASE_URL: modelOrigin + '/v1',
      OPENAI_API_KEY: 'local-only',
      OPENROUTER_API_KEY: '',
      VISION_API_KEY: 'local-only',
      VISION_MODEL: 'qwen/fixed-local',
      VISION_MODEL_FAMILY: 'qwen3',
      VISION_BASE_URL: modelOrigin + '/v1',
      COMPLETION_REVIEW_API_KEY: '',
      EXECUTION_URL_SCAN: '1',
      EXECUTION_PRODUCT_SOURCES: '1',
      URL_SCAN_TRUSTED_ORIGINS: origin,
      EXECUTION_OBSERVATION_REUSE: '1',
      EXECUTION_RULE_ROUTING: '1',
      EXECUTION_SHORT_FINISH: '1',
      EXECUTION_MODEL_STREAMING: '1',
      EXECUTION_BLOCKER_REVIEW: '0',
      EXECUTION_POPUP_JEV: '0',
      EXECUTION_VISUAL_DISCOVERY: '0',
      RUN_TOTAL_TIMEOUT_MS: '120000',
      RUN_MAX_MODEL_CALLS: '20',
      RUN_MAX_ACTIONS: '8',
      OTEL_SDK_DISABLED: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', (b) => logs.push(String(b)))
  child.stderr.on('data', (b) => logs.push(String(b)))
  return child
}
let child = start()
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (
      await fetch(base + '/api/health')
        .then((r) => r.ok)
        .catch(() => false)
    )
      return
    await sleep(100)
  }
  throw Error('server-not-ready')
}
const report = async (id = runId) => {
  const r = await fetch(base + '/api/runs/' + id + '/report')
  if (!r.ok) throw Error('report:' + (await r.text()))
  return r.json() as Promise<any>
}
async function settled() {
  for (let i = 0; i < 1200; i++) {
    const r = (await fetch(base + '/api/runs/' + runId).then((r) => r.json())) as any
    if (!['running', 'queued'].includes(r.status) && !r.active) return
    await sleep(100)
  }
  throw Error('run-not-settled')
}
const results: any[] = [],
  ids: Record<string, string> = {}
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
try {
  await ready()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  for (const m of [
    ...(continuationOnly ? continuationModes : []),
    ...(readinessOnly ? readinessModes : []),
    ...(citationsOnly ? citationModes : []),
    ...(dynamicOnly || citationsOnly || readinessOnly || continuationOnly
      ? []
      : [
          'healthy',
          'defect',
          'ambiguous',
          'missing',
          'two-step',
          'pending',
          'async-wrong',
          'legacy',
        ]),
    ...(citationsOnly || readinessOnly || continuationOnly ? [] : dynamicModes),
  ]) {
    setup(m)
    registrationPrefix = 0
    if (m === 'healthy') {
      await page.goto(base)
      await page.getByLabel('网址 UI 检查（匿名、有界，不需要业务适配器）').check()
      await page
        .getByPlaceholder('https://example.org/catalog?category=books#items')
        .fill(origin + '/catalog')
      await page.getByLabel('资料名称').fill(source.title)
      await page.getByLabel('产品说明 / Markdown').fill(source.markdown)
      const created = page.waitForResponse(
        (r) => r.url() === base + '/api/runs' && r.request().method() === 'POST',
      )
      await page.getByRole('button', { name: '开始检查', exact: true }).click()
      const response = await created
      assert.equal(response.status(), 202)
      runId = (await response.json()).runId
    } else {
      const created = await fetch(base + '/api/runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'ui-scan',
          entryUrl: origin + '/catalog',
          ...(m === 'legacy' ? {} : { productSource: source }),
          ...(m === 'feedback-budget' ? { budget: { maxModelCalls: 3 } } : {}),
        }),
      })
      assert.equal(created.status, 202, await created.clone().text())
      runId = ((await created.json()) as any).runId
    }
    ids[m] = runId
    await settled()
    const r = await report()
    await save(m + '-report.json', r)
    await save(m + '-calls.json', calls)
    await save(m + '-requests.json', requests)
    const events = (await fetch(base + '/api/runs/' + runId + '/events').then((r) =>
      r.json(),
    )) as any[]
    await save(m + '-events.json', events)
    const state = r.uiScan?.productSource?.state
    results.push({
      mode: m,
      runId,
      status: r.status,
      coverage: r.uiScan?.inspection.coverage,
      state,
      issues: r.persistenceIssues ?? r.inspection?.persistenceIssues,
      actions: events.filter((e) => e.type === 'action:executing').length,
    })
    await save('results.json', results)
    console.log(JSON.stringify(results.at(-1)))
    if (decisionOnly) {
      assert.equal(
        events.filter(
          (e) =>
            e.type === 'execution:remaining-obligation-guidance' &&
            e.payload.kind === 'product-registration',
        ).length,
        0,
      )
      if (['feedback-registration-stall', 'feedback-unsupported', 'feedback-budget'].includes(m)) {
        assert.equal(state, 'unverified')
        assert.equal(r.uiScan.inspection.coverage, 'partial')
        assert.equal(
          events.filter((e) => ['product:planned', 'action:executing'].includes(e.type)).length,
          0,
        )
        if (m === 'feedback-registration-stall') {
          assert.equal(events.find((e) => e.type === 'run:no-progress').payload.streak, 3)
          assert.equal(calls.length, 4)
          assert.equal(events.filter((e) => e.type === 'product:decision-query').length, 3)
        } else if (m === 'feedback-unsupported') {
          assert.equal(calls.length, 2)
          assert.deepEqual(r.uiScan.productSource.unchecked, calls[1].args.decision.unchecked)
          assert.equal(r.uiScan.productSource.unsupported.reason, calls[1].args.decision.reason)
          assert.ok(
            events.some(
              (e) => e.type === 'finish:requested' && e.payload.reason === 'unverified-scope',
            ),
          )
        } else {
          assert.ok(calls.length <= 3)
          assert.equal(events.filter((e) => e.type === 'product:decision-query').length, 0)
        }
        continue
      }
      if (m === 'feedback-healthy') {
        assert.equal(events.filter((e) => e.type === 'product:decision').length, 1)
        assert.equal(events.filter((e) => e.type === 'product:decision-query').length, 0)
        const results = events
          .filter((e) => e.type === 'agent:response')
          .flatMap((e) => e.payload.toolResults)
        assert.ok(JSON.stringify(results).includes('product-one-decision-per-response'))
        assert.ok(
          results.some((t) => {
            const p = t.payload ?? t
            return (
              p.toolName === 'page_inspect' && /not found|not-offered/.test(String(p.result?.error))
            )
          }),
        )
      }
    }
    if ((stageBoundaryOnly || retrievalOnly) && m === 'feedback-healthy') {
      const first = calls[1].packet.latestToolResults.tools
      assert.equal(first.filter((t: any) => t.tool === 'product_source_read').length, 2)
      assert.ok(first.every((t: any) => !t.error)) // still in source stage: legal reads
      const afterRegistration = calls[2].packet.latestToolResults.tools
      assert.ok(afterRegistration.some((t: any) => t.error === 'product-stage-tool-not-allowed'))
      const current = calls[2].packet.productPath.steps[0].preconditions
      assert.equal(current.length, 2)
      assert.deepEqual(
        current.map((p: any) => p.expectation.expected),
        ['可用', '尚未预览'],
      )
    }
    if (retrievalOnly) {
      assert.ok(calls.every((c) => !c.wireTools.includes('product_path_gap')))
      if (m === 'feedback-unknown') {
        const delivered = calls.find((c) =>
          c.packet.latestToolResults?.tools?.some((t: any) => t.tool === 'tool_result_read'),
        )
        const receipt = delivered.packet.latestToolResults.tools.find(
          (t: any) => t.tool === 'tool_result_read',
        )
        assert.equal(
          receipt.resultRef,
          calls.find((c) => c.name === 'tool_result_read').args.resultRef,
        )
        assert.ok(receipt.chunk.length > 0)
        assert.ok(receipt.nextOffset > 0)
      }
    }
    if (handoffOnly && ['feedback-healthy', 'feedback-registration-stall'].includes(m)) {
      const guidance = events.filter(
        (e) =>
          e.type === 'execution:remaining-obligation-guidance' &&
          e.payload.kind === 'product-registration',
      )
      assert.equal(guidance.length, 1)
      assert.ok(
        calls.some((c) => c.packet.remainingObligationGuidance?.kind === 'product-registration'),
      )
      if (m === 'feedback-registration-stall') {
        assert.equal(state, 'unverified')
        assert.equal(r.uiScan.inspection.coverage, 'partial')
        assert.equal(
          events.filter((e) => e.type === 'product:planned' || e.type === 'action:executing')
            .length,
          0,
        )
        const closure = events.find((e) => e.type === 'run:no-progress')
        assert.equal(closure.payload.streak, 3)
        assert.ok(guidance[0].seq < closure.seq)
        assert.ok(calls.length <= 6)
        continue
      }
    }
    if (handoffOnly && ['feedback-healthy', 'feedback-defect'].includes(m)) {
      const bad = events.filter(
        (e) =>
          e.type === 'tool:finished' &&
          JSON.stringify(e.payload).includes('v2-requirement-not-owned'),
      )
      assert.equal(bad.length, m === 'feedback-healthy' ? 2 : 3)
      await save(m + '-handoff-comparison.json', {
        original: originalHandoff(m === 'feedback-healthy' ? 'R6' : 'R5').errors,
        replayed: calls.filter((c) => c.name === 'page_act'),
        rejected: bad,
        note: 'Original wrong requirementIds retained verbatim; only the observed ref is rebound to this isolated run. Valid calls copy program args. Fixed author responses do not prove live model adoption.',
      })
    }
    if (m.startsWith('feedback-')) {
      const unavailable = m.includes('unavailable')
      assert.equal(
        state,
        unavailable || m === 'feedback-unknown'
          ? 'unverified'
          : m === 'feedback-defect'
            ? 'failed'
            : 'verified',
      )
      assert.equal(events.filter((e) => e.type === 'action:executing').length, unavailable ? 0 : 2)
      assert.equal(events.filter((e) => e.type === 'product:planned').length, 1)
      assert.equal(events.filter((e) => e.type === 'product:binding-rejected').length, 1)
      assert.equal(events.filter((e) => e.type === 'product:bound').length, unavailable ? 0 : 2)
      assert.equal(
        r.uiScan.inspection.coverage,
        unavailable || m === 'feedback-unknown' ? 'partial' : 'covered',
      )
      if (m === 'feedback-unknown') {
        assert.equal(
          events.filter((e) => e.type === 'tool:started' && e.payload.tool === 'interaction_verify')
            .length,
          1,
        )
        assert.equal(calls.filter((c) => c.name === 'page_act').length, 3)
        assert.equal(r.uiScan.productSource.steps[1].state, 'unverified')
      }
      assert.ok(calls.some((c) => c.packet.productPath.execution.phase === 'repair-binding-input'))
      if (unavailable) {
        assert.ok(calls.some((c) => c.name === 'page_act'))
        assert.equal(
          events.find((e) => e.type === 'product:precondition-missing').payload.checks[0].outcome,
          'failed',
        )
      }
    } else if (m.startsWith('continuation-')) {
      const unavailable = m.includes('unavailable')
      assert.equal(
        state,
        unavailable ? 'unverified' : m === 'continuation-defect' ? 'failed' : 'verified',
      )
      assert.equal(events.filter((e) => e.type === 'action:executing').length, unavailable ? 0 : 2)
      assert.equal(events.filter((e) => e.type === 'product:planned').length, 1)
      assert.equal(events.filter((e) => e.type === 'product:registration-rejected').length, 0)
      assert.equal(r.uiScan.inspection.coverage, unavailable ? 'partial' : 'covered')
      if (m === 'continuation-unavailable-enabled') {
        assert.ok(calls.some((c) => c.name === 'page_act'))
        assert.equal(
          events.find((e) => e.type === 'product:precondition-missing').payload.checks[0].outcome,
          'failed',
        )
        assert.ok(
          calls.some((c) =>
            JSON.stringify(c.packet.latestToolResults).includes('product-precondition-missing'),
          ),
        )
      }
      if (m === 'continuation-defect') {
        const missing = events.find((e) => e.type === 'product:precondition-missing')
        assert.equal(missing.payload.checks[0].measured.count, 0)
        assert.equal(events.filter((e) => e.type === 'product:bound').length, 2)
      }
    } else if (m.startsWith('readiness-')) {
      const unavailable = m.includes('unavailable')
      assert.equal(
        state,
        unavailable ? 'unverified' : m === 'readiness-defect' ? 'failed' : 'verified',
      )
      assert.equal(r.uiScan.inspection.coverage, unavailable ? 'partial' : 'covered')
      assert.equal(events.filter((e) => e.type === 'action:executing').length, unavailable ? 0 : 2)
      assert.equal(events.filter((e) => e.type === 'product:planned').length, 1)
      assert.equal(events.filter((e) => e.type === 'product:registration-rejected').length, 1)
      assert.ok(
        events.find((e) => e.type === 'product:registration-rejected').seq <
          events.find((e) => e.type === 'product:planned').seq,
      )
      if (m === 'readiness-unavailable-enabled') {
        const unmet = events.find((e) => e.type === 'product:precondition-missing')
        assert.ok(unmet?.payload.itemId)
        assert.equal(unmet.payload.checks[0].outcome, 'failed')
        assert.ok(calls.some((c) => c.name === 'page_act'))
        assert.ok(
          calls.some((c) =>
            JSON.stringify(c.packet.latestToolResults).includes('product-precondition-missing'),
          ),
        )
      }
    } else if (m.startsWith('citation-')) {
      const unavailable = m === 'citation-unavailable'
      assert.equal(
        state,
        unavailable ? 'unverified' : m === 'citation-defect' ? 'failed' : 'verified',
      )
      assert.equal(r.uiScan.inspection.coverage, unavailable ? 'partial' : 'covered')
      assert.equal(events.filter((e) => e.type === 'action:executing').length, unavailable ? 0 : 2)
      assert.equal(events.filter((e) => e.type === 'product:planned').length, 1)
      const storedPlan = events.find((e) => e.type === 'product:planned').payload.plan
      assert.ok(storedPlan.steps.every((s: any) => s.citation.quote && !s.citation.citationId))
      if (!unavailable) {
        const binding = events.find((e) => e.type === 'product:bound' && e.payload.step === 1)
        assert.equal(binding.payload.targetWasSelected, false)
        assert.equal(binding.payload.admission.remaining.actions, 7)
        assert.ok(
          events
            .filter((e) => e.type === 'scope:sampling-default-selected')
            .every((e) => !e.payload.itemIds.includes(binding.payload.itemId)),
        )
      }
      if (m === 'citation-healthy') {
        assert.equal(events.filter((e) => e.type === 'product:registration-rejected').length, 1)
      }
    } else if (m === 'legacy') {
      assert.equal(r.uiScan.productSource, undefined)
      assert.equal(r.uiScan.inspection.coverage, 'covered')
    } else if (['healthy', 'two-step', 'defect', 'dynamic-healthy', 'dynamic-defect'].includes(m)) {
      assert.equal(state, ['defect', 'dynamic-defect'].includes(m) ? 'failed' : 'verified')
      assert.equal(r.uiScan.inspection.coverage, 'covered')
      assert.equal(
        events.filter((e) => e.type === 'action:executing').length,
        m === 'two-step' || m.startsWith('dynamic-') ? 2 : 1,
      )
    } else {
      assert.equal(r.uiScan.inspection.coverage, 'partial')
      assert.equal(state, ['pending', 'dynamic-pending'].includes(m) ? 'verified' : 'unverified')
      if (['ambiguous', 'missing'].includes(m))
        assert.equal(events.filter((e) => e.type === 'action:executing').length, 0)
    }
    if (m.startsWith('dynamic-')) {
      const bindings = events.filter((e) => e.type === 'product:bound')
      const second = bindings.find((e) => e.payload.step === 1)
      const admitted = ['dynamic-healthy', 'dynamic-defect', 'dynamic-pending'].includes(m)
      assert.equal(!!second, admitted)
      assert.equal(events.filter((e) => e.type === 'action:executing').length, admitted ? 2 : 1)
      if (second) {
        assert.equal(second.payload.targetWasSelected, false)
        assert.equal(second.payload.admission.remaining.actions, 7)
        assert.ok(
          events
            .filter((e) => e.type === 'scope:sampling-frozen')
            .every((e) => !JSON.stringify(e.payload).includes(second.payload.itemId)),
        )
        assert.ok(
          events
            .filter((e) => e.type === 'scope:sampling-default-selected')
            .every((e) => !e.payload.itemIds.includes(second.payload.itemId)),
        )
      }
      if (m === 'dynamic-pending') assert.ok(events.some((e) => e.type === 'finish:rejected'))
      if (m === 'dynamic-extra') {
        assert.equal(events.filter((e) => e.type === 'scope:admission-refused').length, 2)
        const extra = calls.find((c) => c.name === 'exploration_update').args.selectItems[0].itemId
        assert.ok(
          !events.some(
            (e) =>
              e.type === 'scope:item-updated' && e.payload.itemId === extra && e.payload.selected,
          ),
        )
        assert.ok(calls.some((c) => c.name === 'product_path_bind' && c.args.step === 1))
        assert.ok(calls.some((c) => c.name === 'page_act' && c.args.name === 'Extra'))
      }
    }
    if (m === 'healthy') {
      await page.locator('[aria-label="产品资料路径报告"]').waitFor()
      await page.screenshot({ path: resolve(root, 'workbench.png'), fullPage: true })
    }
  }
  if (continuationOnly) {
    fixture.closeAllConnections()
    await new Promise<void>((resolve) => fixture.close(() => resolve()))
  }
  // Restart and recover through both HTTP and the ordinary workbench history input.
  child.kill('SIGTERM')
  await new Promise((r) => child.once('exit', r))
  child = start()
  await ready()
  for (const m of continuationOnly
    ? continuationModes
    : readinessOnly
      ? readinessModes
      : citationsOnly
        ? citationModes
        : dynamicModes) {
    const recovered = await report(ids[m])
    assert.equal(recovered.uiScan.productSource.state, results.find((r) => r.mode === m).state)
    const original = JSON.parse(await readFile(resolve(root, m + '-report.json'), 'utf8'))
    assert.deepEqual(recovered, original)
    await save(m + '-restarted-report.json', recovered)
  }
  // Admission identity/budget records are required original evidence, also on historical replay.
  const admissionDb = createClient({ url: 'file:' + dbfile })
  const admissionRows = (
    await admissionDb.execute({
      sql: "SELECT file_path FROM artifacts WHERE run_id=? AND type='product-binding'",
      args: [
        ids[
          continuationOnly
            ? feedbackOnly
              ? 'feedback-healthy'
              : 'continuation-healthy'
            : readinessOnly
              ? 'readiness-healthy'
              : citationsOnly
                ? 'citation-healthy'
                : 'dynamic-healthy'
        ]!,
      ],
    })
  ).rows
  const admissionPath = (
    await Promise.all(
      admissionRows.map(async (row) => {
        const path = String(row.file_path)
        return { path, bytes: await readFile(path) }
      }),
    )
  ).find((row) => JSON.parse(row.bytes.toString()).admission)!
  assert.ok(admissionPath)
  const invalidBinding = JSON.parse(admissionPath.bytes.toString())
  invalidBinding.admission.identity = 'substituted-node'
  await writeFile(admissionPath.path, JSON.stringify(invalidBinding))
  const invalidAdmission = await report(
    ids[
      continuationOnly
        ? feedbackOnly
          ? 'feedback-healthy'
          : 'continuation-healthy'
        : readinessOnly
          ? 'readiness-healthy'
          : citationsOnly
            ? 'citation-healthy'
            : 'dynamic-healthy'
    ],
  )
  await save('admission-corrupt-report.json', invalidAdmission)
  assert.equal(invalidAdmission.uiScan.productSource.state, 'unverified')
  assert.equal(invalidAdmission.uiScan.inspection.coverage, 'partial')
  await writeFile(admissionPath.path, admissionPath.bytes)
  admissionDb.close()
  if (!dynamicOnly && !citationsOnly && !readinessOnly && !continuationOnly) {
    await page.reload()
    await page.getByLabel('恢复历史运行').fill(ids.healthy!)
    await page.getByRole('button', { name: '打开运行', exact: true }).click()
    await page.locator('[aria-label="产品资料路径报告"]').waitFor()
    assert.equal((await report(ids.healthy)).uiScan.productSource.state, 'verified')
    await page.screenshot({ path: resolve(root, 'history.png'), fullPage: true })
    const db = createClient({ url: 'file:' + dbfile })
    // Evidence corruption is applied only to this isolated test database/artifact set, then restored.
    const artifact = (
      await db.execute({
        sql: "SELECT file_path FROM artifacts WHERE run_id=? AND type='product-preconditions'",
        args: [ids.healthy!],
      })
    ).rows[0]!
    const path = String(artifact.file_path),
      original = await readFile(path)
    await writeFile(path, '[]\ncorrupted')
    const corrupted = await report(ids.healthy)
    await save('evidence-corrupt-report.json', corrupted)
    assert.equal(corrupted.uiScan.productSource.state, 'unverified')
    assert.equal(corrupted.uiScan.inspection.coverage, 'partial')
    await writeFile(path, original)
    const originalEvents = (await fetch(base + '/api/runs/' + ids.healthy + '/events').then((r) =>
      r.json(),
    )) as any[]
    const effectEvent = originalEvents.find((e) => e.type === 'interaction:effect-measured-v2')
    const screenshotRef = effectEvent.evidenceRefs.find((ref: string) => ref.endsWith('.png'))
    const shotRow = (
      await db.execute({ sql: 'SELECT file_path FROM artifacts WHERE id=?', args: [screenshotRef] })
    ).rows[0]!
    const shotPath = String(shotRow.file_path),
      shotBytes = await readFile(shotPath)
    await writeFile(shotPath, 'changed screenshot')
    const shotChanged = await report(ids.healthy)
    await save('screenshot-corrupt-report.json', shotChanged)
    assert.equal(shotChanged.uiScan.productSource.state, 'unverified')
    await writeFile(shotPath, shotBytes)
    const sourceEvent = originalEvents.find((e) => e.type === 'interaction:sources-reviewed-v2')
    const missingRef = Object.keys(sourceEvent.payload.evidenceHashes)[0]!
    const missingRow = (
      await db.execute({ sql: 'SELECT file_path FROM artifacts WHERE id=?', args: [missingRef] })
    ).rows[0]!
    const missingPath = String(missingRow.file_path)
    await rename(missingPath, missingPath + '.held')
    const missingReport = await report(ids.healthy)
    await save('evidence-missing-report.json', missingReport)
    assert.equal(missingReport.uiScan.productSource.state, 'unverified')
    await rename(missingPath + '.held', missingPath)
    // A new version is a new run, never a silent update of the old frozen contract.
    const stored = (
      await db.execute({ sql: 'SELECT spec FROM runs WHERE id=?', args: [ids.healthy!] })
    ).rows[0]!
    const spec = JSON.parse(String(stored.spec))
    spec.uiContract.productSource.markdown += '\nChanged source'
    await db.execute({
      sql: 'UPDATE runs SET spec=? WHERE id=?',
      args: [JSON.stringify(spec), ids.healthy!],
    })
    const changed = await report(ids.healthy)
    await save('source-corrupt-report.json', changed)
    assert.notEqual(changed.uiScan?.productSource?.state, 'verified')
    assert.notEqual(changed.uiScan?.inspection.coverage, 'covered')
    await db.execute({
      sql: 'UPDATE runs SET spec=? WHERE id=?',
      args: [String(stored.spec), ids.healthy!],
    })
    db.close()
  }
  const oldReports = []
  if ((readinessOnly || continuationOnly) && !stageBoundaryOnly && !retrievalOnly && !handoffOnly) {
    child.kill('SIGTERM')
    await new Promise((r) => child.once('exit', r))
    const requestCount = calls.length
    for (const { row, runId: oldRunId } of feedbackOnly
      ? [
          ...['R2', 'R6'].map(progressRow),
          ...(stageOnly ? [{ row: 'R1', runId: 'run-6dec5a41-7841-4900-8d16-ff1d11ba493e' }] : []),
        ]
      : continuationOnly
        ? continuationRows
        : readinessRows) {
      const oldRoot = resolve(
        stageOnly && row === 'R1'
          ? 'data/r2-product-acceptance/real-progress-authorized-20261011'
          : feedbackOnly
            ? 'data/r2-product-acceptance/real-final-candidate-authorized-20261011'
            : continuationOnly
              ? 'data/r2-product-acceptance/real-readiness-authorized-20261011'
              : 'data/r2-product-acceptance/real-citations-authorized-20261011',
        row,
      )
      const copy = resolve(root, row + '-historical.db')
      await copyFile(resolve(oldRoot, 'runs.db'), copy)
      child = start(copy)
      await ready()
      const restored = await report(oldRunId),
        original = JSON.parse(await readFile(resolve(oldRoot, 'report.json'), 'utf8'))
      assert.deepEqual(restored, original)
      await save(row + '-historical-report.json', restored)
      oldReports.push({ row, runId: oldRunId, fullJsonEqual: true })
      child.kill('SIGTERM')
      await new Promise((r) => child.once('exit', r))
    }
    assert.equal(calls.length, requestCount)
  }
  await save('acceptance.json', {
    passed: true,
    results,
    historyRestart: true,
    admissionCorruptionRejected: true,
    sourceCorruptionRejected: !dynamicOnly && !citationsOnly && !readinessOnly && !continuationOnly,
    evidenceCorruptionRejected:
      !dynamicOnly && !citationsOnly && !readinessOnly && !continuationOnly,
    missingEvidenceRejected: !dynamicOnly && !citationsOnly && !readinessOnly && !continuationOnly,
    screenshotCorruptionRejected:
      !dynamicOnly && !citationsOnly && !readinessOnly && !continuationOnly,
    model: 'fixed-local',
    citationReplay: citationsOnly,
    readinessReplay: readinessOnly,
    continuationReplay: continuationOnly && !feedbackOnly,
    progressFeedbackReplay: feedbackOnly,
    stageDecisions: stageOnly,
    registrationActionHandoff: handoffOnly,
    structuredRegistrationDecision: decisionOnly,
    directStageRetrieval: retrievalOnly,
    sameResponseStageBoundary: stageBoundaryOnly,
    historicalReports: oldReports,
    artifacts: Object.fromEntries(
      await Promise.all(
        Object.entries(ids).map(async ([m, id]) => [m, await hashTree('data/artifacts/' + id)]),
      ),
    ),
    paidCalls: 0,
  })
  console.log('R2 FREE ACCEPTANCE PASSED ' + root)
} catch (error) {
  await save('failure.json', { error: String(error), stack: (error as Error).stack })
  throw error
} finally {
  await save('server-log.json', logs)
  await browser?.close()
  child.kill('SIGTERM')
  model.closeAllConnections()
  model.close()
  fixture.closeAllConnections()
  fixture.close()
}
