import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { parseExplorationInput } from '../../src/agent/decisions/exploration/contracts.ts'
import { sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'
import { safeFile } from './evidence.ts'
import type { CampaignConfig } from './config.ts'
const datasetSchema = z
  .object({
    version: z.literal('r1-jev-dataset-1'),
    split: z.enum(['development', 'holdout']),
    cases: z
      .array(
        z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), input: z.unknown() }).strict(),
      )
      .min(1)
      .max(64),
  })
  .strict()
export function loadDataset(root: string, config: CampaignConfig) {
  const body = readFileSync(safeFile(root, config.dataset))
  if (sha256(body) !== config.datasetSha256) throw new Error('dataset-digest')
  const data = datasetSchema.parse(JSON.parse(body.toString('utf8')))
  if (data.split !== (config.phase === 'holdout' ? 'holdout' : 'development'))
    throw new Error('dataset-split')
  const expected = { smoke: 6, development: 24, holdout: 64 }[config.phase]
  if (
    data.cases.length !== expected ||
    data.cases.length * config.repetitions > config.limits.maxAttempts
  )
    throw new Error('dataset-count')
  if (new Set(data.cases.map((c) => c.id)).size !== data.cases.length)
    throw new Error('duplicate-case')
  return {
    ...data,
    cases: data.cases.map((c) => {
      const parsed = parseExplorationInput(c.input)
      if (!parsed.ok) throw new Error(`input-invalid:${c.id}`)
      if (parsed.value.state.cacheable) throw new Error('quality-requires-cold-cache')
      return { id: c.id, input: parsed.value }
    }),
  }
}
