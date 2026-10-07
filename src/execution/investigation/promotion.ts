import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { Client } from '@libsql/client'
import { evaluateProgram, programInput } from './program.ts'

/** Replay the comparison from the server-sealed measurement, never accept an agent's verdict. */
export async function assertProgramReceipt(
  db: Client,
  runId: string,
  hypothesisId: string,
  status: 'supported' | 'refuted',
  refs: readonly string[],
) {
  const events = await db.execute({
    sql: "SELECT payload FROM run_events WHERE run_id=? AND type='program:measured'",
    args: [runId],
  })
  const seal = events.rows
    .map((r) => JSON.parse(String(r.payload)))
    .find((r) => r.hypothesisId === hypothesisId)
  if (!seal || !refs.includes(seal.receiptRef) || !refs.includes(seal.programRef))
    throw Error('program-receipt-required')
  const rows = await db.execute({
    sql: 'SELECT id,type,file_path FROM artifacts WHERE run_id=?',
    args: [runId],
  })
  const row = rows.rows.find((r) => r.id === seal.receiptRef && r.type === 'measurement')
  const source = rows.rows.find(
    (r) => r.id === seal.programRef && r.type === 'investigation-program',
  )
  if (!row || !source) throw Error('program-evidence-missing')
  const body = await readFile(String(row.file_path), 'utf8')
  if (createHash('sha256').update(body).digest('hex') !== seal.sha256)
    throw Error('program-receipt-modified')
  const receipt = JSON.parse(body)
  const program = programInput.parse(JSON.parse(await readFile(String(source.file_path), 'utf8')))
  const verdict = evaluateProgram(program, receipt.samples).verdict
  if (
    receipt.runId !== runId ||
    receipt.hypothesisId !== hypothesisId ||
    receipt.programRef !== seal.programRef ||
    JSON.stringify(program) !== JSON.stringify(receipt.program) ||
    receipt.error ||
    receipt.verdict !== verdict ||
    verdict !== (status === 'supported' ? 'fail' : 'pass')
  )
    throw Error('program-receipt-verdict-mismatch')
  if (
    !receipt.screenshotRefs?.length ||
    receipt.screenshotRefs.some(
      (id: string) =>
        !refs.includes(id) || !rows.rows.some((r) => r.id === id && r.type === 'screenshot'),
    )
  )
    throw Error('program-screenshots-required')
}
