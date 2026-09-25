import { it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createClient } from '@libsql/client'
import { initializeDatabase } from '../../src/storage/database.ts'
import { auditStoppedGroup } from './campaign-evidence.ts'

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
