import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createClient, type Client } from '@libsql/client'
import { RETRY_DECLARATION_SHAPE, type DeclaredRule } from './expectations.ts'

/**
 * Read-only import of a previously approved rule.
 *
 * The acceptance plan is explicit that a preparation record cannot prove approval on its own: the
 * findings it was drafted from may still be `validating`, and the record is written by the same
 * process that created the candidate. What proves approval is the *closed* learning database's own
 * final state - `enabled`, with a named reviewer - together with the declaration the run actually
 * executed.
 *
 * This module never writes to the source. It opens it read-only, reads what it needs, and copies
 * nothing back; the caller is given a value it can put in its own isolated database.
 */
export interface ImportedApproval {
  /** Absolute path of the source database this was read from, for the handoff record. */
  readonly sourceDirectory: string
  /** SHA-256 of the source database as read, so a later check can prove it was not edited. */
  readonly databaseHash: string
  readonly proposalId: string
  readonly ruleRevision: string
  readonly reviewedBy: string
  readonly ruleConfig: Record<string, unknown>
  /** Canonical hash of the declaration, so "unchanged" is checkable rather than remembered. */
  readonly declarationHash: string
  /** The declaration in the shape a batch scorer compares against. */
  readonly declared: DeclaredRule
}

/** Canonical JSON: keys sorted at every depth, so the hash cannot depend on key order. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
}

export function declarationHash(ruleConfig: Record<string, unknown>): string {
  return createHash('sha256').update(canonical(ruleConfig)).digest('hex')
}

/**
 * A closed database is a precondition, not a nicety.
 *
 * A `-wal` or `-journal` beside it means the store is not checkpointed, so reading it would give
 * the state of some earlier moment rather than the final one - and the whole point is to read the
 * *final* approval. The caller must stop the writer and checkpoint first. This mirrors the existing
 * `learning --recheck` precondition rather than inventing a second standard.
 */
export async function assertClosed(directory: string): Promise<void> {
  for (const suffix of ['-wal', '-journal', '-shm']) {
    const present = await readFile(resolve(directory, `runs.db${suffix}`)).then(
      () => true,
      () => false,
    )
    if (present)
      throw new Error(
        `approval-source-not-closed: runs.db${suffix} present; stop the writer and checkpoint before importing`,
      )
  }
}

/**
 * Open the source for reading without any possibility of writing to it.
 *
 * `?mode=ro` and `?immutable=1` are not available here: this libSQL client answers
 * `URL_PARAM_NOT_SUPPORTED` for both (measured, not assumed). `PRAGMA query_only = ON` is the
 * mechanism that does work, and it is a real refusal - a write through this handle fails with
 * `SQLITE_READONLY`. The pragma is a guard against this code being wrong, not a replacement for the
 * closed-source precondition above. Exported so the refusal can be tested rather than asserted in a
 * comment.
 */
export async function openSourceReadOnly(databasePath: string) {
  const client = createClient({ url: `file:${databasePath}` })
  await client.execute('PRAGMA query_only = ON')
  return client
}

/**
 * Read the enabled declaration out of a closed learning directory.
 *
 * Approval is taken from the database's final row, never from `prepared.json`: that file describes
 * the candidate *as drafted* and may still say `validating`, so treating it as proof would let an
 * unreviewed candidate be loaded as though a human had approved it.
 */
export async function importApprovedRule(options: {
  readonly directory: string
  /** When given, the row must be exactly this proposal; a mismatch stops rather than adapts. */
  readonly expectedProposalId?: string
}): Promise<ImportedApproval> {
  const sourceDirectory = resolve(options.directory)
  await assertClosed(sourceDirectory)
  const databasePath = resolve(sourceDirectory, 'runs.db')
  const bytes = await readFile(databasePath).catch(() => {
    throw new Error(`approval-source-missing: ${databasePath}`)
  })
  const databaseHash = createHash('sha256').update(bytes).digest('hex')

  const client = await openSourceReadOnly(databasePath)
  try {
    const rows = await client.execute(
      "SELECT id, rule_config, status, reviewed_by FROM rule_proposals WHERE status = 'enabled' ORDER BY rowid",
    )
    if (rows.rows.length !== 1)
      throw new Error(
        `approval-source-invalid: expected exactly one enabled rule, found ${rows.rows.length}`,
      )
    const row = rows.rows[0]!
    const proposalId = String(row.id)
    if (options.expectedProposalId && proposalId !== options.expectedProposalId)
      throw new Error(
        `approval-source-mismatch: expected ${options.expectedProposalId}, found ${proposalId}`,
      )
    const reviewedBy = row.reviewed_by == null ? '' : String(row.reviewed_by)
    // `enabled` without a named reviewer is not approval. The row alone is not enough, because a
    // status can be set by a script that never had a human look at it.
    if (!reviewedBy.trim())
      throw new Error('approval-source-unapproved: the enabled rule names no reviewer')
    const ruleConfig = JSON.parse(String(row.rule_config)) as Record<string, unknown>
    const expectation = ruleConfig.expectation as
      | { condition?: string; target?: string; timeoutMs?: number }
      | undefined
    return {
      sourceDirectory,
      databaseHash,
      proposalId,
      // Transition declarations compile at revision '1'; recorded so a batch can compare revisions
      // rather than assuming them.
      ruleRevision: '1',
      reviewedBy,
      ruleConfig,
      declarationHash: declarationHash(ruleConfig),
      declared: {
        id: proposalId,
        revision: '1',
        enabled: true,
        trigger: ruleConfig.trigger as { eventType?: string } | undefined,
        expectation,
      },
    }
  } finally {
    client.close()
  }
}

/**
 * The enabled declarations a batch database actually holds, in the scorer's shape.
 *
 * A batch scorer is passed the rule set rather than reading it, so that the thing deciding what was
 * enabled is not the thing being judged. This is the reader that produces that argument: it reports
 * every enabled row - the imported one and any other - so "no equivalent retry rule" is answered
 * from the database's whole state instead of only from the rule the batch meant to import.
 */
export async function loadBatchDeclarations(client: Client): Promise<DeclaredRule[]> {
  const rows = await client.execute(
    "SELECT id, rule_config, status, reviewed_by FROM rule_proposals WHERE status = 'enabled'",
  )
  return rows.rows.map((raw) => {
    const row = raw as unknown as { id: unknown; rule_config: unknown }
    const config = JSON.parse(String(row.rule_config)) as {
      trigger?: { eventType?: string }
      expectation?: { condition?: string; target?: string; timeoutMs?: number }
    }
    // Transition proposals compile at revision '1' (`compileTransitionRule`); stated here rather
    // than assumed, so a batch comparing revisions is comparing a recorded value.
    return {
      id: String(row.id),
      revision: '1',
      enabled: true,
      trigger: config.trigger,
      expectation: config.expectation,
    }
  })
}

/**
 * Isolation recheck: the imported declaration must be indistinguishable from the approved one.
 *
 * The acceptance plan requires this to be a *check*, not a claim. It compares the declaration
 * against the source database a second time, so a run whose rule was quietly edited between import
 * and execution is caught rather than assumed consistent. The semantic target, the timeout and the
 * applicability are all compared; none of them may be relaxed to fit a page.
 */
export function recheckIsolation(options: {
  readonly imported: ImportedApproval
  readonly liveRuleConfig: Record<string, unknown>
  readonly expectedShape?: {
    readonly eventType: string
    readonly condition: string
    readonly target: string
  }
}) {
  const shape = options.expectedShape ?? RETRY_DECLARATION_SHAPE
  const live = options.liveRuleConfig as {
    trigger?: { eventType?: string }
    expectation?: { condition?: string; target?: string; timeoutMs?: number }
  }
  const imported = options.imported.ruleConfig as {
    trigger?: { eventType?: string }
    expectation?: { condition?: string; target?: string; timeoutMs?: number }
  }
  const assertions = {
    // Byte-identical declaration: nothing was retargeted, retimed or widened in transit.
    declarationUnchanged:
      declarationHash(options.liveRuleConfig) === options.imported.declarationHash,
    // The declaration still encodes the retry question, rather than one that happens to be easier
    // to satisfy on the new page.
    semanticTargetIntact: imported.expectation?.target === shape.target,
    conditionIntact: imported.expectation?.condition === shape.condition,
    triggerIntact: imported.trigger?.eventType === shape.eventType,
    // The timeout is part of the declaration, and it is what the run's evidence is measured
    // against: shortening it would let a window that fails the approved requirement pass here. The
    // comparison is between the two copies of the declaration, not against the live one - the live
    // rule is only ever the thing being checked, so it cannot supply the standard it is checked by.
    timeoutIntact:
      imported.expectation?.timeoutMs !== undefined &&
      imported.expectation.timeoutMs === live.expectation?.timeoutMs,
    // Provenance travels with the import, so a batch can name who approved what it executed.
    approvalProvenancePresent: options.imported.reviewedBy.length > 0,
  }
  return {
    assertions,
    failedAssertions: Object.entries(assertions)
      .filter(([, ok]) => !ok)
      .map(([name]) => name),
    passed: Object.values(assertions).every(Boolean),
  }
}

/**
 * Copy the approved declaration into an isolated batch database.
 *
 * The learning directory holds the run that produced the finding, not the runs a batch is about to
 * make; the batch gets its own store with only the declaration carried across. The provenance is
 * rewritten to name the import, so the new row can never be mistaken for one a human approved
 * directly in this database.
 */
export async function installApprovalIntoBatch(options: {
  readonly client: Client
  readonly imported: ImportedApproval
  readonly batchEnvironmentId: string
  readonly batchEntryUrl: string
}): Promise<void> {
  const { imported } = options
  const note = `${imported.reviewedBy} (imported unchanged from ${imported.proposalId}@${imported.declarationHash.slice(0, 12)})`
  const now = new Date().toISOString()
  // `findings.run_id` is a real foreign key and this client enforces it (measured: an insert
  // naming an absent run fails with SQLITE_CONSTRAINT), so the declaration's origin is recorded as
  // an actual run row rather than by dropping the constraint. The row is written `interrupted` with
  // no business result, so it is not addressable as a batch result: every batch and health query
  // this codebase has selects on `status IN ('running','queued')`, `status IN ('completed','blocked')`
  // or `stop_reason='reconciliation-required'`, and an interrupted provenance row is in none of
  // them. The provenance stays a fact the database can answer, and cannot be counted as a run.
  await options.client.execute({
    sql: `INSERT OR REPLACE INTO runs (id, spec, status, business_result, stop_reason, usage, created_at, updated_at)
          VALUES (?, ?, 'interrupted', 'unknown', 'cancelled', ?, ?, ?)`,
    args: [
      `import-${imported.proposalId}-origin`,
      JSON.stringify({
        goal: 'Provenance only: the source of the approved rule imported into this batch.',
        environmentId: options.batchEnvironmentId,
        entryUrl: options.batchEntryUrl,
        importedFrom: imported.sourceDirectory,
        sourceDatabaseHash: imported.databaseHash,
        declarationHash: imported.declarationHash,
      }),
      JSON.stringify({
        actions: 0,
        modelCalls: 0,
        elapsedMs: 0,
        modelInputTokens: 0,
        modelOutputTokens: 0,
      }),
      now,
      now,
    ],
  })
  await options.client.execute({
    sql: `INSERT OR REPLACE INTO findings (id, run_id, source, rule_id, rule_revision, hypothesis_id, validation_status, severity, title, expected, actual, step_id, evidence_refs, created_at)
          VALUES (?, ?, 'rule', ?, ?, NULL, 'supported', 'error', ?, ?, ?, NULL, '[]', ?)`,
    args: [
      `import-${imported.proposalId}`,
      `import-${imported.proposalId}-origin`,
      imported.proposalId,
      imported.ruleRevision,
      'Approved retry declaration imported read-only',
      'The declaration as approved',
      `Imported from ${imported.sourceDirectory}`,
      now,
    ],
  })
  // The row the batch's rule loader reads. `reviewed_by` names the *source* of the approval and the
  // import that carried it, so it can never be read as a human approving directly in this database.
  await options.client.execute({
    sql: `INSERT OR REPLACE INTO rule_proposals (id, finding_id, rule_config, status, positive_results, negative_results, reviewed_by, created_at, updated_at)
          VALUES (?, ?, ?, 'enabled', '[]', '[]', ?, ?, ?)`,
    args: [
      imported.proposalId,
      `import-${imported.proposalId}`,
      JSON.stringify(imported.ruleConfig),
      note,
      now,
      now,
    ],
  })
}
