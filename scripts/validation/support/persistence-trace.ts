import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { threadId } from 'node:worker_threads'
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { resolve, join } from 'node:path'
import { createClient } from '@libsql/client'

// TEST-ONLY: no production import. Native SQL is unchanged; observations add synchronous overhead.
const require = createRequire(resolve('node_modules/@libsql/client/package.json'))
const Database = require('libsql')
const digest = (v: unknown) => createHash('sha256').update(String(v)).digest('hex')
type Target = { table: 'runs' | 'run_events' | 'artifacts'; id: string }
type Context = { clientId: number; callId: number; method: string }
type Connection = {
  id: number
  path: string | null
  opened: ReturnType<typeof identity>
  pending: Target[]
}
function identity(path: string | null) {
  if (!path) return null
  try {
    const s = statSync(path)
    return { dev: s.dev, ino: s.ino, size: s.size, mtimeMs: s.mtimeMs }
  } catch {
    return null
  }
}
function files(path: string | null) {
  return {
    main: identity(path),
    wal: identity(path && path + '-wal'),
    shm: identity(path && path + '-shm'),
  }
}
function changed(a: ReturnType<typeof identity>, b: ReturnType<typeof identity>) {
  return Boolean(a && (!b || a.dev !== b.dev || a.ino !== b.ino))
}
function target(sql: string, values: unknown[]): Target | undefined {
  const args: any[] = Array.isArray(values[0]) ? values[0] : values
  const table =
    /^\s*(?:INSERT(?: OR \w+)? INTO|UPDATE|SELECT .+? FROM)\s+(runs|run_events|artifacts)\b/i
      .exec(sql)?.[1]
      ?.toLowerCase() as Target['table'] | undefined
  if (!table) return
  let id: unknown
  if (/^\s*INSERT/i.test(sql)) id = args[0]
  else if (/^\s*UPDATE/i.test(sql) && /WHERE id\s*=\s*\?/i.test(sql)) id = args.at(-1)
  else if (/WHERE id\s*=\s*\?/i.test(sql)) id = args[0]
  if (typeof id !== 'string' || !/^(?:run-|evt-)?[a-zA-Z0-9_.-]{1,120}$/.test(id)) return
  return { table, id }
}
const projection: Record<Target['table'], string[]> = {
  runs: ['id', 'status', 'stop_reason', 'business_result'],
  run_events: ['id', 'run_id', 'seq', 'type', 'payload', 'evidence_refs'],
  artifacts: ['id', 'run_id', 'type', 'file_path', 'metadata'],
}
function fingerprint(row: any, table: Target['table']) {
  if (!row) return null
  const result = Object.fromEntries(
    projection[table].map((k) => [k, k === 'seq' ? Number(row[k]) : row[k]]),
  )
  return digest(JSON.stringify(result)) // No row values or payloads in the trace.
}

export function installPersistenceTrace(options: {
  directory: string
  maxRecords?: number
  readBack?: boolean
  captureOnMismatch?: boolean
  /** Self-check fault/synchronization point ONLY; the environment preload cannot set it. */
  beforeIndependentReadForTest?: () => void
}) {
  const directory = resolve(options.directory)
  const maxRecords = options.maxRecords ?? 4000
  if (!Number.isSafeInteger(maxRecords) || maxRecords < 1 || maxRecords > 10000)
    throw Error('diagnostic maxRecords must be 1..10000')
  mkdirSync(directory, { recursive: true })
  const session = randomUUID(),
    logPath = join(directory, `trace-${process.pid}-${threadId}-${session}.jsonl`)
  const context = new AsyncLocalStorage<Context>()
  const connections = new WeakMap<object, Connection>(),
    clients = new WeakMap<object, number>()
  let seq = 0,
    connId = 0,
    clientId = 0,
    callId = 0,
    internal = 0,
    stopped = false,
    captured = false
  const prepare = Database.prototype.prepare,
    exec = Database.prototype.exec,
    close = Database.prototype.close
  const probe = createClient({ url: ':memory:' }),
    prototype = Object.getPrototypeOf(probe)
  probe.close()
  const execute = prototype.execute,
    batch = prototype.batch
  const safe = (f: () => void) => {
    try {
      f()
    } catch {
      /* Diagnostics never replace SQL results/errors. */
    }
  }
  const emit = (event: string, data: Record<string, unknown>) => {
    if (stopped || seq > maxRecords) return
    const record =
      seq === maxRecords ? { event: 'trace-limit', limit: maxRecords } : { event, ...data }
    appendFileSync(
      logPath,
      JSON.stringify({
        seq: ++seq,
        pid: process.pid,
        threadId,
        session,
        monotonicNs: process.hrtime.bigint().toString(),
        at: new Date().toISOString(),
        ...context.getStore(),
        ...record,
      }) + '\n',
    )
  }
  const inside = <T>(f: () => T): T => {
    internal++
    try {
      return f()
    } finally {
      internal--
    }
  }
  const meta = (db: any): Connection => {
    let value = connections.get(db)
    if (!value) {
      const listed = inside(() => prepare.call(db, 'PRAGMA database_list').all())
      const name = listed.find((x: any) => x.name === 'main')?.file
      let path: string | null = name ? resolve(name) : null
      if (path) {
        try {
          path = realpathSync(path)
        } catch {}
      }
      value = { id: ++connId, path, opened: identity(path), pending: [] }
      connections.set(db, value)
      emit('connection-open-observed', {
        connectionId: value.id,
        normalizedPath: path,
        openedIdentity: value.opened,
        files: files(path),
        transaction: db.inTransaction,
      })
    }
    return value
  }
  const read = (db: any, t: Target) =>
    inside(() => {
      const row = prepare
        .call(db, `SELECT ${projection[t.table].join(',')} FROM ${t.table} WHERE id=?`)
        .get(t.id)
      return fingerprint(row, t.table)
    })
  const capture = (m: Connection, classification: string) => {
    if (captured || !options.captureOnMismatch || !m.path) return
    captured = true
    const dest = join(directory, `capture-${process.pid}-${seq}`)
    mkdirSync(dest)
    const before = files(m.path),
      copied: string[] = []
    if (Object.values(before).reduce((n, s) => n + (s?.size ?? 0), 0) > 32 * 1024 * 1024) {
      emit('capture-size-limit', { limitBytes: 32 * 1024 * 1024 })
      return
    }
    for (const [label, suffix] of [
      ['main', ''],
      ['wal', '-wal'],
      ['shm', '-shm'],
    ]) {
      if (!identity(m.path + suffix)) continue
      copyFileSync(m.path + suffix, join(dest, `database${suffix}`))
      copied.push(label)
    }
    const after = files(m.path)
    writeFileSync(
      join(dest, 'capture.json'),
      JSON.stringify(
        {
          classification,
          normalizedPath: m.path,
          writerOpenedIdentity: m.opened,
          before,
          after,
          copied,
          kind: 'raw-live-file-set; NOT an atomic SQLite snapshot; no checkpoint or source write',
          stableMetadataDuringCopy: JSON.stringify(before) === JSON.stringify(after),
          needOfflineCopyOrSeparateReadTransactionForConsistentInterpretation: true,
        },
        null,
        2,
      ),
    )
    emit('capture', { directory: dest, classification, copied })
  }
  const compare = (
    db: any,
    m: Connection,
    t: Target,
    point: string,
    acknowledgedChanges?: number,
  ) => {
    if (!options.readBack || !m.path || seq > maxRecords) return
    inside(() => {
      const writer = read(db, t)
      if (options.beforeIndependentReadForTest) {
        emit('test-readback-synchronization-point', { target: t })
        options.beforeIndependentReadForTest()
      }
      const observer = new Database(m.path)
      let fresh: string | null = null,
        readerError: unknown,
        readerTransaction = false
      const observerIdentity = identity(m.path)
      try {
        // Fresh connection, query-only, one autocommit read; no inherited/read transaction snapshot.
        exec.call(observer, 'PRAGMA query_only=ON')
        readerTransaction = observer.inTransaction
        fresh = read(observer, t)
      } catch (error: any) {
        readerError = { code: error?.code ?? 'unknown', name: error?.name ?? 'unknown' }
      } finally {
        close.call(observer)
      }
      const inTransaction = db.inTransaction
      const replaced = changed(m.opened, observerIdentity)
      const classification = replaced
        ? 'database-file-identity-changed'
        : readerError
          ? 'independent-read-error'
          : writer === fresh
            ? 'visible-match'
            : inTransaction && point === 'read-return' && !m.pending.length
              ? 'reader-snapshot-stale'
              : inTransaction
                ? 'writer-transaction-not-committed'
                : 'visibility-unexplained'
      emit('read-back', {
        connectionId: m.id,
        normalizedPath: m.path,
        target: t,
        point,
        writerTransaction: inTransaction,
        independentReaderTransaction: readerTransaction,
        acknowledgedChanges,
        writerFingerprint: writer,
        independentFingerprint: fresh,
        openedIdentity: m.opened,
        observerIdentity,
        files: files(m.path),
        classification,
        readerError,
      })
      if (
        [
          'database-file-identity-changed',
          'visibility-unexplained',
          'independent-read-error',
        ].includes(classification)
      )
        capture(m, classification)
    })
  }
  const afterOperation = (
    db: any,
    sql: string,
    args: unknown[],
    method: string,
    result: any,
    before: boolean,
  ) => {
    const m = meta(db),
      after = db.inTransaction,
      t = target(sql, args)
    const control = /^\s*(BEGIN|COMMIT|ROLLBACK|END|SAVEPOINT|RELEASE)\b/i
      .exec(sql)?.[1]
      ?.toUpperCase()
    const write = /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql)
    emit('sql-return', {
      connectionId: m.id,
      sqlHash: digest(sql),
      operation: control ?? (write ? 'write' : 'read'),
      method,
      target: t,
      beforeTransaction: before,
      afterTransaction: after,
      rows: Array.isArray(result) ? result.length : undefined,
      changes: result?.changes === undefined ? undefined : Number(result.changes),
      files: files(m.path),
    })
    if (write && t) {
      if (after) {
        m.pending.push(t)
        if (m.pending.length > 32) m.pending.shift()
      }
      compare(
        db,
        m,
        t,
        'write-return',
        result?.changes === undefined ? undefined : Number(result.changes),
      )
    } else if (control === 'COMMIT' || control === 'END') {
      for (const pending of m.pending.slice(-32)) compare(db, m, pending, 'commit-return')
      emit('transaction-committed', {
        connectionId: m.id,
        pendingWrites: m.pending.length,
        comparedWrites: Math.min(m.pending.length, 32),
        stillInTransaction: after,
      })
      m.pending = []
    } else if (control === 'ROLLBACK') {
      emit('transaction-rolled-back', {
        connectionId: m.id,
        discardedPendingWrites: m.pending.length,
      })
      m.pending = []
    } else if (!write && t) compare(db, m, t, 'read-return')
  }
  Database.prototype.prepare = function (sql: string, ...rest: unknown[]) {
    const statement = prepare.call(this, sql, ...rest)
    if (internal || stopped || seq > maxRecords) return statement
    safe(() => meta(this)) // Identity BEFORE the SQL runs, so replacement is not silently adopted.
    for (const method of ['run', 'all', 'get']) {
      const original = statement[method]?.bind(statement)
      if (!original) continue
      statement[method] = (...args: unknown[]) => {
        const before = this.inTransaction
        let result: any
        try {
          result = original(...args)
        } catch (error: any) {
          safe(() => {
            const m = meta(this)
            emit('sql-error', {
              connectionId: m.id,
              sqlHash: digest(sql),
              beforeTransaction: before,
              afterTransaction: this.inTransaction,
              files: files(m.path),
              fileIdentityChanged: changed(m.opened, identity(m.path)),
              code: error?.code ?? 'unknown',
            })
            if (changed(m.opened, identity(m.path))) capture(m, 'database-file-identity-changed')
          })
          throw error
        }
        if (seq <= maxRecords) safe(() => afterOperation(this, sql, args, method, result, before))
        return result
      }
    }
    return statement
  }
  Database.prototype.exec = function (sql: string, ...rest: unknown[]) {
    if (internal || stopped || seq > maxRecords) return exec.call(this, sql, ...rest)
    safe(() => meta(this))
    const before = this.inTransaction
    const result = exec.call(this, sql, ...rest)
    safe(() => afterOperation(this, sql, [], 'exec', result, before))
    return result
  }
  Database.prototype.close = function (...args: unknown[]) {
    if (!internal && !stopped)
      safe(() => {
        const m = meta(this)
        emit('connection-close', {
          connectionId: m.id,
          transaction: this.inTransaction,
          pendingWrites: m.pending.length,
          files: files(m.path),
        })
      })
    return close.apply(this, args)
  }
  for (const [method, original] of [
    ['execute', execute],
    ['batch', batch],
  ] as const) {
    prototype[method] = async function (...args: unknown[]) {
      let id = clients.get(this)
      if (!id) {
        id = ++clientId
        clients.set(this, id)
      }
      return context.run({ clientId: id, callId: ++callId, method }, async () => {
        safe(() =>
          emit('client-call', {
            mode:
              method === 'batch'
                ? ['read', 'write', 'deferred', undefined].includes(args[1] as any)
                  ? (args[1] ?? 'deferred')
                  : 'invalid'
                : undefined,
          }),
        )
        try {
          const result = await original.apply(this, args)
          safe(() =>
            emit('client-return', {
              status: 'success',
              rowsAffected: result?.rowsAffected,
              resultSets: Array.isArray(result) ? result.length : undefined,
            }),
          )
          return result
        } catch (error: any) {
          safe(() => emit('client-return', { status: 'error', code: error?.code ?? 'unknown' }))
          throw error
        }
      })
    }
  }
  emit('trace-start', {
    node: process.version,
    cwd: process.cwd(),
    maxRecords,
    readBack: options.readBack ?? false,
    captureOnMismatch: options.captureOnMismatch ?? false,
    queryBackChangesTiming: true,
    clientVersion: JSON.parse(
      readFileSync(resolve('node_modules/@libsql/client/package.json'), 'utf8'),
    ).version,
    clientSqliteJsSha256: digest(
      readFileSync(resolve('node_modules/@libsql/client/lib-esm/sqlite3.js'), 'utf8'),
    ),
    nativeWrapperSha256: digest(readFileSync(require.resolve('libsql'), 'utf8')),
    lockfileSha256: digest(readFileSync(resolve('pnpm-lock.yaml'), 'utf8')),
  })
  return {
    logPath,
    stop() {
      if (stopped) return
      safe(() => emit('trace-stop', {}))
      stopped = true
      Database.prototype.prepare = prepare
      Database.prototype.exec = exec
      Database.prototype.close = close
      prototype.execute = execute
      prototype.batch = batch
    },
  }
}
