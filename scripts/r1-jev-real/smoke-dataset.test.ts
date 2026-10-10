import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { SMOKE_STATE_IDS, selectSmokeDataset } from './smoke-dataset.ts'

const development = JSON.parse(
  readFileSync('evaluation/r1-jev-quality/development-inputs.json', 'utf8'),
)

describe('selectSmokeDataset', () => {
  it('freezes exactly the six contracted state ids, in the contracted order', () => {
    expect(SMOKE_STATE_IDS).toEqual(['s01', 's03', 's05', 's07', 's17', 's21'])
  })

  it('selects the six states and nothing else', () => {
    const dataset = selectSmokeDataset(development)
    expect(dataset.cases.map((c) => c.id)).toEqual([...SMOKE_STATE_IDS])
    expect(dataset.cases).toHaveLength(6)
  })

  it('keeps the development split so the smoke phase loads it', () => {
    expect(selectSmokeDataset(development).split).toBe('development')
    expect(selectSmokeDataset(development).version).toBe('r1-jev-dataset-1')
  })

  it('preserves each state input byte-for-byte rather than rewriting it', () => {
    const dataset = selectSmokeDataset(development)
    for (const id of SMOKE_STATE_IDS) {
      const source = development.cases.find((c: { id: string }) => c.id === id)
      expect(JSON.stringify(dataset.cases.find((c) => c.id === id)?.input)).toEqual(
        JSON.stringify(source.input),
      )
    }
  })

  it('is deterministic: the same input yields byte-identical output', () => {
    expect(JSON.stringify(selectSmokeDataset(development))).toEqual(
      JSON.stringify(selectSmokeDataset(development)),
    )
  })

  it('refuses to select from a dataset that is missing a contracted state', () => {
    const truncated = {
      ...development,
      cases: development.cases.filter((c: { id: string }) => c.id !== 's17'),
    }
    expect(() => selectSmokeDataset(truncated)).toThrowError(/missing-state:s17/)
  })

  it('rejects a dataset that is not the expected shape', () => {
    expect(() => selectSmokeDataset({ version: 'other', cases: [] })).toThrowError(/dataset-shape/)
  })
})
