import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, type Client } from '@libsql/client'
import {
  assertClosed,
  declarationHash,
  importApprovedRule,
  installApprovalIntoBatch,
  loadBatchDeclarations,
  openSourceReadOnly,
  recheckIsolation,
} from './approval-source.ts'
import { RETRY_DECLARATION_SHAPE, equivalentRetryRules } from './expectations.ts'

/**
 * The read-only import and isolation recheck.
 *
 * The batch database the production loader reads is created with `initDatabase()` - the *real* DDL -
 * and every source database is a byte copy of that same schema-initialized file. A hand-copied
 * `CREATE TABLE` list would let these tests keep passing after the real schema changed, which is the
 * drift the import is meant to be checked against.
 */

/**
 * The production client is a module-level singleton, so it can only ever serve one path per test
 * file. That path is the batch database, opened lazily by the one test that calls the real loader.
 */
const batch = { directory: '' }
const template = { directory: '' }
const owned: string[] = []
let mockDirectory = ''

vi.mock('../../../src/shared/config.ts', () => ({
  config: {
    get databaseUrl() {
      return `file:${mockDirectory}/runs.db`
    },
  },
}))

const { initDatabase, getDbClient } = await import('../../../src/storage/database.ts')
const { loadEnabledProposals } = await import('../../../src/rules/proposal.ts')
const { getRule } = await import('../../../src/rules/engine.ts')

/** The declaration a human approved, in the shape the retry question is stated. */
const APPROVED = {
  type: 'transition',
  name: 'Retry must become actionable',
  description: 'The retry control on the failed page must become operable inside the window',
  trigger: { eventType: RETRY_DECLARATION_SHAPE.eventType },
  expectation: {
    condition: 'element-actionable',
    target: RETRY_DECLARATION_SHAPE.target,
    timeoutMs: 5000,
  },
  severity: 'error',
}

function clientAt(path: string): Client {
  return createClient({ url: `file:${path}/runs.db` })
}

/**
 * A closed learning directory holding one enabled, reviewed declaration - the state the acceptance
 * plan says constitutes approval - built as a copy of the real schema.
 */
async function learningDirectory(options: {
  readonly proposalId?: string
  readonly ruleConfig?: Record<string, unknown>
  readonly reviewedBy?: string | null
  readonly status?: string
}) {
  const dir = await mkdtemp(join(tmpdir(), 'approval-source-'))
  owned.push(dir)
  await copyFile(join(template.directory, 'runs.db'), join(dir, 'runs.db'))
  const db = clientAt(dir)
  await db.execute("INSERT INTO runs (id, spec) VALUES ('run-origin', '{}')")
  await db.execute(
    "INSERT INTO findings (id, run_id, source, title, validation_status) VALUES ('finding-origin', 'run-origin', 'agent', 'Retry never enabled', 'supported')",
  )
  await db.execute({
    sql: `INSERT INTO rule_proposals (id, finding_id, rule_config, status, positive_results, negative_results, reviewed_by, created_at, updated_at)
          VALUES (?, 'finding-origin', ?, ?, '[]', '[]', ?, ?, ?)`,
    args: [
      options.proposalId ?? 'proposal-fc30e9bb',
      JSON.stringify(options.ruleConfig ?? APPROVED),
      options.status ?? 'enabled',
      options.reviewedBy === undefined ? 'human-delegated' : options.reviewedBy,
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  })
  db.close()
  return dir
}

beforeAll(async () => {
  batch.directory = await mkdtemp(join(tmpdir(), 'approval-batch-'))
  owned.push(batch.directory)
  // Creating the schema here also primes the production client on the batch path, which is the one
  // path `loadEnabledProposals()` will read.
  mockDirectory = batch.directory
  await initDatabase()
  // A pristine copy of the real schema. The batch database above receives the installs, so it
  // cannot double as the template: a second install would collide with the first one's rows.
  template.directory = await mkdtemp(join(tmpdir(), 'approval-template-'))
  owned.push(template.directory)
  await copyFile(join(batch.directory, 'runs.db'), join(template.directory, 'runs.db'))
})

afterAll(async () => {
  getDbClient().close()
  for (const path of owned) await rm(path, { recursive: true, force: true })
})

it('imports the enabled declaration and its reviewer from a closed source, writing nothing to it', async () => {
  const source = await learningDirectory({})
  const before = await readFile(join(source, 'runs.db'))
  const imported = await importApprovedRule({
    directory: source,
    expectedProposalId: 'proposal-fc30e9bb',
  })
  expect(imported.proposalId).toBe('proposal-fc30e9bb')
  expect(imported.reviewedBy).toBe('human-delegated')
  expect(imported.ruleRevision).toBe('1')
  expect(imported.declarationHash).toBe(declarationHash(APPROVED))
  expect(imported.declared.expectation?.target).toBe(RETRY_DECLARATION_SHAPE.target)
  // The source is byte-identical afterwards: the import read it and put nothing back.
  expect((await readFile(join(source, 'runs.db'))).equals(before)).toBe(true)
})

it('refuses an open source, including one left in -shm', async () => {
  const source = await learningDirectory({})
  await assertClosed(source)
  for (const suffix of ['-wal', '-journal', '-shm']) {
    const witness = join(source, `runs.db${suffix}`)
    await writeFile(witness, 'not checkpointed')
    await expect(importApprovedRule({ directory: source })).rejects.toThrow(
      /approval-source-not-closed/,
    )
    await rm(witness)
  }
  // And it is importable again once the store is closed.
  await expect(importApprovedRule({ directory: source })).resolves.toBeTruthy()
})

it('refuses a source that has no approval to import', async () => {
  // `enabled` with no reviewer is not an approval: the status can be set by a script.
  const unreviewed = await learningDirectory({ proposalId: 'proposal-x', reviewedBy: null })
  await expect(importApprovedRule({ directory: unreviewed })).rejects.toThrow(
    /approval-source-unapproved/,
  )

  const draft = await learningDirectory({ proposalId: 'proposal-y', status: 'approved' })
  await expect(importApprovedRule({ directory: draft })).rejects.toThrow(
    /approval-source-invalid: expected exactly one enabled rule, found 0/,
  )

  const absent = await mkdtemp(join(tmpdir(), 'approval-absent-'))
  owned.push(absent)
  await expect(importApprovedRule({ directory: absent })).rejects.toThrow(/approval-source-missing/)
})

it('hands back a source handle that refuses every write', async () => {
  const source = await learningDirectory({})
  const client = await openSourceReadOnly(join(source, 'runs.db'))
  // The import must not be able to change the source even if its own code is wrong, so the refusal
  // is the client's, not the caller's restraint. Measured: SQLITE_READONLY.
  await expect(
    client.execute("UPDATE rule_proposals SET status='enabled' WHERE id='proposal-fc30e9bb'"),
  ).rejects.toThrow(/READONLY/)
  await expect(client.execute('DELETE FROM rule_proposals')).rejects.toThrow(/READONLY/)
  // Reading still works through the same handle.
  expect((await client.execute('SELECT count(*) c FROM rule_proposals')).rows[0]?.c).toBe(1)
  client.close()
})

it('refuses a source whose enabled rule is not the one that was asked for', async () => {
  const source = await learningDirectory({})
  await expect(
    importApprovedRule({ directory: source, expectedProposalId: 'proposal-something-else' }),
  ).rejects.toThrow(/approval-source-mismatch/)
})

it('rechecks isolation against a retargeted, retimed or unpackaged declaration', async () => {
  const imported = await importApprovedRule({ directory: await learningDirectory({}) })
  expect(recheckIsolation({ imported, liveRuleConfig: APPROVED }).passed).toBe(true)

  // The live rule was retargeted, relaxed or re-triggered after the import.
  const retargeted = recheckIsolation({
    imported,
    liveRuleConfig: {
      ...APPROVED,
      expectation: { ...APPROVED.expectation, target: 'anything that looks like recovery' },
    },
  })
  expect(retargeted.passed).toBe(false)
  expect(retargeted.assertions.declarationUnchanged).toBe(false)
  // `semanticTargetIntact` judges the imported declaration, so a live rule that was retargeted is
  // caught by `declarationUnchanged` above; the imported copy still poses the retry question.
  expect(retargeted.assertions.semanticTargetIntact).toBe(true)

  const retimed = recheckIsolation({
    imported,
    liveRuleConfig: { ...APPROVED, expectation: { ...APPROVED.expectation, timeoutMs: 60_000 } },
  })
  expect(retimed.assertions.timeoutIntact).toBe(false)
  expect(retimed.passed).toBe(false)

  const retriggered = recheckIsolation({
    imported,
    liveRuleConfig: { ...APPROVED, trigger: { eventType: 'something-else' } },
  })
  expect(retriggered.assertions.declarationUnchanged).toBe(false)
  expect(retriggered.assertions.triggerIntact).toBe(true)

  // The shape assertions are not a second copy of the hash: they catch an import of a rule that is
  // internally consistent but was never the retry question. Here the source's enabled rule is an
  // approved declaration about a different control, so nothing hashes anything and yet the batch
  // would be grading against the wrong requirement.
  const irrelevant = {
    ...APPROVED,
    expectation: { ...APPROVED.expectation, target: 'Cancel button' },
  }
  const wrongQuestion = recheckIsolation({
    imported: { ...imported, ruleConfig: irrelevant, declarationHash: declarationHash(irrelevant) },
    liveRuleConfig: irrelevant,
  })
  expect(wrongQuestion.assertions.declarationUnchanged).toBe(true)
  expect(wrongQuestion.assertions.semanticTargetIntact).toBe(false)
  expect(wrongQuestion.failedAssertions).toEqual(['semanticTargetIntact'])
  expect(wrongQuestion.passed).toBe(false)

  // An import that somehow carried no timeout cannot be called intact: there is nothing to compare,
  // and treating a missing requirement as satisfied is how a relaxed rule gets through.
  const timeless = recheckIsolation({
    imported: {
      ...imported,
      ruleConfig: { ...APPROVED, expectation: { ...APPROVED.expectation, timeoutMs: undefined } },
    },
    liveRuleConfig: { ...APPROVED, expectation: { ...APPROVED.expectation, timeoutMs: undefined } },
  })
  expect(timeless.assertions.timeoutIntact).toBe(false)
  expect(timeless.failedAssertions).toContain('timeoutIntact')
})

it('installs the declaration into a batch database that the production loader then compiles', async () => {
  const imported = await importApprovedRule({ directory: await learningDirectory({}) })
  mockDirectory = batch.directory
  const db = clientAt(batch.directory)
  await installApprovalIntoBatch({
    client: db,
    imported,
    batchEnvironmentId: 'export-arena',
    batchEntryUrl: 'http://127.0.0.1:4183/',
  })

  // The batch's own loader must find it as an enabled, reviewed declaration - that is what makes the
  // import usable at all - and it is the real loader rather than a query written here.
  await loadEnabledProposals()
  const compiled = getRule(imported.proposalId)
  expect(compiled, 'the imported declaration was not compiled into the batch').toBeTruthy()
  expect(
    (compiled?.declaration as { expectation?: { target?: string } } | undefined)?.expectation
      ?.target,
  ).toBe(RETRY_DECLARATION_SHAPE.target)

  // Its provenance names the import, so it cannot read as a direct human approval here.
  const row = (await db.execute("SELECT reviewed_by FROM rule_proposals WHERE status='enabled'"))
    .rows[0]!
  expect(String(row.reviewed_by)).toContain('imported unchanged from')
  expect(String(row.reviewed_by)).toContain('human-delegated')

  // The provenance run row is not addressable as a batch result: nothing in the batch carries a
  // status any batch or health query selects on.
  const runs = await db.execute('SELECT id, status, business_result FROM runs')
  const provenance = runs.rows.find((r) => String(r.id).startsWith('import-'))
  expect(provenance?.status).toBe('interrupted')
  expect(provenance?.business_result).toBe('unknown')
  expect(
    runs.rows.filter((r) =>
      ['completed', 'blocked', 'running', 'queued'].includes(String(r.status)),
    ),
  ).toEqual([])
  db.close()
})

it('reports the batch declarations the scorer is handed, rather than only the imported one', async () => {
  const imported = await importApprovedRule({ directory: await learningDirectory({}) })
  const directory = await mkdtemp(join(tmpdir(), 'approval-declared-'))
  owned.push(directory)
  await copyFile(join(template.directory, 'runs.db'), join(directory, 'runs.db'))
  const db = clientAt(directory)
  await installApprovalIntoBatch({
    client: db,
    imported,
    batchEnvironmentId: 'export-arena',
    batchEntryUrl: 'http://127.0.0.1:4183/',
  })
  // A second rule enabled beside the import, asking the same question under another id. Its finding
  // is the import's own provenance row, because that is the only finding this batch holds.
  await db.execute({
    sql: `INSERT OR REPLACE INTO rule_proposals (id, finding_id, rule_config, status, reviewed_by, created_at, updated_at)
          VALUES ('proposal-other', ?, ?, 'enabled', 'someone-else', ?, ?)`,
    args: [
      `import-${imported.proposalId}`,
      JSON.stringify(APPROVED),
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  })
  const declared = await loadBatchDeclarations(db)
  db.close()

  // Both enabled rules are reported - including the one that was never imported - which is what lets
  // the scorer refuse a discovery group that already has the answer.
  expect(declared.map((r) => r.id).sort()).toEqual(['proposal-fc30e9bb', 'proposal-other'])
  expect(equivalentRetryRules(declared).sort()).toEqual(['proposal-fc30e9bb@1', 'proposal-other@1'])
})
