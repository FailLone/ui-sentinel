import type { Page, Request } from 'playwright'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { observePage, saveEvidence } from '../execution/browser.ts'
import { installImageResourceCollector } from '../execution/image-paint.ts'
import { appendEvent, submitFinding } from '../execution/run-manager.ts'
import { getDbClient } from '../storage/database.ts'
import { createRuleEvaluationCache } from '../rules/routing.ts'
import {
  createControlTextDisappearanceRule,
  type ControlTextReceipt,
} from '../rules/builtin/control-text-disappearance.ts'
import type { PageSnapshot } from '../rules/types.ts'
import type { EvidenceIntegrity } from '../shared/evidence-integrity.ts'
import { readBatch2Facts, screenshotInk } from './batch2-facts.ts'
import { reviewImageFallbacks, type ImageRequestReceipt } from './image-fallback-review.ts'

/** One fresh capture + immediate evaluation. No saved candidate import or action surface. */
export function createRulesBatch2Experiment(options: {
  page: Page
  runId: string
  evidenceIntegrity: () => EvidenceIntegrity
  settleEvidence?: () => Promise<unknown>
}) {
  const { page, runId } = options
  installImageResourceCollector(page)
  const requests: ImageRequestReceipt[] = [],
    requestMap = new WeakMap<Request, ImageRequestReceipt>()
  let truncated = false,
    closed = false,
    tail: Promise<unknown> = Promise.resolve()
  const onRequest = (request: Request) => {
    if (request.resourceType() !== 'image') return
    if (requests.length >= 256) {
      truncated = true
      return
    }
    const record = {
      id: requests.length + 1,
      url: request.url(),
      startedAt: new Date().toISOString(),
    }
    requests.push(record)
    requestMap.set(request, record)
  }
  const onResponse = (response: import('playwright').Response) => {
    const r = requestMap.get(response.request())
    if (r) r.status = response.status()
  }
  const onFailed = (request: Request) => {
    const r = requestMap.get(request)
    if (r) r.failed = request.failure()?.errorText ?? 'request-failed'
  }
  const onFinished = (request: Request) => {
    const r = requestMap.get(request)
    if (r) r.finished = true
  }
  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfailed', onFailed)
  page.on('requestfinished', onFinished)
  const cache = createRuleEvaluationCache()
  const metadata = () => ({ evidenceIntegrity: options.evidenceIntegrity() })
  async function readOwned(ref: string) {
    const rows = await getDbClient().execute({
      sql: 'SELECT file_path FROM artifacts WHERE id=? AND run_id=?',
      args: [ref, runId],
    })
    if (rows.rows.length !== 1) throw Error('missing-owned-evidence')
    return readFile(String(rows.rows[0]!.file_path))
  }
  async function capture(raw: unknown = {}) {
    if (closed) throw Error('batch2-session-closed')
    const selected = z
      .object({
        controls: z.array(z.string().min(1).max(1000)).max(32).optional(),
        images: z.array(z.string().min(1).max(1000)).max(32).optional(),
      })
      .strict()
      .parse(raw)
    const observedAt = new Date().toISOString()
    const before = await readBatch2Facts(page, selected)
    const observation = await observePage(
      page,
      runId,
      metadata,
      before.images.map((i) => i.selector),
      { caret: 'initial' },
    )
    const after = await readBatch2Facts(page, {
      controls: before.controls.map((c) => c.selector),
      images: before.images.map((i) => i.selector),
    })
    // Totals belong to the enumerated page; omitted counts depend on automatic vs explicit selection.
    const identity = (d: typeof before) =>
      JSON.stringify({ ...d, omittedControls: 0, omittedImages: 0 })
    const stable = identity(before) === identity(after)
    const issues: string[] = []
    let pixels: ControlTextReceipt['pixels'] = []
    try {
      pixels = await screenshotInk(
        page,
        await readOwned(observation.snapshot.screenshotPath),
        after.controls,
      )
    } catch {
      issues.push('screenshot-pixel-read-unavailable')
    }
    await options.settleEvidence?.()
    const integrity = options.evidenceIntegrity()
    const rawRef = await saveEvidence(
      runId,
      'batch2-facts',
      JSON.stringify({
        before,
        after,
        stable,
        pixels,
        issues,
        requests,
        requestsTruncated: truncated,
        observedAt,
      }),
      metadata(),
    )
    const evidenceRefs = [
      ...observation.evidenceRefs,
      rawRef,
      ...(observation.snapshot.imagePaint?.flatMap((f) =>
        f.resource ? [f.resource.evidenceRef] : [],
      ) ?? []),
    ]
    const hashes = []
    for (const ref of evidenceRefs) {
      try {
        const bytes = await readOwned(ref)
        hashes.push({
          ref,
          sha256: createHash('sha256').update(bytes).digest('hex'),
          bytes: bytes.length,
        })
      } catch {
        issues.push('evidence-unavailable')
      }
    }
    const receipt: ControlTextReceipt = {
      runId,
      observedAt,
      expiresAt: new Date(Date.parse(observedAt) + 5 * 60 * 1000).toISOString(),
      dom: {
        ...after,
        omittedControls: before.omittedControls,
        omittedImages: before.omittedImages,
      },
      stable,
      issues,
      pixels,
      evidenceRefs,
      screenshotRef: observation.snapshot.screenshotPath,
      evidenceIntegrity: integrity,
    }
    const receiptRef = await saveEvidence(
      runId,
      'batch2-receipt',
      JSON.stringify({ receipt, hashes }),
      metadata(),
    )
    receipt.evidenceRefs = [...evidenceRefs, receiptRef]
    const rule = createControlTextDisappearanceRule(receipt)
    const result = (
      await cache.evaluate(rule, {
        runId,
        currentUrl: observation.snapshot.url,
        pageTitle: observation.snapshot.title,
        timestamp: new Date().toISOString(),
        events: [],
        snapshot: {
          ...observation.snapshot,
          evidenceIntegrity: options.evidenceIntegrity(),
        } as PageSnapshot,
      })
    ).result
    await appendEvent(
      runId,
      'rule:evaluated',
      { ...result, experiment: 'rules-batch2-1' },
      { evidenceRefs: [...result.evidenceRefs] },
    )
    if (result.verdict === 'fail')
      await submitFinding({
        runId,
        source: 'rule',
        ruleId: result.ruleId,
        ruleRevision: result.ruleRevision,
        hypothesisId: null,
        validationStatus: 'supported',
        severity: result.severity,
        title: result.title,
        expected: result.expected,
        actual: result.actual,
        stepId: null,
        evidenceRefs: result.evidenceRefs,
      })
    const review = reviewImageFallbacks({
      dom: receipt.dom,
      stable,
      issues,
      requests: structuredClone(requests),
      requestsTruncated: truncated,
      imagePaint: observation.snapshot.imagePaint ?? [],
      evidenceRefs: receipt.evidenceRefs,
      evidenceIntegrity: options.evidenceIntegrity(),
    })
    const reviewRef = await saveEvidence(
      runId,
      'image-fallback-review',
      JSON.stringify(review),
      metadata(),
    )
    await appendEvent(
      runId,
      'review:recorded',
      {
        reviewId: review.id,
        revision: review.revision,
        artifactRef: reviewRef,
        reviewNeeded: review.rows.filter((r) => r.disposition === 'review-needed').length,
        ruleEvaluated: false,
        confirmedDefects: 0,
      },
      { evidenceRefs: [reviewRef, ...receipt.evidenceRefs] },
    )
    return {
      version: 'rules-batch2-1',
      runId,
      observedAt,
      result,
      review,
      reviewRef,
      receiptRef,
      evidenceRefs: [...receipt.evidenceRefs, reviewRef],
      acceptanceClaim: false,
    }
  }
  const serial = <T>(fn: () => Promise<T>) => {
    const result = tail.then(fn)
    tail = result.catch(() => {})
    return result
  }
  return {
    capture: (input?: unknown) => serial(() => capture(input)),
    close: () =>
      serial(async () => {
        closed = true
        page.off('request', onRequest)
        page.off('response', onResponse)
        page.off('requestfailed', onFailed)
        page.off('requestfinished', onFinished)
      }),
  }
}
