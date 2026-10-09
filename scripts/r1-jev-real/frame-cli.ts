/** Exact one-frame campaign CLI. No request is dispatched without a matching approval file. */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { runAuthorizedFrame, RESERVATION_USD } from './frame-campaign.ts'
import { compileFrame, requestFor } from '../../src/agent/exploration/integration/jev.ts'
import { digest, type PublicFrame } from '../../src/agent/exploration/integration/host.ts'
const [mode, framePath, freezePath, approvalPath, output] = process.argv.slice(2)
const frame = JSON.parse(readFileSync(framePath, 'utf8')) as PublicFrame
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (mode === '--freeze' && !approvalPath && !output) {
  const compiled = compileFrame(requestFor(frame))
  const freeze = {
    sourceSha,
    packetHash: digest(frame),
    wireHash: compiled.wireDigest,
    maxCostUsd: RESERVATION_USD,
  }
  writeFileSync(freezePath, JSON.stringify(freeze, null, 2) + '\n', { flag: 'wx' })
  console.log(
    JSON.stringify({
      freeze,
      freezeHash: digest(freeze),
      questions: Object.keys(compiled.questions).length,
      bytes: compiled.byteLength,
      httpRequests: 0,
    }),
  )
} else if (mode === '--run' && approvalPath && output) {
  if (
    execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      encoding: 'utf8',
    }).trim()
  )
    throw new Error('tracked-source-dirty')
  const result = await runAuthorizedFrame({
    frame,
    freeze: JSON.parse(readFileSync(freezePath, 'utf8')),
    authorization: JSON.parse(readFileSync(approvalPath, 'utf8')),
    sourceSha,
    directory: resolve(output),
    claimDirectory: resolve('artifacts/r1-jev-real/frame-authorizations'),
    getKey: () => process.env.R1_JEV_API_KEY ?? '',
    signal: AbortSignal.timeout(15000),
  })
  console.log(JSON.stringify(result))
} else
  throw new Error(
    'usage: --freeze frame.json freeze.json | --run frame.json freeze.json approval.json new-output',
  )
