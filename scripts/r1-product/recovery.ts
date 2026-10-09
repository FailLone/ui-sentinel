/** Explicit proposed continuation after the stopped product batch; never reuses its authorization. */
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { CONTINUATION } from '../r1-online-pilot/continuation.ts'
import type { CampaignSpending } from '../../evaluation/support/campaign-ledger.ts'
export const PRODUCT_RECOVERY = {
  version: 'r1-product-failure-continuation-1',
  sourceManifestHash: '41eb23e34527461bae8bc50e6d0b28ae53d94bb584d8d167b7eddecedbfcf510',
  sourceCampaignId: '68594301-1db8-4ff9-9f67-a60d72dc67f7',
  sourceRow: 'C10-1',
  sourceStoppedReason: 'persistence-or-false-covered',
  previousKnownActualUsd: 0.00502455,
  inheritedUnknownReservedUsd: 0.053,
  inheritedUnknownCount: 1,
  originalFailure: CONTINUATION,
  pins: [
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-ddf1dd9/data/r1-product/authorized-acceptance/account/campaign.db',
      sha256: '9cd6d5a68d5bec046145cdc0a6b39c27736b9efa8b45abb0ba2a161004ef770c',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-ddf1dd9/data/r1-product/authorized-acceptance/account/campaign-id.json',
      sha256: '4059f7c7de6b8e9df1f7611095f4f0c1acfac3cd67f35900c07590da2107ed46',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-ddf1dd9/data/r1-product/authorized-acceptance/accounting.json',
      sha256: 'e56a93413e2decaec793253c787dd6dfb4ed9ab9d918aa3363218c56bd7cb14d',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-ddf1dd9/data/r1-product/authorized-acceptance/stop.json',
      sha256: '96bbf3e2aa2adef1f1a9a7def6f15376a2fa7eeb8b28ebb99bdedfd46f9ca31f',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-ddf1dd9/data/r1-product/authorized-acceptance/manifest.json',
      sha256: '1a89755d397a87f62be87499b74cc1e18127f747b18a3c84cc942471f8a4fdcb',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-ddf1dd9/data/r1-product/authorized-acceptance/results.json',
      sha256: 'ac2933c85c5c69952866d87066ca00d375f95bd3269495ead7220e9fd493f81c',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-online-claims/continued-0ddb03d5250db453759b72ee.claim',
      sha256: '0944f222ae97e63f5a4ea25fb45dee60d0930d386621b0f456daebd60d3c3df1',
    },
  ],
} as const
const amount = (n: number) => Number(n.toFixed(9))
export function productRiskAcceptance(newBudgetUsd: number) {
  return {
    policy: PRODUCT_RECOVERY.version,
    sourceManifestHash: PRODUCT_RECOVERY.sourceManifestHash,
    sourceCampaignId: PRODUCT_RECOVERY.sourceCampaignId,
    sourceDbSha256: PRODUCT_RECOVERY.pins[0].sha256,
    previousKnownActualUsd: PRODUCT_RECOVERY.previousKnownActualUsd,
    acceptUnsettledRiskUsd: 0.053,
    maxCombinedAccountedUsd: amount(newBudgetUsd + 0.00502455 + 0.053),
    bothPriorBatchesRemainStopped: true,
    stopOnAnyNewUnknown: true,
  }
}
export function combinedProductSpending(current: CampaignSpending) {
  return {
    previous: PRODUCT_RECOVERY,
    current,
    combinedUnknownCount: current.unknownCount + 1,
    combinedKnownActualUsd: amount(current.knownCostUsd + 0.00502455),
    combinedUnknownReservedUsd: amount(current.unknownReservedUsd + 0.053),
    combinedAccountedUsd: amount(current.accountedUsd + 0.00502455 + 0.053),
    combinedLimitUsd: amount(current.limitUsd + 0.00502455 + 0.053),
    actualTotalUsd: null,
    previousActualStillUnknown: true,
  }
}
// Fixed production lineage; filesystem/pins injection is for free tests only, never CLI input.
export function createProductContinuation(
  manifestHash: string,
  claims: string,
  output: string,
  io = {
    read: (p: string) => readFileSync(p),
    realpath: (p: string) => realpathSync(p),
    exists: (p: string) => existsSync(p),
    write: writeFileSync,
    pins: [...CONTINUATION.pins, ...PRODUCT_RECOVERY.pins] as readonly {
      path: string
      sha256: string
    }[],
  },
) {
  const riskClaim = join(
    CONTINUATION.canonicalClaims,
    'continued-product-' + PRODUCT_RECOVERY.sourceManifestHash + '.claim',
  )
  const body = JSON.stringify({ manifestHash, output, lineage: PRODUCT_RECOVERY })
  let claimed = false
  const check = () => {
    if (io.realpath(claims) !== io.realpath(CONTINUATION.canonicalClaims))
      throw Error('canonical-product-recovery-claims-required')
    for (const p of io.pins)
      if (createHash('sha256').update(io.read(p.path)).digest('hex') !== p.sha256)
        throw Error('product-recovery-source-changed')
    for (const db of [CONTINUATION.pins[0].path, PRODUCT_RECOVERY.pins[0].path])
      if (io.exists(db + '-wal')) throw Error('product-recovery-source-not-closed')
    if (claimed && io.read(riskClaim).toString() !== body)
      throw Error('product-recovery-claim-changed')
  }
  return {
    preflight() {
      check()
      if (io.exists(riskClaim)) throw Error('product-recovery-already-consumed')
    },
    claim() {
      check()
      io.write(riskClaim, body, { flag: 'wx', mode: 0o600, flush: true })
      claimed = true
    },
    guard() {
      if (!claimed) throw Error('product-recovery-not-claimed')
      check()
    },
    identity: { manifestHash, source: PRODUCT_RECOVERY, riskClaim },
  }
}
