import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { freezeSchema } from './config.ts'
import { evaluateEvidence } from './score.ts'
import { compileInput } from '../../src/agent/decisions/jev-provider/compile.ts'
import { parseStrictJson } from '../../src/agent/decisions/jev-provider/strict-json.ts'
import { normalizeResponse } from '../../src/agent/decisions/jev-provider/response.ts'
import { rankCandidates } from '../../src/agent/decisions/exploration/ranking.ts'
import { loadDataset } from './dataset.ts'
import { safeFile } from './evidence.ts'
/** Free threshold replay. Never accept holdout data, never modify the frozen evidence. */
export function calibrateEvidence(root: string, evidence: string, labelsPath: string) {
  const freeze = freezeSchema.parse(JSON.parse(readFileSync(join(evidence, 'freeze.json'), 'utf8')))
  if (freeze.config.phase !== 'development') throw new Error('calibration-development-only')
  const report = evaluateEvidence(root, evidence, labelsPath)
  if (!report.complete) throw new Error('calibration-requires-complete-evidence')
  const dataset = loadDataset(root, freeze.config)
  const table = [0, 0.25, 0.5, 0.75, 0.9, 0.95].map((threshold) => {
    let hits = 0
    let falseHandoff = 0
    let correctHandoff = 0
    for (const c of dataset.cases) {
      const label = report.perState.find((x) => x.id === c.id)!
      const response = JSON.parse(
        readFileSync(safeFile(evidence, `attempts/${c.id}-0-response.json`), 'utf8'),
      )
      const profile = { ...freeze.config.profile, readinessConfidence: threshold }
      const receipt = normalizeResponse(
        parseStrictJson(response.responseText),
        compileInput(c.input, profile).compiled,
        profile,
      )
      if (label.expected === 'scoreable') {
        if (receipt.kind === 'handoff') falseHandoff++
        else if (
          label.acceptableTop.includes(
            rankCandidates(c.input, { scores: receipt.scores }).orderedCandidateIds[0],
          )
        )
          hits++
      } else if (receipt.kind === 'handoff') correctHandoff++
    }
    const n = report.denominators
    return {
      threshold,
      topHit: hits / n.rankingStates,
      falseHandoff: falseHandoff / n.rankingStates,
      handoffRecall: correctHandoff / n.handoffStates,
    }
  })
  const feasible = table.filter(
    (x) => x.handoffRecall >= 0.9 && x.falseHandoff <= 0.15 && x.topHit >= 0.8,
  )
  feasible.sort(
    (a, b) => b.topHit - a.topHit || b.handoffRecall - a.handoffRecall || a.threshold - b.threshold,
  )
  return {
    version: 'r1-jev-calibration-1',
    sourceSha: freeze.sourceSha,
    labelsSha256: report.labelsSha256,
    labelsStatus: report.labelsStatus,
    table,
    recommendedThreshold: feasible[0]?.threshold ?? null,
    decision: feasible.length ? 'freeze-proposal-only' : 'no-feasible-threshold',
    networkRequests: 0,
    warning:
      'Development replay only; this does not update configuration or establish holdout quality.',
  }
}
