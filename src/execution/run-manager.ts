import { randomUUID } from 'node:crypto'
import { getDbClient, initDatabase } from '../storage/database.ts'
import { config } from '../shared/config.ts'
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
  seq: number
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

export async function createRun(spec: Omit<RunSpec, 'budget' | 'viewport'> & {
  budget?: Partial<RunSpec['budget']>
  viewport?: RunSpec['viewport']
}): Promise<Run> {
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
  }

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
    for (const listener of active.listeners) {
      try {
        listener(event)
      } catch { /* swallow listener errors */ }
    }
  }

  return event
}

export async function getEvents(
  runId: string,
  afterSeq?: number,
): Promise<readonly RunEvent[]> {
  const db = getDbClient()

  const sql = afterSeq != null
    ? 'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq'
    : 'SELECT * FROM run_events WHERE run_id = ? ORDER BY seq'

  const args = afterSeq != null ? [runId, afterSeq] : [runId]

  const result = await db.execute({ sql, args })
  return result.rows.map(rowToEvent)
}

export async function submitFinding(finding: Omit<Finding, 'id' | 'createdAt'>): Promise<Finding> {
  const db = getDbClient()
  const id = `finding-${randomUUID()}`
  const now = new Date().toISOString()

  const full: Finding = { ...finding, id, createdAt: now }

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

export async function recordHypothesis(h: Omit<Hypothesis, 'id' | 'createdAt'>): Promise<Hypothesis> {
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

  return full
}

export async function updateHypothesis(
  id: string,
  status: Hypothesis['status'],
  evidenceRefs?: string[],
): Promise<void> {
  const db = getDbClient()
  const args: any[] = [status]

  let sql = 'UPDATE hypotheses SET status = ?'
  if (evidenceRefs) {
    sql += ', evidence_refs = ?'
    args.push(JSON.stringify(evidenceRefs))
  }
  sql += ' WHERE id = ?'
  args.push(id)

  await db.execute({ sql, args })
}

export function registerActiveRun(runId: string): ActiveRun {
  const abortController = new AbortController()
  const active: ActiveRun = {
    run: null as unknown as Run,
    abortController,
    listeners: new Set(),
    seq: 0,
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

export function subscribeToEvents(
  runId: string,
  listener: RunEventListener,
): () => void {
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
  const rows = await getDbClient().execute("SELECT id FROM runs WHERE status IN ('queued','running')")
  for (const row of rows.rows) {
    const id = String(row.id)
    await updateRunStatus(id, 'interrupted', {stopReason:'reconciliation-required'})
    await appendEvent(id, 'run:interrupted', {reason:'reconciliation-required', replayAllowed:false})
  }
}
