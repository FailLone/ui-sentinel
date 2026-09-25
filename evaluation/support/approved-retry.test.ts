import { afterEach, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createClient } from '@libsql/client'
import {
  approvedRetryDirectory,
  importApprovedRetry,
  verifyApprovedRetry,
} from './approved-retry.ts'

const temporary: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})
async function sandbox() {
  const dir = await mkdtemp(resolve(tmpdir(), 'sentinel approved retry '))
  temporary.push(dir)
  const source = resolve(dir, 'source')
  await cp(approvedRetryDirectory, source, { recursive: true })
  return {
    dir,
    source,
    output: resolve(dir, 'different machine', 'import'),
    artifactDirectory: resolve(dir, 'runtime', 'data', 'artifacts'),
  }
}
async function modify(source: string, file: string, change: (data: any) => void) {
  const value = JSON.parse(await readFile(resolve(source, file), 'utf8'))
  change(value)
  const bytes = Buffer.from(JSON.stringify(value))
  await writeFile(resolve(source, file), bytes)
  // Even if someone updates a file checksum, relational approval checks must still fail.
  const manifest = JSON.parse(await readFile(resolve(source, 'manifest.json'), 'utf8'))
  const entry = manifest.files.find((e: any) => e.path === file)
  entry.bytes = bytes.length
  entry.sha256 = createHash('sha256').update(bytes).digest('hex')
  await writeFile(resolve(source, 'manifest.json'), JSON.stringify(manifest))
}

it('imports relocated evidence and the original enabled approval without model access', async () => {
  const { source, output, artifactDirectory } = await sandbox()
  const fetch = vi.fn(() => {
    throw Error('No model/network calls permitted')
  })
  vi.stubGlobal('fetch', fetch)
  const verified = await verifyApprovedRetry(source)
  const result = await importApprovedRetry(output, source, artifactDirectory)
  expect(result.proposalId).toBe(verified.proposalId)
  const db = createClient({ url: 'file:' + resolve(output, 'runs.db') })
  try {
    const proposal = (await db.execute('SELECT * FROM rule_proposals')).rows[0]!
    expect(proposal.status).toBe('enabled')
    expect(proposal.reviewed_by).toBe('user')
    expect(proposal.rule_config).toBe(verified.records.rule_proposals[0]!.rule_config)
    expect(proposal.updated_at).toBe(verified.records.rule_proposals[0]!.updated_at)
    const prepared = JSON.parse(await readFile(resolve(output, 'prepared.json'), 'utf8'))
    expect(prepared.proposal.status).toBe('validating') // Preparation is not the approval source.
    expect(JSON.parse(String(proposal.rule_config))).toEqual(prepared.proposal.ruleConfig)
    const sourceMeta = JSON.parse(await readFile(resolve(output, 'source.json'), 'utf8'))
    const finding = (
      await db.execute({ sql: 'SELECT * FROM findings WHERE id=?', args: [sourceMeta.findingId] })
    ).rows[0]!
    expect(finding.source).toBe('agent')
    expect(finding.validation_status).toBe('supported')
    const run = (
      await db.execute({ sql: 'SELECT * FROM runs WHERE id=?', args: [finding.run_id!] })
    ).rows[0]!
    expect(JSON.parse(String(run.spec)).budget.maxModelCalls).toBe(30)
    const observations = (
      await db.execute("SELECT payload FROM run_events WHERE type='transition:observed'")
    ).rows
    expect(observations).toHaveLength(1)
    expect(
      JSON.parse(String(observations[0]!.payload)).evidenceRefs.some((id: string) =>
        JSON.parse(String(finding.evidence_refs)).includes(id),
      ),
    ).toBe(true)
    for (const artifact of (await db.execute('SELECT * FROM artifacts')).rows) {
      expect(String(artifact.file_path)).toBe(
        resolve(await realpath(artifactDirectory), String(artifact.run_id), String(artifact.id)),
      )
      expect(await readFile(String(artifact.file_path))).toEqual(
        verified.files.get('artifacts/' + artifact.id),
      )
    }
  } finally {
    db.close()
  }
  const receipt = JSON.parse(await readFile(resolve(output, 'portable-source.json'), 'utf8'))
  expect(receipt).toMatchObject({ approvalActionPerformed: false, completeHistoricalRun: false })
  expect(receipt.importedDatabaseSha256).not.toBe(receipt.historicalDatabaseSha256)
  expect(fetch).not.toHaveBeenCalled()
  // Re-check imports are compatible sources, and checking never rewrites them.
  expect((await verifyApprovedRetry(output)).ruleConfigSha256).toBe(verified.ruleConfigSha256)
})

it('never overwrites an existing source or user database', async () => {
  const { source, output, artifactDirectory } = await sandbox()
  await importApprovedRetry(output, source, artifactDirectory)
  const before = await readFile(resolve(output, 'runs.db'))
  await expect(importApprovedRetry(output, source, artifactDirectory)).rejects.toThrow()
  expect(await readFile(resolve(output, 'runs.db'))).toEqual(before)
})

it('refuses conflicting evidence in the runtime artifact store without overwriting it', async () => {
  const { source, output, artifactDirectory } = await sandbox()
  const fixture = await verifyApprovedRetry(source)
  const artifact = fixture.records.artifacts[0]!
  const root = resolve(artifactDirectory, artifact.run_id)
  await mkdir(root, { recursive: true })
  const path = resolve(root, artifact.id)
  await writeFile(path, 'existing evidence must survive')
  await expect(importApprovedRetry(output, source, artifactDirectory)).rejects.toThrow(
    'refusing overwrite',
  )
  expect(await readFile(path, 'utf8')).toBe('existing evidence must survive')
  await expect(readFile(resolve(output, 'runs.db'))).rejects.toThrow()
})

it('rejects missing approval and changed raw evidence before creating output', async () => {
  const { source, output, artifactDirectory } = await sandbox()
  await rm(resolve(source, 'approval.json'))
  await expect(importApprovedRetry(output, source, artifactDirectory)).rejects.toThrow()
  await expect(readFile(resolve(output, 'runs.db'))).rejects.toThrow()
  await cp(resolve(approvedRetryDirectory, 'approval.json'), resolve(source, 'approval.json'))
  await writeFile(resolve(source, 'healthy-counterexample.png'), 'corrupted')
  await expect(importApprovedRetry(output, source, artifactDirectory)).rejects.toThrow(
    'file hash mismatch',
  )
})

it.each([
  [
    'records.json',
    (r: any) => {
      r.rule_proposals[0].status = 'validating'
    },
  ],
  [
    'approval.json',
    (r: any) => {
      r.reviewedBy = 'fabricated-reviewer'
    },
  ],
  [
    'rule.json',
    (r: any) => {
      r.expectation.timeoutMs = 1
    },
  ],
  [
    'records.json',
    (r: any) => {
      r.artifacts[0].run_id = 'foreign-run'
    },
  ],
  [
    'records.json',
    (r: any) => {
      r.rule_proposals[0].sql = 'arbitrary column'
    },
  ],
])(
  'rejects an invalid approval/declaration/owner/schema even with updated checksums: %s',
  async (file, change) => {
    const { source } = await sandbox()
    await modify(source, file as string, change as (r: any) => void)
    await expect(verifyApprovedRetry(source)).rejects.toThrow()
  },
)

it('rejects path traversal, duplicate entries and evidence symlink escapes', async () => {
  const { dir, source } = await sandbox()
  const manifestPath = resolve(source, 'manifest.json')
  const raw = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(raw)
  manifest.files[0].path = '../outside.json'
  await writeFile(manifestPath, JSON.stringify(manifest))
  await expect(verifyApprovedRetry(source)).rejects.toThrow('manifest path')
  const duplicate = JSON.parse(raw)
  duplicate.files.push(duplicate.files[0])
  await writeFile(manifestPath, JSON.stringify(duplicate))
  await expect(verifyApprovedRetry(source)).rejects.toThrow('manifest path')
  await writeFile(manifestPath, raw)
  const outside = resolve(dir, 'outside.json')
  await cp(resolve(source, 'approval.json'), outside)
  await rm(resolve(source, 'approval.json'))
  await symlink(outside, resolve(source, 'approval.json'))
  await expect(verifyApprovedRetry(source)).rejects.toThrow('escapes fixture')
})
