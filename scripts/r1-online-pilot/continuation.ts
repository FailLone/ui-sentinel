/** One explicitly approved continuation of the preserved 2026-10-09 failure, never a reset. */
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { CampaignSpending } from '../../evaluation/support/campaign-ledger.ts'

const root = '/Users/xietian/Documents/ChatGPT'
const oldHash = '9f73f0d6e3140b2d891d043441053bb75579550d58fdbf850a081c0bdc56ba75'
export const CONTINUATION = {
  version: 'r1-explicit-unknown-continuation-1',
  sourceManifestHash: oldHash,
  sourceCampaignId: '2063928d-77c8-46ab-8b09-5811fc52e03e',
  sourceRequestId: '0ddb03d5250db453759b72ee',
  sourceStopEpoch: 1,
  knownActualUsd: 0,
  unknownReservedUsd: 0.053,
  unknownCount: 1,
  heldReservedUsd: 0,
  canonicalClaims: root + '/ui-sentinel-r1-online-claims',
  pins: [
    {
      path:
        root +
        '/ui-sentinel-r1-online-runtime/artifacts/r1-online-pilot/authorized-batch-1/account/campaign.db',
      sha256: 'e78f2588e8d163155c639d65c2f19ccdd127cc1342b327e11604b04457645936',
    },
    {
      path: root + '/ui-sentinel-r1-online-claims/' + oldHash + '.claim',
      sha256: 'f1743a4d1952fd712c87a76388d5da820a8c44b3daccf2dda0d7c680d32a639b',
    },
    {
      path: root + '/ui-sentinel-r1-online-claims/' + oldHash + '.execution-lock',
      sha256: '4865494226f9b1456c91966d85b2fdea5dfad5b5a004b79ead37379986cac937',
    },
  ],
  preserveOldUnknownAndStop: true,
  stopOnAnyNewUnknown: true,
} as const

export function acceptanceFor(newBudgetUsd: number) {
  return {
    policy: CONTINUATION.version,
    sourceManifestHash: oldHash,
    sourceRequestId: CONTINUATION.sourceRequestId,
    sourceDbSha256: CONTINUATION.pins[0].sha256,
    acceptUnsettledRiskUsd: CONTINUATION.unknownReservedUsd,
    maxCombinedAccountedUsd: Number((newBudgetUsd + CONTINUATION.unknownReservedUsd).toFixed(6)),
    oldBatchRemainsStopped: true,
    stopOnAnyNewUnknown: true,
  }
}

// Injected filesystem/pin fixtures are solely for free tests. The runner always uses the
// fixed defaults; no CLI/config option can replace the pinned lineage.
export function createContinuation(
  manifestHash: string,
  claims: string,
  output: string,
  io = {
    read: (p: string) => readFileSync(p),
    realpath: (p: string) => realpathSync(p),
    exists: (p: string) => existsSync(p),
    write: writeFileSync,
    pins: CONTINUATION.pins as readonly { path: string; sha256: string }[],
  },
) {
  const riskClaim = join(
    CONTINUATION.canonicalClaims,
    'continued-' + CONTINUATION.sourceRequestId + '.claim',
  )
  const claimBody = JSON.stringify({ manifestHash, output, lineage: CONTINUATION })
  let claimed = false
  const checkSource = () => {
    if (io.realpath(claims) !== io.realpath(CONTINUATION.canonicalClaims))
      throw Error('canonical-continuation-claims-required')
    for (const p of io.pins) {
      if (createHash('sha256').update(io.read(p.path)).digest('hex') !== p.sha256)
        throw Error('continuation-source-changed')
    }
    // The pinned, closed DB is the complete source, not a live DB with unpinned WAL state.
    if (io.exists(CONTINUATION.pins[0].path + '-wal')) throw Error('continuation-source-not-closed')
    if (claimed && io.read(riskClaim).toString() !== claimBody)
      throw Error('continuation-claim-changed')
  }
  return {
    preflight() {
      checkSource()
      if (io.exists(riskClaim)) throw Error('continuation-already-consumed')
    },
    claim() {
      checkSource()
      // Permanent once-only lineage claim also prevents another manifest/output from continuing it.
      io.write(riskClaim, claimBody, { flag: 'wx', mode: 0o600, flush: true })
      claimed = true
    },
    guard() {
      if (!claimed) throw Error('continuation-not-claimed')
      checkSource()
    },
    identity: { manifestHash, source: CONTINUATION, riskClaim },
  }
}

export function combinedSpending(current: CampaignSpending) {
  return {
    previous: CONTINUATION,
    current,
    combinedUnknownCount: current.unknownCount + CONTINUATION.unknownCount,
    combinedKnownActualUsd: current.knownCostUsd,
    combinedUnknownReservedUsd: Number((current.unknownReservedUsd + 0.053).toFixed(9)),
    combinedAccountedUsd: Number((current.accountedUsd + 0.053).toFixed(9)),
    combinedLimitUsd: Number((current.limitUsd + 0.053).toFixed(9)),
    actualTotalUsd: null,
    previousActualStillUnknown: true,
  }
}
