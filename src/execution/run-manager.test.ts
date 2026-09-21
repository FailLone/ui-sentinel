import { describe, it, expect, beforeEach } from 'vitest'
import { createClient } from '@libsql/client'

describe('run-manager operations', () => {
  let db: ReturnType<typeof createClient>

  beforeEach(async () => {
    db = createClient({ url: ':memory:' })

    await db.executeMultiple(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        spec TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        business_result TEXT NOT NULL DEFAULT 'unknown',
        stop_reason TEXT,
        usage TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS run_events (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        type TEXT NOT NULL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        step_id TEXT,
        action_id TEXT,
        payload TEXT NOT NULL DEFAULT '{}',
        evidence_refs TEXT NOT NULL DEFAULT '[]',
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_run_events_seq ON run_events(run_id, seq);

      CREATE TABLE IF NOT EXISTS findings (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        source TEXT NOT NULL,
        rule_id TEXT,
        rule_revision TEXT,
        hypothesis_id TEXT,
        validation_status TEXT NOT NULL DEFAULT 'candidate',
        severity TEXT NOT NULL DEFAULT 'warning',
        title TEXT NOT NULL,
        expected TEXT NOT NULL DEFAULT '',
        actual TEXT NOT NULL DEFAULT '',
        step_id TEXT,
        evidence_refs TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS hypotheses (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        phenomenon TEXT NOT NULL,
        basis TEXT NOT NULL DEFAULT '',
        verification_plan TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        evidence_refs TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );
    `)
  })

  it('inserts and queries a run', async () => {
    const id = 'test-run-001'
    const spec = { goal: 'test', environmentId: 'e1', entryUrl: 'http://localhost', budget: { totalTimeoutMs: 30000, maxActions: 10, maxModelCalls: 5 }, viewport: { width: 1280, height: 768 } }

    await db.execute({
      sql: `INSERT INTO runs (id, spec, status, business_result, usage, created_at, updated_at)
            VALUES (?, ?, 'queued', 'unknown', '{}', datetime('now'), datetime('now'))`,
      args: [id, JSON.stringify(spec)],
    })

    const result = await db.execute({ sql: 'SELECT * FROM runs WHERE id = ?', args: [id] })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].status).toBe('queued')

    const parsedSpec = JSON.parse(String(result.rows[0].spec))
    expect(parsedSpec.goal).toBe('test')
  })

  it('inserts events with sequential ordering', async () => {
    const runId = 'test-run-002'
    await db.execute({
      sql: `INSERT INTO runs (id, spec, status, business_result, usage) VALUES (?, '{}', 'running', 'unknown', '{}')`,
      args: [runId],
    })

    for (let i = 0; i < 5; i++) {
      await db.execute({
        sql: `INSERT INTO run_events (id, run_id, seq, type, payload, evidence_refs) VALUES (?, ?, ?, ?, '{}', '[]')`,
        args: [`evt-${i}`, runId, i, `event-${i}`],
      })
    }

    const result = await db.execute({
      sql: 'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq',
      args: [runId, 2],
    })
    expect(result.rows).toHaveLength(2)
    expect(Number(result.rows[0].seq)).toBe(3)
    expect(Number(result.rows[1].seq)).toBe(4)
  })

  it('inserts and queries findings', async () => {
    const runId = 'test-run-003'
    await db.execute({
      sql: `INSERT INTO runs (id, spec, status, business_result, usage) VALUES (?, '{}', 'completed', 'unknown', '{}')`,
      args: [runId],
    })

    await db.execute({
      sql: `INSERT INTO findings (id, run_id, source, validation_status, severity, title, expected, actual, evidence_refs)
            VALUES (?, ?, 'agent', 'candidate', 'warning', 'Overlay blocks submit', 'No overlay', 'Overlay present', '["screenshot-1.png"]')`,
      args: ['finding-001', runId],
    })

    const result = await db.execute({
      sql: 'SELECT * FROM findings WHERE run_id = ?',
      args: [runId],
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].title).toBe('Overlay blocks submit')
    expect(JSON.parse(String(result.rows[0].evidence_refs))).toEqual(['screenshot-1.png'])
  })

  it('inserts and updates hypotheses', async () => {
    const runId = 'test-run-004'
    await db.execute({
      sql: `INSERT INTO runs (id, spec, status, business_result, usage) VALUES (?, '{}', 'running', 'unknown', '{}')`,
      args: [runId],
    })

    await db.execute({
      sql: `INSERT INTO hypotheses (id, run_id, phenomenon, basis, verification_plan, status, evidence_refs)
            VALUES (?, ?, 'retry button not working', 'clicked 3 times, always fails', 'wait 5s, try again', 'open', '[]')`,
      args: ['hyp-001', runId],
    })

    await db.execute({
      sql: `UPDATE hypotheses SET status = 'supported', evidence_refs = '["ss-1.png","ss-2.png"]' WHERE id = ?`,
      args: ['hyp-001'],
    })

    const result = await db.execute({ sql: 'SELECT * FROM hypotheses WHERE id = ?', args: ['hyp-001'] })
    expect(result.rows[0].status).toBe('supported')
    expect(JSON.parse(String(result.rows[0].evidence_refs))).toHaveLength(2)
  })

  it('updates run status and usage', async () => {
    const id = 'test-run-005'
    await db.execute({
      sql: `INSERT INTO runs (id, spec, status, business_result, usage) VALUES (?, '{}', 'queued', 'unknown', '{}')`,
      args: [id],
    })

    await db.execute({
      sql: `UPDATE runs SET status = 'completed', business_result = 'success', stop_reason = 'goal-reached', usage = ?, updated_at = datetime('now') WHERE id = ?`,
      args: [JSON.stringify({ actions: 5, modelCalls: 3, elapsedMs: 12000 }), id],
    })

    const result = await db.execute({ sql: 'SELECT * FROM runs WHERE id = ?', args: [id] })
    expect(result.rows[0].status).toBe('completed')
    expect(result.rows[0].business_result).toBe('success')
    expect(JSON.parse(String(result.rows[0].usage)).actions).toBe(5)
  })
})
