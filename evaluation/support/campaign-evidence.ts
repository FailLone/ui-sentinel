import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { auditDurability, verifyArtifactBytes } from '../private/export/scorer.ts'

export async function downloadRunEvidence(base: string, report: any, directory: string) {
  await mkdir(directory, { recursive: true })
  const artifacts: Record<
    string,
    { type: string; exists: boolean; sha256: string; data?: unknown }
  > = {}
  const index: {
    runId: string
    artifactId: string
    type: string
    sha256: string
    bytes: number
    path: string
    exists: boolean
  }[] = []
  for (const artifact of report.artifacts) {
    const response = await fetch(
      `${base}/api/runs/${report.runId}/artifacts/${encodeURIComponent(artifact.id)}`,
      { signal: AbortSignal.timeout(15000) },
    )
    const bytes = Buffer.from(await response.arrayBuffer())
    const checked = verifyArtifactBytes(artifact.id, artifact.type, bytes, {
      available: response.ok && artifact.available,
    })
    const path = resolve(directory, encodeURIComponent(artifact.id))
    if (checked.exists) await writeFile(path, bytes)
    let data: unknown
    if (artifact.type !== 'screenshot' && checked.exists) {
      try {
        data = JSON.parse(bytes.toString('utf8'))
      } catch {
        /* Binary attachments remain hash-verifiable. */
      }
    }
    artifacts[artifact.id] = {
      type: artifact.type,
      exists: checked.exists,
      sha256: checked.sha256,
      data,
    }
    index.push({
      runId: report.runId,
      artifactId: artifact.id,
      type: artifact.type,
      ...checked,
      path,
    })
  }
  return { artifacts, index }
}

/** Must run after the owning server exits. Uses a new connection and compares independently read bytes. */
export async function auditStoppedGroup(
  databaseUrl: string,
  records: readonly any[],
  expectedApproval: { id: string; ruleConfig: unknown } | undefined,
) {
  const db = createClient({ url: databaseUrl })
  try {
    await db.execute('PRAGMA wal_checkpoint(TRUNCATE)')
    await db.execute('PRAGMA query_only=ON')
    const rules = (
      await db.execute(
        "SELECT id,rule_config,reviewed_by FROM rule_proposals WHERE status='enabled'",
      )
    ).rows
    const approvalIntact = expectedApproval
      ? rules.length === 1 &&
        rules[0]!.id === expectedApproval.id &&
        !!rules[0]!.reviewed_by &&
        JSON.stringify(JSON.parse(String(rules[0]!.rule_config))) ===
          JSON.stringify(expectedApproval.ruleConfig)
      : rules.length === 0
    const audits = []
    for (const record of records) {
      const report = record.report
      if (!report) continue
      const row = (await db.execute({ sql: 'SELECT * FROM runs WHERE id=?', args: [report.runId] }))
        .rows[0]
      const events = (
        await db.execute({
          sql: 'SELECT id,seq,type,payload,evidence_refs FROM run_events WHERE run_id=? ORDER BY seq',
          args: [report.runId],
        })
      ).rows
      const findings = (
        await db.execute({
          sql: 'SELECT id,evidence_refs,validation_status FROM findings WHERE run_id=?',
          args: [report.runId],
        })
      ).rows
      const artifacts = (
        await db.execute({
          sql: 'SELECT id,file_path FROM artifacts WHERE run_id=?',
          args: [report.runId],
        })
      ).rows
      const hashes = await Promise.all(
        artifacts.map(async (a) => {
          const downloaded = record.artifactIndex.find((entry: any) => entry.artifactId === a.id)
          try {
            const original = createHash('sha256')
              .update(await readFile(String(a.file_path)))
              .digest('hex')
            const saved = createHash('sha256')
              .update(await readFile(downloaded.path))
              .digest('hex')
            return downloaded.exists && original === downloaded.sha256 && saved === original
          } catch {
            return false
          }
        }),
      )
      const audit = auditDurability({
        apiReport: report,
        dbRun: {
          status: String(row?.status),
          businessResult: String(row?.business_result),
          stopReason: row?.stop_reason as string | null,
        },
        apiTailSeq: report.events.at(-1)?.seq ?? 0,
        dbTailSeq: Number(events.at(-1)?.seq ?? 0),
        apiArtifactIds: report.artifacts.map((a: any) => a.id),
        dbArtifactIds: artifacts.map((a) => String(a.id)),
        apiReviewedRules: expectedApproval ? [expectedApproval.id] : [],
        dbReviewedRules: rules.map((r) => String(r.id)),
      })
      const eventsMatch =
        events.length === report.events.length &&
        events.every(
          (e, i) =>
            e.id === report.events[i].id &&
            e.type === report.events[i].type &&
            JSON.stringify(JSON.parse(String(e.payload))) ===
              JSON.stringify(report.events[i].payload),
        )
      const findingsMatch =
        findings.length === report.findings.length &&
        findings.every((f) =>
          report.findings.some(
            (a: any) =>
              a.id === f.id &&
              a.validationStatus === f.validation_status &&
              JSON.stringify(a.evidenceRefs) ===
                JSON.stringify(JSON.parse(String(f.evidence_refs))),
          ),
        )
      audits.push({
        runId: report.runId,
        ...audit,
        eventsMatch,
        findingsMatch,
        hashesMatch: hashes.every(Boolean),
        approvalIntact,
        passed:
          audit.passed && eventsMatch && findingsMatch && hashes.every(Boolean) && approvalIntact,
      })
    }
    return {
      passed:
        audits.length === records.filter((r) => r.report).length &&
        audits.every((a) => a.passed) &&
        approvalIntact,
      approvalIntact,
      runs: audits,
    }
  } finally {
    db.close()
  }
}
