import type { Page } from 'playwright'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readBatch2Facts, screenshotInk, type Batch2Dom } from '../experiments/batch2-facts.ts'
import { reviewImageFallbacks } from '../experiments/image-fallback-review.ts'
import {
  createControlTextDisappearanceRule,
  type ControlTextReceipt,
} from '../rules/builtin/control-text-disappearance.ts'
import { createRuleEvaluationCache } from '../rules/routing.ts'
import type { RuleContext, RuleResult } from '../rules/types.ts'
import { cleanEvidenceIntegrity, type EvidenceIntegrity } from '../shared/evidence-integrity.ts'
import { getDbClient } from '../storage/database.ts'
import { observeImageRequests } from './image-request-observer.ts'
import { saveEvidence, type observePage } from './browser.ts'
import { appendEvent } from './run-manager.ts'

export interface UiRuleReportBody {
  version: 'ui-rule-observation-1'
  runId: string
  url: string
  observedAt: string
  screenshotSha256: string
  screenshotRef: string
  evidenceRefs: string[]
  timing: {
    sharedObservationMs: number
    prepareMs: number
    completeMs: number
    evaluateMs: number
    addedMs: number
  }
  controls: {
    total: number
    enumerated: number
    omitted: number
    unknown: number
    rows: { selector: string; text: string; verdict: string; reason: string }[]
  }
  images: {
    total: number
    enumerated: number
    omitted: number
    unknown: number
    rows: {
      selector: string
      state: string
      disposition: string
      reasons: string[]
      text: string[]
      alternatives: string[]
      layout: string
      association: string
    }[]
  }
}
const identity = (d: Batch2Dom) => JSON.stringify({ ...d, omittedControls: 0, omittedImages: 0 })

/** Executor-owned adapter: reuses the single ordinary observation and its screenshot. */
export function createUiRuleObservation(
  page: Page,
  runId: string,
  integrity: () => EvidenceIntegrity,
) {
  const ledger = observeImageRequests(page),
    cache = createRuleEvaluationCache()
  let current:
    | {
        receipt: ControlTextReceipt
        images: NonNullable<Awaited<ReturnType<typeof observePage>>['snapshot']['imagePaint']>
        screenshotSha256: string
        timing: { prepareMs: number; completeMs: number; sharedObservationMs: number }
      }
    | undefined
  let last: { key: string; result: RuleResult; body: UiRuleReportBody } | undefined
  const metadata = () => ({ evidenceIntegrity: integrity() })
  async function prepare() {
    const start = performance.now()
    const before = await readBatch2Facts(page)
    return { before, prepareMs: performance.now() - start }
  }
  async function complete(
    prepared: Awaited<ReturnType<typeof prepare>>,
    observation: Awaited<ReturnType<typeof observePage>>,
    sharedObservationMs: number,
  ) {
    const start = performance.now(),
      before = prepared.before
    const after = await readBatch2Facts(page, {
      controls: before.controls.map((c) => c.selector),
      images: before.images.map((i) => i.selector),
    })
    const owned = await getDbClient().execute({
      sql: 'SELECT file_path FROM artifacts WHERE run_id=? AND id=? AND type=?',
      args: [runId, observation.snapshot.screenshotPath, 'screenshot'],
    })
    if (owned.rows.length !== 1) throw Error('ui-rule-owned-screenshot-unavailable')
    const png = await readFile(String(owned.rows[0]!.file_path))
    const pixels = await screenshotInk(page, png, after.controls)
    const observedAt = observation.snapshot.observedAt
    const receipt: ControlTextReceipt = {
      runId,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 300000).toISOString(),
      dom: {
        ...after,
        omittedControls: before.omittedControls,
        omittedImages: before.omittedImages,
      },
      stable: identity(before) === identity(after),
      issues: [],
      pixels,
      screenshotRef: observation.snapshot.screenshotPath,
      evidenceRefs: [
        ...observation.evidenceRefs,
        ...(observation.snapshot.imagePaint ?? []).flatMap((f) =>
          f.resource ? [f.resource.evidenceRef] : [],
        ),
      ],
      evidenceIntegrity: integrity(),
    }
    const factsRef = await saveEvidence(
      runId,
      'ui-rule-facts',
      JSON.stringify({
        receipt,
        before,
        screenshotSha256: createHash('sha256').update(png).digest('hex'),
        requests: ledger.snapshot(),
      }),
      metadata(),
    )
    receipt.evidenceRefs.push(factsRef)
    current = {
      receipt,
      images: observation.snapshot.imagePaint ?? [],
      screenshotSha256: createHash('sha256').update(png).digest('hex'),
      timing: {
        sharedObservationMs,
        prepareMs: prepared.prepareMs,
        completeMs: performance.now() - start,
      },
    }
    last = undefined
  }
  async function evaluate(context: RuleContext) {
    if (!current) throw Error('ui-rule-observation-missing')
    const start = performance.now(),
      { receipt, images } = current
    // New DOM, style, resource/loading and identity facts must still match. Never import old claims.
    const live = await readBatch2Facts(page, {
      controls: receipt.dom.controls.map((c) => c.selector),
      images: receipt.dom.images.map((i) => i.selector),
    })
    const fresh = identity(live) === identity(receipt.dom)
    const key = JSON.stringify([
      receipt.screenshotRef,
      identity(live),
      integrity(),
      Date.now() < Date.parse(receipt.expiresAt),
    ])
    if (last?.key === key) return { result: last.result, reused: true, body: last.body }
    const input = { ...receipt, stable: receipt.stable && fresh, evidenceIntegrity: integrity() }
    let result = (
      await cache.evaluate(createControlTextDisappearanceRule(input), {
        ...context,
        timestamp: new Date().toISOString(),
        snapshot: { ...context.snapshot, evidenceIntegrity: integrity() },
      })
    ).result
    // Static capability limits use the existing unchecked representation. No completion gate changes.
    const capabilityLimit =
      cleanEvidenceIntegrity(integrity()) &&
      input.stable &&
      !input.issues.length &&
      Date.now() < Date.parse(input.expiresAt) &&
      context.snapshot.screenshotPath === input.screenshotRef
    if (result.verdict === 'unknown' && capabilityLimit)
      result = { ...result, unchecked: { reasonCode: 'control-text-supported-scope-limit' } }
    const requests = ledger.snapshot()
    const review = reviewImageFallbacks({
      dom: input.dom,
      stable: input.stable,
      issues: Date.now() >= Date.parse(input.expiresAt) ? ['evidence-expired'] : [],
      requests: requests.requests,
      requestsTruncated: requests.truncated,
      imagePaint: images,
      evidenceRefs: input.evidenceRefs,
      evidenceIntegrity: integrity(),
    })
    const reviewRef = await saveEvidence(
      runId,
      'image-fallback-review',
      JSON.stringify(review),
      metadata(),
    )
    const rows = result.details.rows as {
      selector: string
      verdict: string
      reason: string
      fact: { text: string }
    }[]
    const body: UiRuleReportBody = {
      version: 'ui-rule-observation-1',
      runId,
      url: input.dom.url,
      observedAt: input.observedAt,
      screenshotSha256: current.screenshotSha256,
      screenshotRef: input.screenshotRef,
      evidenceRefs: [...input.evidenceRefs, reviewRef],
      timing: {
        ...current.timing,
        evaluateMs: performance.now() - start,
        addedMs: current.timing.prepareMs + current.timing.completeMs + performance.now() - start,
      },
      controls: {
        total: input.dom.totalControls,
        enumerated: rows.length,
        omitted: input.dom.omittedControls,
        unknown: rows.filter((r) => r.verdict === 'unknown').length,
        rows: rows.map((r) => ({
          selector: r.selector,
          text: r.fact.text,
          verdict: r.verdict,
          reason: r.reason,
        })),
      },
      images: {
        total: review.total,
        enumerated: review.rows.length,
        omitted: review.omitted,
        unknown: review.rows.filter((r) => r.disposition === 'unknown').length,
        rows: review.rows.map((r) => ({
          selector: r.selector,
          state: r.resourceState,
          disposition: r.disposition,
          reasons: r.reasons,
          text: r.measured.image?.nearby.map((n) => n.text) ?? [],
          alternatives:
            r.measured.image?.alternatives.map((i) => `${i.selector}: ${i.url || '无当前资源'}`) ??
            [],
          layout: r.measured.image
            ? `${Math.round(r.measured.image.bounds.width)} × ${Math.round(r.measured.image.bounds.height)} CSS px`
            : '未取得',
          association: '仅同父区域结构关联；身份等效、文字可读/无遮挡及替代图含义未确认',
        })),
      },
    }
    const serialized = JSON.stringify(body),
      artifactRef = await saveEvidence(runId, 'ui-rule-observation', serialized, metadata())
    await appendEvent(
      runId,
      'ui-rules:observed',
      {
        artifactRef,
        sha256: createHash('sha256').update(serialized).digest('hex'),
        screenshotSha256: current.screenshotSha256,
        screenshotRef: input.screenshotRef,
        url: body.url,
      },
      { evidenceRefs: [artifactRef, ...body.evidenceRefs] },
    )
    last = { key, result, body }
    return { result, reused: false, body }
  }
  return { prepare, complete, evaluate, close: ledger.close }
}
