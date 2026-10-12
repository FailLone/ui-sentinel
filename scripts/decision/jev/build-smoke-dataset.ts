/**
 * One-shot generator for the S1 smoke dataset. Writes the derived fixture; the real campaign reads
 * it. No network, no credential, no paid call.
 */
import { writeSmokeDataset } from './smoke-dataset.ts'
const root = process.argv[2] ?? process.cwd()
const out = writeSmokeDataset(root, 'evaluation/fixtures/jev-smoke/smoke-inputs.json')
console.log(out)
