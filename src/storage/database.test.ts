import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@libsql/client'

const SCHEMA_SQL = `
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

  CREATE TABLE IF NOT EXISTS finding_feedback (
    id TEXT PRIMARY KEY,
    finding_id TEXT NOT NULL,
    verdict TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (finding_id) REFERENCES findings(id)
  );

  CREATE TABLE IF NOT EXISTS rule_proposals (
    id TEXT PRIMARY KEY,
    finding_id TEXT NOT NULL,
    rule_config TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'draft',
    positive_results TEXT NOT NULL DEFAULT '[]',
    negative_results TEXT NOT NULL DEFAULT '[]',
    reviewed_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (finding_id) REFERENCES findings(id)
  );

  CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (run_id) REFERENCES runs(id)
  );
`

describe('database schema', () => {
  const db = createClient({ url: ':memory:' })

  beforeAll(async () => {
    await db.executeMultiple(SCHEMA_SQL)
  })

  it('creates all required tables', async () => {
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    const tables = result.rows.map((r) => r.name)
    expect(tables).toContain('runs')
    expect(tables).toContain('run_events')
    expect(tables).toContain('findings')
    expect(tables).toContain('hypotheses')
    expect(tables).toContain('finding_feedback')
    expect(tables).toContain('rule_proposals')
    expect(tables).toContain('artifacts')
  })

  it('can insert and query a run', async () => {
    const runId = 'test-run-001'
    await db.execute({
      sql: `INSERT INTO runs (id, spec, status) VALUES (?, ?, ?)`,
      args: [runId, JSON.stringify({ goal: 'test purchase' }), 'queued'],
    })

    const result = await db.execute({
      sql: `SELECT * FROM runs WHERE id = ?`,
      args: [runId],
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].status).toBe('queued')
    expect(JSON.parse(result.rows[0].spec as string).goal).toBe('test purchase')
  })

  it('enforces unique seq per run for events', async () => {
    await db.execute({
      sql: `INSERT INTO run_events (id, run_id, seq, type) VALUES (?, ?, ?, ?)`,
      args: ['evt-1', 'test-run-001', 1, 'task.started'],
    })

    await expect(
      db.execute({
        sql: `INSERT INTO run_events (id, run_id, seq, type) VALUES (?, ?, ?, ?)`,
        args: ['evt-2', 'test-run-001', 1, 'duplicate'],
      }),
    ).rejects.toThrow()
  })

  it('can store and retrieve findings with evidence refs', async () => {
    await db.execute({
      sql: `INSERT INTO findings (id, run_id, source, title, evidence_refs) VALUES (?, ?, ?, ?, ?)`,
      args: ['f-1', 'test-run-001', 'agent', 'overlay blocks submit', JSON.stringify(['snap-42'])],
    })

    const result = await db.execute({
      sql: `SELECT * FROM findings WHERE run_id = ?`,
      args: ['test-run-001'],
    })
    expect(result.rows).toHaveLength(1)
    expect(JSON.parse(result.rows[0].evidence_refs as string)).toEqual(['snap-42'])
  })

  it('can store hypotheses', async () => {
    await db.execute({
      sql: `INSERT INTO hypotheses (id, run_id, phenomenon, basis, status) VALUES (?, ?, ?, ?, ?)`,
      args: [
        'h-1',
        'test-run-001',
        'retry button missing after failure',
        'spec requires retry within 5s',
        'open',
      ],
    })

    const result = await db.execute({
      sql: `SELECT * FROM hypotheses WHERE status = ?`,
      args: ['open'],
    })
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].phenomenon).toBe('retry button missing after failure')
  })

  it('schema is idempotent', async () => {
    await db.executeMultiple(SCHEMA_SQL)
    const result = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    )
    expect(result.rows.length).toBeGreaterThanOrEqual(7)
  })
})
