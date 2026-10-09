import { assertInteractionFindingProof } from './interaction-finding-proof.ts'
import { assertProgramReceipt } from './investigation/promotion.ts'
import { createHash } from 'node:crypto'
import { deriveProbePoints } from './focus-geometry.ts'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Client } from '@libsql/client'
import { getDbClient, initDatabase } from '../storage/database.ts'
import { config } from '../shared/config.ts'
import { cleanEvidenceIntegrity, interventionLimitation } from '../shared/evidence-integrity.ts'
import { focusPromotionBlocked, type PromotionReceiptRef } from './focus-promotion.ts'
import type {
  Run,
  RunSpec,
  RunStatus,
  BusinessResult,
  RunUsage,
  RunEvent,
  Finding,
  Hypothesis,
  StopReason,
} from '../shared/types.ts'

type RunEventListener = (event: RunEvent) => void

interface ActiveRun {
  run: Run
  abortController: AbortController
  listeners: Set<RunEventListener>
  eventIds: string[]
  startedAt: number
}

const activeRuns = new Map<string, ActiveRun>()

function emptyUsage(): RunUsage {
  return {
    actions: 0,
    modelCalls: 0,
    elapsedMs: 0,
    modelInputTokens: 0,
    modelOutputTokens: 0,
  }
}

export async function createRun(
  spec: Omit<RunSpec, 'budget' | 'viewport'> & {
    budget?: Partial<RunSpec['budget']>
    viewport?: RunSpec['viewport']
  },
): Promise<Run> {
  await initDatabase()
  const db = getDbClient()

  const id = `run-${randomUUID()}`
  const now = new Date().toISOString()

  const fullSpec: RunSpec = {
    goal: spec.goal,
    environmentId: spec.environmentId,
    entryUrl: spec.entryUrl,
    budget: {
      totalTimeoutMs: spec.budget?.totalTimeoutMs ?? config.budget.totalTimeoutMs,
      maxActions: spec.budget?.maxActions ?? config.budget.maxActions,
      maxModelCalls: spec.budget?.maxModelCalls ?? config.budget.maxModelCalls,
    },
    viewport: spec.viewport ?? { width: 1280, height: 768 },
    // The discriminant and its contract are persisted before the run is queued; execution reads
    // these, never the live registry. The two contracts are mutually exclusive, so a caller that
    // supplies both is refused here rather than one silently winning in the executor.
    ...(spec.kind ? { kind: spec.kind } : {}),
    ...(spec.businessContract ? { businessContract: spec.businessContract } : {}),
    ...(spec.uiContract ? { uiContract: spec.uiContract } : {}),
  }
  if (fullSpec.kind === 'ui-scan' && fullSpec.businessContract)
    throw new Error('A ui-scan run cannot carry a business contract.')
  if (fullSpec.kind !== 'ui-scan' && fullSpec.uiContract)
    throw new Error('A UI contract requires an explicit ui-scan kind.')

  const run: Run = {
    id,
    spec: fullSpec,
    status: 'queued',
    businessResult: 'unknown',
    stopReason: null,
    usage: emptyUsage(),
    createdAt: now,
    updatedAt: now,
  }

  await db.execute({
    sql: `INSERT INTO runs (id, spec, status, business_result, stop_reason, usage, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      run.id,
      JSON.stringify(run.spec),
      run.status,
      run.businessResult,
      run.stopReason,
      JSON.stringify(run.usage),
      run.createdAt,
      run.updatedAt,
    ],
  })

  return run
}

export async function getRun(id: string): Promise<Run | null> {
  const db = getDbClient()
  const result = await db.execute({
    sql: 'SELECT * FROM runs WHERE id = ?',
    args: [id],
  })

  if (result.rows.length === 0) return null
  return rowToRun(result.rows[0])
}

/** One read transaction prevents reports combining a terminal row with an older event view. */
export async function getRunSnapshot(id: string, db: Client = getDbClient()) {
  const [runs, findings, events, hypothesisRows, artifactRows] = await db.batch(
    [
      { sql: 'SELECT * FROM runs WHERE id=?', args: [id] },
      { sql: 'SELECT * FROM findings WHERE run_id=? ORDER BY created_at', args: [id] },
      { sql: 'SELECT * FROM run_events WHERE run_id=? ORDER BY seq', args: [id] },
      { sql: 'SELECT * FROM hypotheses WHERE run_id=? ORDER BY created_at', args: [id] },
      { sql: 'SELECT * FROM artifacts WHERE run_id=? ORDER BY created_at', args: [id] },
    ],
    'read',
  )
  if (!runs!.rows[0]) return null
  return {
    run: rowToRun(runs!.rows[0]),
    findings: findings!.rows.map(rowToFinding),
    events: events!.rows.map(rowToEvent),
    hypothesisRows: hypothesisRows!,
    artifactRows: artifactRows!,
  }
}

export async function updateRunStatus(
  id: string,
  status: RunStatus,
  extra?: {
    businessResult?: BusinessResult
    stopReason?: StopReason
    usage?: RunUsage
  },
): Promise<Run | null> {
  const db = getDbClient()
  const now = new Date().toISOString()

  const sets = ['status = ?', 'updated_at = ?']
  const args: any[] = [status, now]

  if (extra?.businessResult) {
    sets.push('business_result = ?')
    args.push(extra.businessResult)
  }
  if (extra?.stopReason) {
    sets.push('stop_reason = ?')
    args.push(extra.stopReason)
  }
  if (extra?.usage) {
    sets.push('usage = ?')
    args.push(JSON.stringify(extra.usage))
  }

  args.push(id)

  await db.execute({
    sql: `UPDATE runs SET ${sets.join(', ')} WHERE id = ?`,
    args,
  })

  return getRun(id)
}

async function appendEventInternal(
  runId: string,
  type: string,
  payload: Record<string, unknown> = {},
  extra?: {
    stepId?: string
    actionId?: string
    evidenceRefs?: string[]
  },
): Promise<RunEvent> {
  const db = getDbClient()

  const active = activeRuns.get(runId)
  let seq: number
  {
    const maxResult = await db.execute({
      sql: 'SELECT COALESCE(MAX(seq), -1) as max_seq FROM run_events WHERE run_id = ?',
      args: [runId],
    })
    seq = Number(maxResult.rows[0].max_seq) + 1
  }

  const event: RunEvent = {
    id: `evt-${randomUUID()}`,
    runId,
    seq,
    type,
    timestamp: new Date().toISOString(),
    stepId: extra?.stepId ?? null,
    actionId: extra?.actionId ?? null,
    payload,
    evidenceRefs: extra?.evidenceRefs ?? [],
  }

  await db.execute({
    sql: `INSERT INTO run_events (id, run_id, seq, type, timestamp, step_id, action_id, payload, evidence_refs)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      event.id,
      event.runId,
      event.seq,
      event.type,
      event.timestamp,
      event.stepId,
      event.actionId,
      JSON.stringify(event.payload),
      JSON.stringify(event.evidenceRefs),
    ],
  })

  if (active) {
    // Retained independently of later database reads, including a rolled-back/reused sequence.
    active.eventIds.push(event.id)
    for (const listener of active.listeners) {
      try {
        listener(event)
      } catch {
        /* swallow listener errors */
      }
    }
  }

  return event
}

/**
 * Read run events, oldest first.
 *
 * `limit` narrows a page for a paging reader; it does not define the history. A caller that wants the
 * whole log pages by `after` until a page comes back short, which is what `collectFullEventHistory`
 * does - reading with a limit and treating the last page as the end would silently drop events.
 */
export async function getEvents(
  runId: string,
  afterSeq?: number,
  limit?: number,
): Promise<readonly RunEvent[]> {
  const db = getDbClient()

  const conditions = ['run_id = ?']
  const args: (string | number)[] = [runId]
  if (afterSeq != null) {
    conditions.push('seq > ?')
    args.push(afterSeq)
  }
  const sql = `SELECT * FROM run_events WHERE ${conditions.join(' AND ')} ORDER BY seq${
    limit != null ? ' LIMIT ?' : ''
  }`
  if (limit != null) args.push(limit)

  const result = await db.execute({ sql, args })
  return result.rows.map(rowToEvent)
}

/** Check saved receipts and the immutable origin of a hypothesis, not model-supplied labels. */
export async function assertUnmodifiedEvidence(
  runId: string,
  evidenceRefs: readonly string[],
  hypothesisId?: string | null,
) {
  const db = getDbClient()
  const refs = new Set(evidenceRefs)
  if (hypothesisId) {
    const hypotheses = await db.execute({
      sql: 'SELECT evidence_refs FROM hypotheses WHERE id=? AND run_id=?',
      args: [hypothesisId, runId],
    })
    for (const row of hypotheses.rows)
      for (const ref of JSON.parse(String(row.evidence_refs))) refs.add(ref)
    const origins = await db.execute({
      sql: "SELECT payload,evidence_refs FROM run_events WHERE run_id=? AND type='hypothesis:created'",
      args: [runId],
    })
    for (const row of origins.rows)
      if (JSON.parse(String(row.payload)).hypothesisId === hypothesisId) {
        for (const ref of JSON.parse(String(row.evidence_refs))) refs.add(ref)
      }
  }
  if (!refs.size) return
  const artifacts = await db.execute({
    sql: 'SELECT id,metadata FROM artifacts WHERE run_id=?',
    args: [runId],
  })
  for (const row of artifacts.rows) {
    if (!refs.has(String(row.id))) continue
    const metadata = JSON.parse(String(row.metadata))
    // Historical artifacts have no receipt. New executor captures and derived evidence do.
    if (
      metadata.evidenceIntegrity !== undefined &&
      !cleanEvidenceIntegrity(metadata.evidenceIntegrity)
    )
      throw Error(interventionLimitation)
  }
}

export async function submitFinding(
  finding: Omit<Finding, 'id' | 'createdAt'>,
  guard: () => void = () => {},
): Promise<Finding> {
  const db = getDbClient()
  if (['supported', 'refuted'].includes(finding.validationStatus)) {
    await assertUnmodifiedEvidence(finding.runId, finding.evidenceRefs, finding.hypothesisId)
    if (finding.hypothesisId)
      await assertPromotableHypothesis(
        finding.runId,
        finding.hypothesisId,
        finding.validationStatus as 'supported' | 'refuted',
        finding.evidenceRefs,
      )
  }
  const id = `finding-${randomUUID()}`
  const now = new Date().toISOString()

  const full: Finding = { ...finding, id, createdAt: now }

  guard()
  await db.execute({
    sql: `INSERT INTO findings (id, run_id, source, rule_id, rule_revision, hypothesis_id, validation_status, severity, title, expected, actual, step_id, evidence_refs, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      full.id,
      full.runId,
      full.source,
      full.ruleId,
      full.ruleRevision,
      full.hypothesisId,
      full.validationStatus,
      full.severity,
      full.title,
      full.expected,
      full.actual,
      full.stepId,
      JSON.stringify(full.evidenceRefs),
      full.createdAt,
    ],
  })

  return full
}

export async function getFindings(runId: string): Promise<readonly Finding[]> {
  const db = getDbClient()
  const result = await db.execute({
    sql: 'SELECT * FROM findings WHERE run_id = ? ORDER BY created_at',
    args: [runId],
  })
  return result.rows.map(rowToFinding)
}

export async function recordHypothesis(
  h: Omit<Hypothesis, 'id' | 'createdAt'> & {
    /**
     * The hypothesis's recorded class. Set only by a server-side path that produced its own
     * measurement - never from agent-supplied wording. Persisted on the created event, which is
     * append-only, so a later status change cannot rewrite the class it was registered under.
     */
    kind?: 'visual-focus' | 'program' | 'ui-interaction'
    /** The candidate a visual-focus hypothesis is bound to, for the promotion gate. */
    visualCandidateId?: string
  },
): Promise<Hypothesis> {
  const db = getDbClient()
  const id = `hyp-${randomUUID()}`
  const now = new Date().toISOString()

  const full: Hypothesis = { ...h, id, createdAt: now }

  await db.execute({
    sql: `INSERT INTO hypotheses (id, run_id, phenomenon, basis, verification_plan, status, evidence_refs, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      full.id,
      full.runId,
      full.phenomenon,
      full.basis,
      full.verificationPlan,
      full.status,
      JSON.stringify(full.evidenceRefs),
      full.createdAt,
    ],
  })

  await appendEvent(
    h.runId,
    'hypothesis:created',
    {
      hypothesisId: id,
      ...(h.kind ? { kind: h.kind } : {}),
      ...(h.visualCandidateId ? { visualCandidateId: h.visualCandidateId } : {}),
    },
    { evidenceRefs: [...h.evidenceRefs] },
  )
  return full
}

/**
 * Read a hypothesis's recorded class and bound candidate from its created event.
 *
 * The created event is the authority rather than a column, because it is append-only and written by
 * the server while resolving a hypothesis. A hypothesis with no recorded class is an ordinary one.
 */
export async function hypothesisClass(
  runId: string,
  hypothesisId: string,
): Promise<{
  kind: 'visual-focus' | 'program' | 'ui-interaction' | null
  visualCandidateId: string | null
}> {
  const db = getDbClient()
  const rows = await db.execute({
    sql: `SELECT payload FROM run_events WHERE run_id = ? AND type = 'hypothesis:created'`,
    args: [runId],
  })
  for (const row of rows.rows) {
    const payload = JSON.parse(String(row.payload)) as {
      hypothesisId?: string
      kind?: string
      visualCandidateId?: string
    }
    if (payload.hypothesisId !== hypothesisId) continue
    return {
      kind:
        payload.kind === 'visual-focus' ||
        payload.kind === 'program' ||
        payload.kind === 'ui-interaction'
          ? payload.kind
          : null,
      visualCandidateId:
        typeof payload.visualCandidateId === 'string' ? payload.visualCandidateId : null,
    }
  }
  return { kind: null, visualCandidateId: null }
}

/**
 * Load the typed focus receipts recorded for a run, so the promotion gate can require a real
 * measurement rather than a generic screenshot plus any snapshot.
 */
async function loadFocusReceipts(runId: string): Promise<PromotionReceiptRef[]> {
  const db = getDbClient()
  const rows = await db.execute({
    sql: `SELECT id, file_path FROM artifacts WHERE run_id = ? AND type = 'focus-receipt'`,
    args: [runId],
  })
  const receipts: PromotionReceiptRef[] = []
  for (const row of rows.rows) {
    try {
      const receipt = JSON.parse(await readFile(String(row.file_path), 'utf8'))
      receipts.push({ artifactId: String(row.id), receipt })
    } catch {
      // A receipt that cannot be read is not a receipt; the gate treats it as absent.
    }
  }
  return receipts
}

/**
 * Refuse promotion of a visual-focus hypothesis that carries no valid receipt.
 *
 * Enforced here as well as in the tool surface, so the ordinary findings path cannot promote this
 * class by re-titling an old hypothesis (plan 4.6). Exported because the tool has to run it BEFORE it
 * inserts the finding: a refusal that fires afterwards still leaves the row behind, which is the
 * fabricated finding the gate exists to prevent.
 */
export async function assertPromotableHypothesis(
  runId: string,
  hypothesisId: string,
  status: 'supported' | 'refuted' = 'supported',
  evidenceRefs: readonly string[] = [],
): Promise<void> {
  const recorded = await hypothesisClass(runId, hypothesisId)
  if (recorded.kind === 'ui-interaction') {
    if (status !== 'supported') throw Error('interaction-finding-status-invalid')
    const rows = await getDbClient().execute({
      sql: 'SELECT id,type,file_path,metadata FROM artifacts WHERE run_id=?',
      args: [runId],
    })
    return assertInteractionFindingProof(
      runId,
      await getEvents(runId),
      rows.rows.map((r) => ({
        id: String(r.id),
        type: String(r.type),
        path: String(r.file_path),
        metadata: JSON.parse(String(r.metadata)),
      })),
      hypothesisId,
      evidenceRefs,
    )
  }
  if (recorded.kind === 'program')
    return assertProgramReceipt(getDbClient(), runId, hypothesisId, status, evidenceRefs)
  if (recorded.kind !== 'visual-focus') return
  const db = getDbClient()
  // The screenshots THIS run owns, so a receipt's screenshot claim can be checked against evidence
  // rather than against itself.
  const rows = await db.execute({
    sql: 'SELECT id,type,file_path,metadata FROM artifacts WHERE run_id=?',
    args: [runId],
  })
  const owned = rows.rows.filter((r) => evidenceRefs.includes(String(r.id)))
  const candidateRow = owned.find(
    (r) =>
      r.type === 'visual-candidate' &&
      JSON.parse(String(r.metadata)).candidateId === recorded.visualCandidateId,
  )
  if (!candidateRow)
    throw Error('visual-focus promotion requires a valid focus receipt and its candidate evidence')
  const candidate = JSON.parse(await readFile(String(candidateRow.file_path), 'utf8'))
  const shot = owned.find((r) => r.id === candidate.screenshotRef && r.type === 'screenshot')
  if (!shot || candidate.runId !== runId) throw Error('visual-focus candidate screenshot mismatch')
  const sha = createHash('sha256')
    .update(await readFile(String(shot.file_path)))
    .digest('hex')
  const receipts = (await loadFocusReceipts(runId)).filter((r) =>
    evidenceRefs.includes(r.artifactId),
  )
  const qualified = []
  for (const ref of receipts) {
    const r = ref.receipt as import('./focus-receipt.ts').FocusReceipt
    if (
      r?.candidateId !== candidate.id ||
      r.screenshotRef !== candidate.screenshotRef ||
      r.screenshotSha !== sha ||
      candidate.screenshotSha !== sha
    )
      continue
    const points = deriveProbePoints({
      region: candidate.perceivedRegion,
      excluded: candidate.excludedRegions,
      dangerous: [],
    }).points
    if (
      !r.samples ||
      !r.samples.every((s) =>
        points.some(
          (p) =>
            p.side === (s.side === 'retest' ? s.retestOf : s.side) && p.x === s.x && p.y === s.y,
        ),
      )
    )
      continue
    const measurementRows = owned.filter(
      (row) =>
        row.type === 'measurement' && JSON.parse(String(row.metadata)).kind === 'focus-samples',
    )
    let measured = false
    for (const row of measurementRows) {
      const body = JSON.parse(await readFile(String(row.file_path), 'utf8'))
      if (
        body.receiptRef === ref.artifactId &&
        JSON.stringify(body.samples) === JSON.stringify(r.samples)
      )
        measured = true
    }
    const annotated = owned.some((row) => {
      const m = JSON.parse(String(row.metadata))
      return (
        row.type === 'screenshot' &&
        m.annotation === true &&
        m.sourceRef === candidate.screenshotRef &&
        m.kind === 'focus-annotation'
      )
    })
    if (measured && annotated) qualified.push(ref)
  }
  const blocked = focusPromotionBlocked({
    hypothesis: { ...recorded, kind: 'visual-focus' },
    receipts: qualified,
    screenshotRefs: [candidate.screenshotRef],
    status,
    confidence: candidate.confidence,
  })
  if (blocked.blocked)
    throw new Error(
      `visual-focus promotion requires a valid focus receipt bound to its candidate (${blocked.reason})`,
    )
}

export async function updateHypothesis(
  id: string,
  status: Hypothesis['status'],
  evidenceRefs?: string[],
  guard: () => void = () => {},
): Promise<void> {
  const db = getDbClient()
  if (['supported', 'refuted'].includes(status)) {
    const rows = await db.execute({ sql: 'SELECT run_id FROM hypotheses WHERE id=?', args: [id] })
    if (rows.rows.length) {
      const runId = String(rows.rows[0].run_id)
      await assertUnmodifiedEvidence(runId, evidenceRefs ?? [], id)
      await assertPromotableHypothesis(runId, id, status as 'supported' | 'refuted', evidenceRefs)
    }
  }
  const args: any[] = [status]

  let sql = 'UPDATE hypotheses SET status = ?'
  if (evidenceRefs) {
    sql += ', evidence_refs = ?'
    args.push(JSON.stringify(evidenceRefs))
  }
  sql += ' WHERE id = ?'
  args.push(id)

  guard()
  await db.execute({ sql, args })
}

export function registerActiveRun(runId: string): ActiveRun {
  const abortController = new AbortController()
  const active: ActiveRun = {
    run: null as unknown as Run,
    abortController,
    listeners: new Set(),
    eventIds: [],
    startedAt: Date.now(),
  }
  activeRuns.set(runId, active)
  return active
}

export function getActiveRun(runId: string): ActiveRun | undefined {
  return activeRuns.get(runId)
}

export function removeActiveRun(runId: string): void {
  activeRuns.delete(runId)
}

export function subscribeToEvents(runId: string, listener: RunEventListener): () => void {
  const active = activeRuns.get(runId)
  if (!active) return () => {}

  active.listeners.add(listener)
  return () => active.listeners.delete(listener)
}

export function isRunActive(runId: string): boolean {
  return activeRuns.has(runId)
}

function rowToRun(row: Record<string, unknown>): Run {
  return {
    id: String(row.id),
    spec: JSON.parse(String(row.spec)),
    status: String(row.status) as RunStatus,
    businessResult: String(row.business_result) as BusinessResult,
    stopReason: row.stop_reason ? (String(row.stop_reason) as StopReason) : null,
    usage: JSON.parse(String(row.usage)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function rowToEvent(row: Record<string, unknown>): RunEvent {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    seq: Number(row.seq),
    type: String(row.type),
    timestamp: String(row.timestamp),
    stepId: row.step_id ? String(row.step_id) : null,
    actionId: row.action_id ? String(row.action_id) : null,
    payload: JSON.parse(String(row.payload)),
    evidenceRefs: JSON.parse(String(row.evidence_refs)),
  }
}

function rowToFinding(row: Record<string, unknown>): Finding {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    source: String(row.source) as Finding['source'],
    ruleId: row.rule_id ? String(row.rule_id) : null,
    ruleRevision: row.rule_revision ? String(row.rule_revision) : null,
    hypothesisId: row.hypothesis_id ? String(row.hypothesis_id) : null,
    validationStatus: String(row.validation_status) as Finding['validationStatus'],
    severity: String(row.severity) as Finding['severity'],
    title: String(row.title),
    expected: String(row.expected),
    actual: String(row.actual),
    stepId: row.step_id ? String(row.step_id) : null,
    evidenceRefs: JSON.parse(String(row.evidence_refs)),
    createdAt: String(row.created_at),
  }
}

let eventTail: Promise<unknown> = Promise.resolve()
export function appendEvent(...args: Parameters<typeof appendEventInternal>): Promise<RunEvent> {
  const result = eventTail.then(() => appendEventInternal(...args))
  eventTail = result.catch(() => {})
  return result
}

export async function reconcileInterruptedRuns(): Promise<void> {
  await initDatabase()
  const rows = await getDbClient().execute(
    "SELECT id FROM runs WHERE status IN ('queued','running')",
  )
  for (const row of rows.rows) {
    const id = String(row.id)
    await updateRunStatus(id, 'interrupted', { stopReason: 'reconciliation-required' })
    await appendEvent(id, 'run:interrupted', {
      reason: 'reconciliation-required',
      replayAllowed: false,
    })
  }
}
