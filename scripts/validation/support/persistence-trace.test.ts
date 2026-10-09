import { beforeEach, afterEach, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createClient } from '@libsql/client'
import { installPersistenceTrace } from './persistence-trace.ts'
const require = createRequire(resolve('node_modules/@libsql/client/package.json'))
const Database = require('libsql')
let root: string, db: any, trace: ReturnType<typeof installPersistenceTrace>
const schema =
  'CREATE TABLE runs(id TEXT PRIMARY KEY,status TEXT,stop_reason TEXT,business_result TEXT)'
const read = () =>
  readFileSync(trace.logPath, 'utf8')
    .trim()
    .split('\n')
    .map((s) => JSON.parse(s))
beforeEach((context) => {
  const evidence = process.env.R0_PERSISTENCE_SELF_CHECK_EVIDENCE
  if (evidence) mkdirSync(evidence, { recursive: true })
  root = mkdtempSync(join(evidence ?? tmpdir(), 'persistence-diagnosis-'))
  if (evidence) writeFileSync(join(root, 'case.json'), JSON.stringify({ test: context.task.name }))
  trace = installPersistenceTrace({
    directory: join(root, 'trace'),
    readBack: true,
    captureOnMismatch: true,
  })
  db = new Database(join(root, 'runs.db'))
  db.exec(schema)
})
afterEach(() => {
  db.close()
  trace.stop()
  if (!process.env.R0_PERSISTENCE_SELF_CHECK_EVIDENCE)
    rmSync(root, { recursive: true, force: true })
})
it('H1 distinguishes acknowledged uncommitted writes, commit visibility and deliberate rollback', () => {
  db.exec('BEGIN')
  db.prepare('INSERT INTO runs(id,status,stop_reason,business_result) VALUES(?,?,?,?)').run([
    'run-commit',
    'running',
    null,
    'unknown',
  ])
  expect(read().at(-1).classification).toBe('writer-transaction-not-committed')
  db.prepare('SELECT * FROM runs WHERE id=?').get('run-commit')
  expect(read().at(-1).classification).toBe('writer-transaction-not-committed')
  db.exec('COMMIT')
  expect(
    read().some((r) => r.point === 'commit-return' && r.classification === 'visible-match'),
  ).toBe(true)
  db.exec('BEGIN')
  db.prepare('INSERT INTO runs(id,status,stop_reason,business_result) VALUES(?,?,?,?)').run([
    'run-rollback',
    'running',
    null,
    'unknown',
  ])
  db.exec('ROLLBACK')
  expect(
    read().some((r) => r.event === 'transaction-rolled-back' && r.discardedPendingWrites === 1),
  ).toBe(true)
  expect(read().some((r) => r.event === 'capture')).toBe(false)
  expect(db.prepare('SELECT * FROM runs WHERE id=?').get('run-rollback')).toBeUndefined()
})
it('H2 detects a reader pinned to an old WAL snapshot while a NEW reader sees the commit', () => {
  db.exec('PRAGMA journal_mode=WAL')
  db.prepare('INSERT INTO runs(id,status,stop_reason,business_result) VALUES(?,?,?,?)').run([
    'run-stale',
    'running',
    null,
    'unknown',
  ])
  const reader = new Database(join(root, 'runs.db'))
  try {
    reader.exec('BEGIN')
    reader.prepare('SELECT * FROM runs WHERE id=?').get('run-stale')
    db.prepare('UPDATE runs SET status=? WHERE id=?').run(['completed', 'run-stale'])
    expect(reader.prepare('SELECT * FROM runs WHERE id=?').get('run-stale').status).toBe('running')
    const stale = read()
      .filter((r) => r.classification === 'reader-snapshot-stale')
      .at(-1)
    expect(stale.writerTransaction).toBe(true)
    expect(stale.independentReaderTransaction).toBe(false)
    reader.exec('ROLLBACK')
    expect(reader.prepare('SELECT * FROM runs WHERE id=?').get('run-stale').status).toBe(
      'completed',
    )
    expect(read().some((r) => r.classification === 'visibility-unexplained')).toBe(false)
  } finally {
    reader.close()
  }
})
it('H3 captures changed file identity without silently attributing new pathname bytes to the writer', () => {
  db.prepare('INSERT INTO runs(id,status,stop_reason,business_result) VALUES(?,?,?,?)').run([
    'run-replaced',
    'running',
    null,
    'unknown',
  ])
  renameSync(join(root, 'runs.db'), join(root, 'old-runs.db'))
  const replacement = new Database(join(root, 'runs.db'))
  replacement.exec(schema)
  replacement.close()
  expect(db.prepare('SELECT * FROM runs WHERE id=?').get('run-replaced').status).toBe('running')
  const evidence = read().find((r) => r.classification === 'database-file-identity-changed')
  expect(evidence.openedIdentity.ino).not.toBe(evidence.observerIdentity.ino)
  const capture = read().find((r) => r.event === 'capture')
  const info = JSON.parse(readFileSync(join(capture.directory, 'capture.json'), 'utf8'))
  expect(info.kind).toContain('NOT an atomic SQLite snapshot')
  expect(info.copied).toEqual(['main'])
})
it('H4 records zero affected rows rather than claiming the target was durably written', () => {
  db.prepare('UPDATE runs SET status=? WHERE id=?').run(['completed', 'run-missing'])
  const evidence = read().find((r) => r.point === 'write-return')
  expect(evidence.acknowledgedChanges).toBe(0)
  expect(evidence.writerFingerprint).toBeNull()
  expect(evidence.independentFingerprint).toBeNull()
})
it('self-check captures the FIRST same-file loss at a controlled point and preserves WAL/SHM without checkpointing', () => {
  trace.stop()
  let fired = false
  trace = installPersistenceTrace({
    directory: join(root, 'loss'),
    readBack: true,
    captureOnMismatch: true,
    beforeIndependentReadForTest: () => {
      if (fired) return
      fired = true
      // Explicit fixture-only deletion AFTER observing the SQL-returned row, BEFORE independent read.
      // Demonstrates the detector, not an explanation of the original failure.
      db.prepare('DELETE FROM runs WHERE id=?').run('run-injected-loss')
    },
  })
  db.exec('PRAGMA journal_mode=WAL')
  db.prepare('INSERT INTO runs(id,status,stop_reason,business_result) VALUES(?,?,?,?)').run([
    'run-injected-loss',
    'running',
    null,
    'unknown',
  ])
  const mismatch = read().find((r) => r.classification === 'visibility-unexplained')
  expect(mismatch.writerTransaction).toBe(false)
  expect(mismatch.independentReaderTransaction).toBe(false)
  expect(mismatch.writerFingerprint).not.toBeNull()
  expect(mismatch.independentFingerprint).toBeNull()
  const capture = read().find((r) => r.event === 'capture')
  const info = JSON.parse(readFileSync(join(capture.directory, 'capture.json'), 'utf8'))
  expect(info.copied.sort()).toEqual(['main', 'shm', 'wal'])
  expect(info.writerOpenedIdentity.ino).toBe(info.before.main.ino)
  expect(read().filter((r) => r.event === 'capture')).toHaveLength(1)
})
it('H5 observes the actual client batch commit and return separately with stable call/connection identity', async () => {
  const client = createClient({ url: 'file:' + join(root, 'runs.db'), concurrency: 1 })
  try {
    await client.batch(
      [
        {
          sql: 'INSERT INTO runs(id,status,stop_reason,business_result) VALUES(?,?,?,?)',
          args: ['run-client', 'completed', 'goal-reached', 'success'],
        },
      ],
      'write',
    )
    const rows = read(),
      ack = rows.find((r) => r.event === 'client-return')
    const commit = rows.find((r) => r.event === 'transaction-committed')
    expect(commit.callId).toBe(ack.callId)
    expect(commit.seq).toBeLessThan(ack.seq)
    expect(rows.find((r) => r.point === 'commit-return').classification).toBe('visible-match')
  } finally {
    client.close()
  }
})
it('logs no user values or unrelated SQL text and records original SQL failures without replacing them', () => {
  const secret = 'UNRELATED_USER_CONTENT_MUST_NOT_BE_LOGGED'
  db.prepare('INSERT INTO runs(id,status,stop_reason,business_result) VALUES(?,?,?,?)').run([
    'run-private',
    secret,
    null,
    'unknown',
  ])
  expect(() =>
    db
      .prepare('INSERT INTO runs(id,status,stop_reason,business_result) VALUES(?,?,?,?)')
      .run(['run-private', secret, null, 'unknown']),
  ).toThrow()
  const content = readFileSync(trace.logPath, 'utf8')
  expect(content).not.toContain(secret)
  expect(content).not.toContain('INSERT INTO')
  expect(read().some((r) => r.event === 'sql-error')).toBe(true)
})
it('has a bounded trace, disables further read-back after the cap and restores original methods', () => {
  trace.stop()
  trace = installPersistenceTrace({
    directory: join(root, 'limited'),
    maxRecords: 4,
    readBack: true,
  })
  for (let i = 0; i < 8; i++) db.prepare('SELECT 1').get()
  expect(read()).toHaveLength(5)
  expect(read().at(-1).event).toBe('trace-limit')
  trace.stop()
  db.prepare('SELECT 1').get()
  expect(read()).toHaveLength(5)
})
