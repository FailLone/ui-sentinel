/**
 * Derives the S1 six-state smoke dataset from the existing development inputs.
 *
 * The six states were fixed by `plans/r1-completion-plan.md` §7 (menu, fold, tabs, same-label
 * context, insufficient information, multi-step handoff). They are EXPORTED from the development
 * inputs rather than re-authored, so the smoke batch and the development batch cannot diverge.
 *
 * This script reads a local fixture and writes a fixture. It performs no network request and reads
 * no credential; the real campaign still cannot start until the protocol blockers are cleared.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The exact contracted set, in report order. Editing this is a scope decision, not a detail. */
export const SMOKE_STATE_IDS = ['s01', 's03', 's05', 's07', 's17', 's21'] as const

type DatasetCase = { id: string; input: unknown }
type Dataset = { version: string; split: string; cases: DatasetCase[] }

export function selectSmokeDataset(raw: unknown): Dataset {
  const source = raw as Partial<Dataset> | null
  if (
    !source ||
    source.version !== 'r1-jev-dataset-1' ||
    typeof source.split !== 'string' ||
    !Array.isArray(source.cases)
  )
    throw new Error('dataset-shape')
  const cases: DatasetCase[] = []
  for (const id of SMOKE_STATE_IDS) {
    const found = source.cases.find((c) => c.id === id)
    if (!found) throw new Error(`missing-state:${id}`)
    // Kept verbatim: the input is the frozen public material, not something to re-serialize.
    cases.push({ id, input: found.input })
  }
  return { version: source.version, split: source.split, cases }
}

export function writeSmokeDataset(root: string, outputPath: string): string {
  const dataset = selectSmokeDataset(
    JSON.parse(readFileSync(join(root, 'evaluation/r1-jev-quality/development-inputs.json'), 'utf8')),
  )
  const full = join(root, outputPath)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, `${JSON.stringify(dataset, null, 2)}\n`)
  return full
}