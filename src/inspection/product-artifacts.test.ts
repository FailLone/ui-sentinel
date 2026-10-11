import { it, expect } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { defaultCheckArtifactIssues } from './check-artifacts.ts'
import { productPathReport } from './product-path.ts'
import { freezeProductSource } from './product-source.ts'
import { citationSource, r4Draft } from '../../scripts/validation/r2-citation-replay.ts'
const source = freezeProductSource(citationSource)
const run: any = { spec: { uiContract: { checkPolicy: {}, productSource: source } } }
it('diagnostic rejection is not required evidence and cannot become completion proof', async () => {
  const events: any = [
    {
      id: 'bad',
      seq: 1,
      type: 'product:registration-rejected',
      payload: { diagnostics: [] },
      evidenceRefs: [],
    },
  ]
  expect(await defaultCheckArtifactIssues(run, events, [])).toEqual([])
  expect(productPathReport(source, events)).toMatchObject({ complete: false, state: 'unverified' })
})
it.each(['product-path-2', 'product-path-3', 'product-path-4'])(
  'retains binding byte and admission validation for %s history',
  async (revision) => {
    const dir = await mkdtemp(join(tmpdir(), 'product-history-'))
    const artifacts: any[] = [],
      events: any[] = []
    const save = async (id: string, type: string, body: any) => {
      const path = join(dir, id),
        bytes = JSON.stringify(body)
      await writeFile(path, bytes)
      artifacts.push({
        id,
        type,
        path,
        metadata: { evidenceIntegrity: { version: 1, status: 'clean', interventionIds: [] } },
      })
      return createHash('sha256').update(bytes).digest('hex')
    }
    try {
      const plan = r4Draft()
      for (const step of plan.steps)
        for (const p of [step, ...step.preconditions]) {
          p.citation.start = source.markdown.indexOf(p.citation.quote)
          p.citation.end = p.citation.start + p.citation.quote.length
        }
      events.push({
        id: 'p',
        seq: 1,
        type: 'product:planned',
        payload: {
          plan,
          revision,
          artifactHashes: { p: await save('p', 'product-plan', { plan, revision }) },
        },
        evidenceRefs: ['p'],
      })
      const checks: any[] = [],
        payload = {
          step: 0,
          checks,
          itemId: 'missing-original',
          planEventId: 'p',
          targetWasSelected: false,
        }
      const hashes = {
        c: await save('c', 'product-preconditions', checks),
        s: await save('s', 'screenshot', {}),
        b: await save('b', 'product-binding', { ...payload, itemId: 'substituted' }),
      }
      events.push({
        id: 'b',
        seq: 2,
        type: 'product:bound',
        payload: { ...payload, artifactHashes: hashes },
        evidenceRefs: ['c', 's', 'b'],
      })
      expect(await defaultCheckArtifactIssues(run, events, artifacts)).toContain(
        'product-binding-artifact-mismatch',
      )
      expect(productPathReport(source, events).issues).toContain('product-admission-invalid')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
)
