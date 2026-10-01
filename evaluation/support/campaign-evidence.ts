import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import { auditDurability, verifyArtifactBytes } from '../private/export/scorer.ts'
import {
  compareEventHistory,
  compareFindings,
  compareHypotheses,
  evaluateHashes,
} from './audit-compare.ts'

/**
 * Read a run's whole event history from the public API by paging forward (plan P3.4, acceptance E01).
 *
 * The report endpoint already returns the full history, but a paged reader must not assume that: a
 * bound on the page size is exactly how a "default tail of N" would creep in. So this walks the
 * cursor until a page comes back empty and reports the count it read, which the audit then compares
 * against a fresh database read.
 */
export async function collectFullEventHistory(
  base: string,
  runId: string,
  page = 200,
): Promise<readonly any[]> {
  const all: any[] = []
  let after = -1
  for (;;) {
    const response = await fetch(
      `${base}/api/runs/${encodeURIComponent(runId)}/events?after=${after}&limit=${page}`,
      { signal: AbortSignal.timeout(15000) },
    )
    if (!response.ok) throw Error(`history-unavailable: HTTP ${response.status}`)
    const batch = (await response.json()) as any[]
    if (!Array.isArray(batch)) throw Error('history-unavailable: not an array')
    if (batch.length === 0) return all
    // A page that does not advance the cursor would loop forever; a repeated seq is a hard failure.
    const next = Number(batch.at(-1)?.seq)
    if (!Number.isSafeInteger(next) || next <= after) throw Error('history-cursor-stuck')
    all.push(...batch)
    after = next
  }
}

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
      // The index must cover every artifact the run recorded, so an artifact with no index entry is
      // graded as a failure rather than skipped - a hash over a missing entry is not a pass.
      const hashes = await Promise.all(
        artifacts.map(async (a) => {
          const downloaded = record.artifactIndex.find((entry: any) => entry.artifactId === a.id)
          if (!downloaded)
            return { artifactId: String(a.id), hashesMatch: false, indexed: false, exists: false }
          try {
            const original = createHash('sha256')
              .update(await readFile(String(a.file_path)))
              .digest('hex')
            const saved = createHash('sha256')
              .update(await readFile(downloaded.path))
              .digest('hex')
            return {
              artifactId: String(a.id),
              hashesMatch:
                downloaded.exists && original === downloaded.sha256 && saved === original,
              indexed: true,
              exists: downloaded.exists,
            }
          } catch {
            return {
              artifactId: String(a.id),
              hashesMatch: false,
              indexed: true,
              exists: downloaded.exists,
            }
          }
        }),
      )
      const hashResult = evaluateHashes(hashes, { expectedCount: artifacts.length })
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
      const eventHistory = compareEventHistory(
        report.events.map((e: any) => ({
          id: e.id,
          seq: e.seq,
          type: e.type,
          payload: e.payload,
          evidenceRefs: e.evidenceRefs ?? [],
        })),
        events.map((e) => ({
          id: String(e.id),
          seq: Number(e.seq),
          type: String(e.type),
          payload: JSON.parse(String(e.payload)),
          evidenceRefs: JSON.parse(String(e.evidence_refs ?? '[]')),
        })),
      )
      const findingRows = compareFindings(
        report.findings.map((f: any) => ({
          id: f.id,
          validationStatus: f.validationStatus,
          evidenceRefs: f.evidenceRefs ?? [],
        })),
        findings.map((f) => ({
          id: String(f.id),
          validationStatus: String(f.validation_status),
          evidenceRefs: JSON.parse(String(f.evidence_refs)),
        })),
      )
      // Hypotheses were never compared before; a rewritten hypothesis is part of E02.
      const hypotheses = (
        await db.execute({
          sql: 'SELECT id,status,evidence_refs FROM hypotheses WHERE run_id=?',
          args: [report.runId],
        })
      ).rows
      const hypothesisRows = compareHypotheses(
        (report.hypotheses ?? []).map((h: any) => ({
          id: h.id,
          status: h.status,
          evidenceRefs: h.evidenceRefs ?? [],
        })),
        hypotheses.map((h) => ({
          id: String(h.id),
          status: String(h.status),
          evidenceRefs: JSON.parse(String(h.evidence_refs)),
        })),
      )
      const failureCodes = [
        ...eventHistory.failedAssertions,
        ...findingRows.failedAssertions,
        ...hypothesisRows.failedAssertions,
        ...hashResult.failedAssertions,
      ]
      audits.push({
        runId: report.runId,
        ...audit,
        eventsMatch: eventHistory.passed,
        findingsMatch: findingRows.passed,
        hypothesesMatch: hypothesisRows.passed,
        hashesMatch: hashResult.passed,
        approvalIntact,
        failureCodes,
        passed:
          audit.passed &&
          eventHistory.passed &&
          findingRows.passed &&
          hypothesisRows.passed &&
          hashResult.passed &&
          approvalIntact,
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
