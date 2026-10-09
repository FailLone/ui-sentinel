/** Explicit proposed continuation after the stopped product batch; never reuses its authorization. */
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { CONTINUATION } from '../r1-online-pilot/continuation.ts'
import type { CampaignSpending } from '../../evaluation/support/campaign-ledger.ts'
export const PRODUCT_RECOVERY = {
  version: 'r1-product-timeout-continuation-1',
  sourceManifestHash: 'f7fa8326db127c1821cc038e50f65e5c02bd68989cb36ba42fa95e05a3e6abc9',
  sourceCampaignId: '39f08e3e-6bd6-498f-b8a6-060f378127e1',
  sourceRow: 'C10-1',
  sourceStoppedReason: 'transport-error',
  sourceRequestId: '1e9f2f841ecebbaa0b06a09d',
  previousKnownActualUsd: 0.00502455,
  inheritedUnknownReservedUsd: 0.116,
  inheritedUnknownCount: 2,
  originalFailure: CONTINUATION,
  pins: [
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-98f7854/data/r1-product/authorized-recovery/account/campaign.db',
      sha256: '1f660d8b85d723b664efdca29db892ab90bbd4cc3627a5a9682bce0580a0f7b1',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-98f7854/data/r1-product/authorized-recovery/account/campaign-id.json',
      sha256: 'd605cd24e876c9e2ad3d63b9a7177efd4ecb3cf6323e62c534b159085adeeeb3',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-98f7854/data/r1-product/authorized-recovery/accounting.json',
      sha256: 'b1b45f128407d26640651a1f003161952fbb4395c3db898982a4055187f9bab8',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-98f7854/data/r1-product/authorized-recovery/stop.json',
      sha256: 'fba1642e7df38b15a2e37bfd09fd8b6d76fa2eea7c1786312449a1684302a1f9',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-98f7854/data/r1-product/authorized-recovery/manifest.json',
      sha256: '7dc1a0a2c0a41aed632c655a01116b44d5287bda7cbb399bbfb9a757dcd84783',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-jev-closeout-20261007/data/r1-product/runtime-98f7854/data/r1-product/authorized-recovery/results.json',
      sha256: 'b877d964998e3baec07a4a46d036c474bdbe1780eeff9d121479384a3ebef436',
    },
    {
      path: '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-online-claims/continued-product-41eb23e34527461bae8bc50e6d0b28ae53d94bb584d8d167b7eddecedbfcf510.claim',
      sha256: '867f4711a91001c74330d12e54067cd598bc2e03c0c7f865515968e080f31fd7',
    },
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
    acceptUnsettledRiskUsd: PRODUCT_RECOVERY.inheritedUnknownReservedUsd,
    maxCombinedAccountedUsd: amount(
      newBudgetUsd +
        PRODUCT_RECOVERY.previousKnownActualUsd +
        PRODUCT_RECOVERY.inheritedUnknownReservedUsd,
    ),
    allPriorBatchesRemainStopped: true,
    stopOnAnyNewUnknown: true,
  }
}
export function combinedProductSpending(current: CampaignSpending) {
  return {
    previous: PRODUCT_RECOVERY,
    current,
    combinedUnknownCount: current.unknownCount + PRODUCT_RECOVERY.inheritedUnknownCount,
    combinedKnownActualUsd: amount(current.knownCostUsd + 0.00502455),
    combinedUnknownReservedUsd: amount(
      current.unknownReservedUsd + PRODUCT_RECOVERY.inheritedUnknownReservedUsd,
    ),
    combinedAccountedUsd: amount(
      current.accountedUsd +
        PRODUCT_RECOVERY.previousKnownActualUsd +
        PRODUCT_RECOVERY.inheritedUnknownReservedUsd,
    ),
    combinedLimitUsd: amount(
      current.limitUsd +
        PRODUCT_RECOVERY.previousKnownActualUsd +
        PRODUCT_RECOVERY.inheritedUnknownReservedUsd,
    ),
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
    for (const db of [...CONTINUATION.pins, ...PRODUCT_RECOVERY.pins]
      .map((p) => p.path)
      .filter((p) => p.endsWith('/campaign.db')))
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
