import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { z } from 'zod'
import { initializeDatabase } from '../../src/storage/database.ts'
import { evaluateTransition, transitionRuleSchema } from '../../src/rules/transition.ts'

export const approvedRetryDirectory = fileURLToPath(
  new URL('../fixtures/approved-retry/', import.meta.url),
)
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (key) =>
            JSON.stringify(key) + ':' + canonicalJson((value as Record<string, unknown>)[key]),
        )
        .join(',') +
      '}'
    )
  return JSON.stringify(value)
}
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const text = z.string()
const nullable = text.nullable()
const row = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict()
const manifestSchema = row({
  schemaVersion: z.literal(1),
  id: z.literal('approved-retry-v1'),
  proposalId: text,
  ruleConfigSha256: hash,
  source: row({
    batch: text,
    databaseSha256: hash,
    historyCommit: text,
    approvalAt: text,
    exportKind: z.literal('selected-records'),
    eventTypes: z.array(text),
    note: text,
  }),
  files: z
    .array(row({ path: text, bytes: z.number().int().positive().max(2_000_000), sha256: hash }))
    .max(30),
})
const recordsSchema = row({
  runs: z
    .array(
      row({
        id: text,
        spec: text,
        status: z.enum(['completed', 'blocked']),
        business_result: text,
        stop_reason: nullable,
        usage: text,
        created_at: text,
        updated_at: text,
      }),
    )
    .length(1),
  run_events: z
    .array(
      row({
        id: text,
        run_id: text,
        seq: z.number().int().positive(),
        type: z.enum(['business:response', 'transition:observed']),
        timestamp: text,
        step_id: nullable,
        action_id: nullable,
        payload: text,
        evidence_refs: text,
      }),
    )
    .length(2),
  findings: z
    .array(
      row({
        id: text,
        run_id: text,
        source: z.literal('agent'),
        rule_id: nullable,
        rule_revision: nullable,
        hypothesis_id: text,
        validation_status: z.literal('supported'),
        severity: text,
        title: text,
        expected: text,
        actual: text,
        step_id: nullable,
        evidence_refs: text,
        created_at: text,
      }),
    )
    .length(1),
  finding_feedback: z
    .array(
      row({
        id: text,
        finding_id: text,
        verdict: z.literal('confirmed'),
        reason: text,
        created_at: text,
      }),
    )
    .length(1),
  hypotheses: z
    .array(
      row({
        id: text,
        run_id: text,
        phenomenon: text,
        basis: text,
        verification_plan: text,
        status: z.literal('supported'),
        evidence_refs: text,
        created_at: text,
      }),
    )
    .length(1),
  rule_proposals: z
    .array(
      row({
        id: text,
        finding_id: text,
        rule_config: text,
        status: z.literal('enabled'),
        positive_results: text,
        negative_results: text,
        reviewed_by: text.min(1),
        created_at: text,
        updated_at: text,
      }),
    )
    .length(1),
  artifacts: z
    .array(
      row({
        id: text,
        run_id: text,
        type: z.enum(['screenshot', 'snapshot', 'measurement']),
        file_path: text,
        metadata: text,
        created_at: text,
      }),
    )
    .min(1),
})
const approvalSchema = row({ proposalId: text, reviewedBy: text.min(1), at: text })
const resultSchema = row({
  input: text,
  expected: z.enum(['pass', 'fail', 'unknown']),
  actual: z.enum(['pass', 'fail', 'unknown', 'error']),
  passed: z.boolean(),
})
function requireFact(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error('approved-retry: ' + message)
}
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b)
const json = (bytes: Buffer) => JSON.parse(bytes.toString('utf8'))
const safePath = (name: string) =>
  /^(?:[a-z0-9-]+\.json|healthy-counterexample\.png|artifacts\/[a-z0-9-]+\.(?:json|png))$/.test(
    name,
  )

/** Git-reviewed historical data, not a mechanism for approving a new declaration. */
export async function verifyApprovedRetry(directory = approvedRetryDirectory) {
  const root = await realpath(directory)
  const manifest = manifestSchema.parse(json(await readFile(resolve(root, 'manifest.json'))))
  const files = new Map<string, Buffer>()
  for (const entry of manifest.files) {
    requireFact(
      safePath(entry.path) && !files.has(entry.path),
      'invalid or duplicate manifest path',
    )
    const actual = await realpath(resolve(root, entry.path))
    const rel = relative(root, actual)
    requireFact(
      !isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep),
      'artifact escapes fixture directory',
    )
    const bytes = await readFile(actual)
    requireFact(
      bytes.length === entry.bytes && digest(bytes) === entry.sha256,
      'file hash mismatch: ' + entry.path,
    )
    if (entry.path.endsWith('.json')) {
      json(bytes)
      requireFact(
        !/\/Users\/|\/home\/|sk-or-v1-|Bearer\s+[A-Za-z0-9]{12}/.test(bytes.toString('utf8')),
        'nonportable path or credential in fixture',
      )
    } else
      requireFact(
        bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
        'invalid PNG',
      )
    files.set(entry.path, bytes)
  }
  const readJson = (name: string) => {
    requireFact(files.has(name), 'missing required file: ' + name)
    return json(files.get(name)!)
  }
  const records = recordsSchema.parse(readJson('records.json'))
  const rule = transitionRuleSchema.parse(readJson('rule.json'))
  const approval = approvalSchema.parse(readJson('approval.json'))
  const inherited = readJson('approval-inherited.json')
  const prepared = readJson('prepared.json'),
    source = readJson('source.json')
  const healthy = readJson('healthy-counterexample.json')
  requireFact(files.has('healthy-counterexample.png'), 'missing healthy screenshot')
  const proposal = records.rule_proposals[0]!,
    finding = records.findings[0]!,
    run = records.runs[0]!
  const hypothesis = records.hypotheses[0]!,
    feedback = records.finding_feedback[0]!
  requireFact(/^run-[a-f0-9-]{36}$/.test(run.id), 'invalid historical run ID')
  requireFact(
    proposal.id === manifest.proposalId &&
      proposal.id === approval.proposalId &&
      proposal.id === inherited.proposalId,
    'approval identity mismatch',
  )
  requireFact(
    proposal.reviewed_by === approval.reviewedBy &&
      proposal.reviewed_by === inherited.reviewedBy &&
      approval.at === manifest.source.approvalAt,
    'approval provenance mismatch',
  )
  requireFact(
    digest(canonicalJson(rule)) === manifest.ruleConfigSha256 &&
      equal(rule, JSON.parse(proposal.rule_config)) &&
      equal(rule, prepared.proposal.ruleConfig),
    'approved declaration changed',
  )
  requireFact(
    prepared.proposal.id === proposal.id &&
      prepared.proposal.findingId === finding.id &&
      prepared.baseline.runId === run.id,
    'prepared identity mismatch',
  )
  requireFact(
    proposal.finding_id === finding.id &&
      finding.run_id === run.id &&
      hypothesis.run_id === run.id &&
      finding.hypothesis_id === hypothesis.id &&
      feedback.finding_id === finding.id &&
      source.findingId === finding.id,
    'source ownership mismatch',
  )
  const artifacts = new Map(records.artifacts.map((a) => [a.id, a]))
  requireFact(artifacts.size === records.artifacts.length, 'duplicate artifact')
  for (const artifact of artifacts.values()) {
    requireFact(
      artifact.run_id === run.id &&
        artifact.file_path === 'artifacts/' + artifact.id &&
        files.has(artifact.file_path),
      'missing or foreign artifact',
    )
    JSON.parse(artifact.metadata)
    if (artifact.type === 'snapshot') {
      const snapshot = readJson(artifact.file_path)
      requireFact(
        artifacts.get(snapshot.screenshotPath)?.type === 'screenshot',
        'snapshot missing original screenshot',
      )
    }
  }
  for (const refs of [
    finding.evidence_refs,
    hypothesis.evidence_refs,
    ...records.run_events.map((e) => e.evidence_refs),
  ])
    for (const ref of z.array(text).parse(JSON.parse(refs)))
      requireFact(artifacts.has(ref), 'unowned evidence reference')
  for (const event of records.run_events)
    requireFact(event.run_id === run.id, 'foreign source event')
  const observationEvent = records.run_events.find((e) => e.type === 'transition:observed')
  const businessEvent = records.run_events.find((e) => e.type === 'business:response')
  requireFact(
    observationEvent && businessEvent && businessEvent.seq < observationEvent.seq,
    'missing source trigger/measurement',
  )
  const observation = JSON.parse(observationEvent.payload),
    business = JSON.parse(businessEvent.payload)
  requireFact(
    business.success === false &&
      business.status === 'failed' &&
      business.canRetry === true &&
      typeof business.orderId === 'string',
    'source is not retry eligible',
  )
  const measurement = records.artifacts.find((a) => a.type === 'measurement')
  requireFact(
    measurement && observation.evidenceRefs.includes(measurement.id),
    'missing linked measurement',
  )
  const measured = readJson(measurement.file_path)
  requireFact(
    equal({ ...measured, evidenceRefs: observation.evidenceRefs }, observation) &&
      measured.evidenceRefs.every((ref: string) => artifacts.has(ref)),
    'source measurement mismatch',
  )
  const positive = z.array(resultSchema).length(1).parse(JSON.parse(proposal.positive_results))
  const negative = z.array(resultSchema).length(2).parse(JSON.parse(proposal.negative_results))
  requireFact(
    equal(JSON.parse(positive[0]!.input), observation) &&
      equal(JSON.parse(negative[0]!.input), healthy.observation),
    'validation not linked to recorded evidence',
  )
  requireFact(
    equal(positive, prepared.proposal.positiveResults) &&
      equal(negative, prepared.proposal.negativeResults),
    'prepared validation changed',
  )
  requireFact(
    equal([positive[0]!.expected, ...negative.map((r) => r.expected)], ['fail', 'pass', 'unknown']),
    'missing defect/healthy/unknown coverage',
  )
  for (const result of [...positive, ...negative])
    requireFact(
      result.passed &&
        result.actual === result.expected &&
        evaluateTransition(rule, JSON.parse(result.input)) === result.expected,
      'historical transition validation failed',
    )
  const history = readJson('recheck-summary.json')
  requireFact(
    history.proposalId === proposal.id &&
      history.passed === true &&
      history.records.length === 6 &&
      history.records.every((r: { passed: boolean }) => r.passed),
    'historical recheck summary mismatch',
  )
  JSON.parse(run.spec)
  JSON.parse(run.usage)
  return {
    manifest,
    records,
    files,
    proposalId: proposal.id,
    ruleConfigSha256: manifest.ruleConfigSha256,
  }
}

/** Materialize only this selected historical source into a NEW, isolated directory. */
export async function importApprovedRetry(
  output: string,
  source = approvedRetryDirectory,
  artifactDirectory = resolve('data/artifacts'),
) {
  const verified = await verifyApprovedRetry(source)
  const destination = resolve(output)
  await mkdir(dirname(destination), { recursive: true })
  await mkdir(destination) // Never overwrite a user's database or previous import.
  const db = createClient({ url: 'file:' + resolve(destination, 'runs.db') })
  try {
    await initializeDatabase(db)
    for (const [name, bytes] of verified.files) {
      await mkdir(dirname(resolve(destination, name)), { recursive: true })
      await writeFile(resolve(destination, name), bytes, { flag: 'wx' })
    }
    await writeFile(
      resolve(destination, 'manifest.json'),
      JSON.stringify(verified.manifest, null, 2) + '\n',
      { flag: 'wx' },
    )
    // Keep the existing HTTP artifact confinement; never broaden it for imported evidence.
    await mkdir(artifactDirectory, { recursive: true })
    const artifactRoot = resolve(await realpath(artifactDirectory), verified.records.runs[0]!.id)
    await mkdir(artifactRoot, { recursive: true })
    requireFact(
      (await realpath(artifactRoot)) === artifactRoot,
      'historical artifact directory is a symlink',
    )
    for (const artifact of verified.records.artifacts) {
      const path = resolve(artifactRoot, artifact.id)
      const bytes = verified.files.get(artifact.file_path)!
      try {
        const existingPath = await realpath(path)
        requireFact(existingPath === path, 'historical artifact is a symlink')
        requireFact(
          (await readFile(path)).equals(bytes),
          'existing historical evidence differs; refusing overwrite',
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await writeFile(path, bytes, { flag: 'wx' })
      }
    }
    // Columns and tables come exclusively from the strict records schema above.
    const statements = Object.entries(verified.records).flatMap(([table, rows]) =>
      rows.map((record) => {
        const columns = Object.keys(record)
        return {
          sql: `INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          args: columns.map((column) =>
            column === 'file_path'
              ? resolve(artifactRoot, (record as Record<string, string>).id!)
              : (record as Record<string, string | number | null>)[column]!,
          ),
        }
      }),
    )
    await db.batch(statements, 'write')
    const stored = (
      await db.execute({
        sql: 'SELECT * FROM rule_proposals WHERE id=?',
        args: [verified.proposalId],
      })
    ).rows[0]
    requireFact(
      stored?.status === 'enabled' &&
        stored.reviewed_by === verified.records.rule_proposals[0]!.reviewed_by &&
        stored.rule_config === verified.records.rule_proposals[0]!.rule_config,
      'import did not preserve approved record',
    )
    db.close()
    await writeFile(
      resolve(destination, 'portable-source.json'),
      JSON.stringify(
        {
          fixtureId: verified.manifest.id,
          manifestSha256: digest(canonicalJson(verified.manifest)),
          proposalId: verified.proposalId,
          ruleConfigSha256: verified.ruleConfigSha256,
          historicalDatabaseSha256: verified.manifest.source.databaseSha256,
          importedDatabaseSha256: digest(await readFile(resolve(destination, 'runs.db'))),
          kind: 'selected-approved-records',
          approvalActionPerformed: false,
          completeHistoricalRun: false,
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    )
    return {
      directory: destination,
      proposalId: verified.proposalId,
      ruleConfigSha256: verified.ruleConfigSha256,
    }
  } catch (error) {
    db.close()
    await rm(destination, { recursive: true, force: true })
    throw error
  }
}
