import { createClient, type Client } from '@libsql/client'
import { config } from '../shared/config.ts'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let client: Client | null = null

export function getDbClient(): Client {
  if (!client) {
    if (config.databaseUrl.startsWith('file:') && !config.databaseUrl.includes(':memory:')) {
      const filename = decodeURIComponent(config.databaseUrl.slice(5).split('?')[0])
      mkdirSync(dirname(resolve(filename)), { recursive: true })
    }
    client = createClient({ url: config.databaseUrl })
  }
  return client
}

export async function initDatabase(): Promise<void> {
  const db = getDbClient()

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

    CREATE TABLE IF NOT EXISTS finding_feedback (
      id TEXT PRIMARY KEY,
      finding_id TEXT NOT NULL,
      verdict TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (finding_id) REFERENCES findings(id)
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
  `)
}

export async function checkStorageHealth(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = getDbClient()
    await db.execute('SELECT 1')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: String(e) }
  }
}
