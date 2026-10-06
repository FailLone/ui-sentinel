import { beforeAll, afterAll, it, expect } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { replayProgramPair } from './program-replay.ts'
let browser: Browser
let directory: string
beforeAll(async () => {
  browser = await chromium.launch()
  directory = await mkdtemp(join(tmpdir(), 'program-replay-'))
})
afterAll(async () => {
  await browser.close()
  await rm(directory, { recursive: true, force: true })
})
for (const family of ['menu', 'feedback', 'layout'])
  it(`replays the original model-authored ${family} program without edits; preserve rejected candidates that fail the healthy control`, async () => {
    const saved = JSON.parse(
      await readFile(`evaluation/fixtures/generated-programs/${family}.json`, 'utf8'),
    )
    expect(saved.provenance.mode).toBe('real-model-generated')
    const results = await replayProgramPair(browser, saved.program, family, directory)
    expect(results.map((r) => r.verdict)).toEqual(
      family === 'menu' ? ['fail', 'pass'] : ['fail', 'fail'],
    )
    expect(results.every((r) => JSON.stringify(r.program) === JSON.stringify(saved.program))).toBe(
      true,
    )
  })

for (const family of ['menu', 'feedback', 'layout'])
  it(`distinguishes both ${family} controls using the unchanged model-generated program`, async () => {
    const saved = JSON.parse(
      await readFile(
        `evaluation/fixtures/generated-programs/paired-controls/${family}.json`,
        'utf8',
      ),
    )
    expect(saved.provenance.mode).toBe('real-model-generated')
    const results = await replayProgramPair(browser, saved.program, family, directory)
    expect(results.map((r) => r.verdict)).toEqual(['fail', 'pass'])
    expect(results.every((r) => JSON.stringify(r.program) === JSON.stringify(saved.program))).toBe(
      true,
    )
    expect(results.map((r) => r.evaluatorSetup)).toEqual(
      family === 'layout' ? [false, false] : [true, true],
    )
  })
