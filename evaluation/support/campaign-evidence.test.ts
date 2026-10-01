import { it, expect, afterEach } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { createClient } from '@libsql/client'
import { initializeDatabase } from '../../src/storage/database.ts'
import { auditStoppedGroup, collectFullEventHistory } from './campaign-evidence.ts'

it('audits a stopped database and rejects changed artifact bytes or a changed terminal event', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-audit-'))
  const url = `file:${dir}/runs.db`
  const path = join(dir, 'evidence.json')
  const saved = join(dir, 'download.json')
  const body = '{"proof":true}'
  const hash = createHash('sha256').update(body).digest('hex')
  const client = createClient({ url })
  try {
    await initializeDatabase(client)
    await writeFile(path, body)
    await writeFile(saved, body)
    await client.execute(
      "INSERT INTO runs(id,spec,status,business_result,stop_reason) VALUES('r','{}','completed','success','goal-reached')",
    )
    await client.execute(
      "INSERT INTO run_events(id,run_id,seq,type,payload) VALUES('event','r',1,'run:completed','{}')",
    )
    await client.execute({
      sql: "INSERT INTO artifacts(id,run_id,type,file_path) VALUES('artifact','r','snapshot',?)",
      args: [path],
    })
    client.close()
    const record = {
      report: {
        runId: 'r',
        status: 'completed',
        businessResult: 'success',
        stopReason: 'goal-reached',
        events: [{ id: 'event', seq: 1, type: 'run:completed', payload: {} }],
        findings: [],
        artifacts: [{ id: 'artifact' }],
      },
      artifactIndex: [{ artifactId: 'artifact', exists: true, sha256: hash, path: saved }],
    }
    expect((await auditStoppedGroup(url, [record], undefined)).passed).toBe(true)
    await writeFile(saved, 'changed')
    expect((await auditStoppedGroup(url, [record], undefined)).passed).toBe(false)
    await writeFile(saved, body)
    const other = createClient({ url })
    await other.execute("UPDATE run_events SET payload='{}',type='run:error' WHERE id='event'")
    other.close()
    expect((await auditStoppedGroup(url, [record], undefined)).passed).toBe(false)
  } finally {
    client.close()
    await rm(dir, { recursive: true, force: true })
  }
})

/**
 * E01: the audit must read the *whole* history from the API, not a default tail. A server that pages
 * its response is the realistic case - a reader that stops after the first page would compare a
 * prefix against a full store and call a lost tail "matching".
 */
let server: Server | null = null
afterEach(async () => {
  if (server) await new Promise<void>((done) => server!.close(() => done()))
  server = null
})

async function paged(
  events: readonly { seq: number }[],
  pageSize: number,
  mode: 'normal' | 'cursor-stuck' = 'normal',
) {
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1')
    const after = Number(url.searchParams.get('after') ?? '-1')
    const limit = Number(url.searchParams.get('limit') ?? String(pageSize))
    const batch =
      mode === 'cursor-stuck'
        ? events.slice(0, limit)
        : events.filter((e) => e.seq > after).slice(0, limit)
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(batch))
  })
  await new Promise<void>((ready) => server!.listen(0, '127.0.0.1', ready))
  const { port } = server!.address() as { port: number }
  return `http://127.0.0.1:${port}`
}

it('reads the full event history across pages rather than a default tail (E01)', async () => {
  const events = Array.from({ length: 12 }, (_, seq) => ({ seq }))
  const base = await paged(events, 5)
  const history = await collectFullEventHistory(base, 'r', 5)
  expect(history.map((e) => e.seq)).toEqual(events.map((e) => e.seq))
})

it('refuses a history whose cursor does not advance instead of looping forever (E01)', async () => {
  const base = await paged([{ seq: 0 }], 5, 'cursor-stuck')
  await expect(collectFullEventHistory(base, 'r', 5)).rejects.toThrow('history-cursor-stuck')
})

it('fails the audit when the API history is truncated but the tail matches (E01)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-audit-'))
  const url = `file:${dir}/runs.db`
  const client = createClient({ url })
  try {
    await initializeDatabase(client)
    await client.execute(
      "INSERT INTO runs(id,spec,status,business_result,stop_reason) VALUES('r','{}','completed','success','goal-reached')",
    )
    for (const seq of [0, 1, 2])
      await client.execute({
        sql: "INSERT INTO run_events(id,run_id,seq,type,payload) VALUES(?,?,?,'step:completed','{}')",
        args: [`e${seq}`, 'r', seq],
      })
    client.close()
    // The API side lost the middle event: same count would hide it, a tail-only check would too.
    const record = {
      report: {
        runId: 'r',
        status: 'completed',
        businessResult: 'success',
        stopReason: 'goal-reached',
        events: [
          { id: 'e0', seq: 0, type: 'step:completed', payload: {}, evidenceRefs: [] },
          { id: 'e2', seq: 2, type: 'step:completed', payload: {}, evidenceRefs: [] },
        ],
        findings: [],
        hypotheses: [],
        artifacts: [],
      },
      artifactIndex: [],
    }
    const audit = await auditStoppedGroup(url, [record], undefined)
    expect(audit.passed).toBe(false)
    // Direction matters: the store holds e1 but the report never showed it, so the recorded history
    // was incomplete - and the API's own seqs skip a number.
    expect(audit.runs[0]!.failureCodes).toContain('events-missing-from-api')
    expect(audit.runs[0]!.failureCodes).toContain('events-api-incomplete')
  } finally {
    client.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('fails the audit when a hypothesis was rewritten (E02)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sentinel-audit-'))
  const url = `file:${dir}/runs.db`
  const client = createClient({ url })
  try {
    await initializeDatabase(client)
    await client.execute(
      "INSERT INTO runs(id,spec,status,business_result,stop_reason) VALUES('r','{}','completed','success','goal-reached')",
    )
    await client.execute(
      "INSERT INTO run_events(id,run_id,seq,type,payload) VALUES('e0','r',0,'step:completed','{}')",
    )
    await client.execute(
      "INSERT INTO hypotheses(id,run_id,phenomenon,status,evidence_refs) VALUES('h1','r','p','open','[\"a\"]')",
    )
    client.close()
    const record = {
      report: {
        runId: 'r',
        status: 'completed',
        businessResult: 'success',
        stopReason: 'goal-reached',
        events: [{ id: 'e0', seq: 0, type: 'step:completed', payload: {}, evidenceRefs: [] }],
        findings: [],
        hypotheses: [{ id: 'h1', status: 'open', evidenceRefs: ['a'] }],
        artifacts: [],
      },
      artifactIndex: [],
    }
    expect((await auditStoppedGroup(url, [record], undefined)).passed).toBe(true)
    const other = createClient({ url })
    await other.execute("UPDATE hypotheses SET evidence_refs='[\"b\"]' WHERE id='h1'")
    other.close()
    const audit = await auditStoppedGroup(url, [record], undefined)
    expect(audit.passed).toBe(false)
    expect(audit.runs[0]!.failureCodes).toContain('hypotheses-changed')
  } finally {
    client.close()
    await rm(dir, { recursive: true, force: true })
  }
})
