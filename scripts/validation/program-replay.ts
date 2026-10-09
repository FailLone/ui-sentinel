import { chromium } from 'playwright'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { replayProgramPair } from '../../evaluation/support/program-replay.ts'
import { buildIdentity } from '../../evaluation/support/build-identity.ts'
const source = process.argv[2]
if (!source) throw Error('Provide a directory containing the original *-broken-receipts.json files')
const directory = resolve('data/program-replay', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true })
const results = []
try {
  for (const family of ['menu', 'feedback', 'layout']) {
    const receipts = JSON.parse(
      await readFile(resolve(source, `${family}-broken-receipts.json`), 'utf8'),
    )
    const receipt = receipts.find((r: any) => r.verdict === 'fail')
    if (!receipt) throw Error(`No original generated failing program for ${family}`)
    const replays = await replayProgramPair(browser, receipt.program, family, directory)
    await writeFile(`${directory}/${family}.json`, JSON.stringify(replays, null, 2))
    results.push({
      family,
      verdicts: replays.map((r) => r.verdict),
      passed:
        replays.length === 2 && replays.every((r) => r.verdict === (r.healthy ? 'pass' : 'fail')),
    })
  }
} finally {
  await browser.close()
}
const result = {
  source: resolve(source),
  directory,
  identity: await buildIdentity(),
  results,
  passed: results.length === 3 && results.every((r) => r.passed),
  paidModelRequests: 0,
}
await writeFile(`${directory}/summary.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ ...result, identity: result.identity.hash }))
if (!result.passed) process.exitCode = 1
