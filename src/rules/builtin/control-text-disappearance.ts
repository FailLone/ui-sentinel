import type { Batch2Dom, screenshotInk } from '../../experiments/batch2-facts.ts'
import { cleanEvidenceIntegrity, type EvidenceIntegrity } from '../../shared/evidence-integrity.ts'
import type { Rule, RuleVerdict } from '../types.ts'

export interface ControlTextReceipt {
  runId: string
  observedAt: string
  expiresAt: string
  dom: Batch2Dom
  stable: boolean
  issues: string[]
  pixels: Awaited<ReturnType<typeof screenshotInk>>
  evidenceRefs: string[]
  screenshotRef: string
  evidenceIntegrity: EvidenceIntegrity
}

/** Facts are supplied by the opt-in host, never inferred from a semantic contract or model. */
export function createControlTextDisappearanceRule(input?: ControlTextReceipt): Rule {
  const receipt = input ? structuredClone(input) : undefined
  return {
    id: 'control-text-disappearance',
    revision: '0.1.0',
    enabled: false,
    name: 'Native control text disappearance',
    category: 'visual',
    description:
      'Checks the sole native text name on a stable, enabled button/link in a supported flat paint stack. No WCAG or general readability claim.',
    routing: { version: '1', execution: 'automatic', eventTypes: [], cache: 'never' },
    async evaluate(context) {
      const problems: string[] = []
      if (!receipt) problems.push('missing-experimental-text-facts')
      else {
        problems.push(...receipt.issues)
        if (!receipt.stable) problems.push('observation-changed')
        if (
          !cleanEvidenceIntegrity(receipt.evidenceIntegrity) ||
          !cleanEvidenceIntegrity(context.snapshot.evidenceIntegrity)
        )
          problems.push('evidence-intervened-or-missing')
        if (
          context.runId !== receipt.runId ||
          context.snapshot.url !== receipt.dom.url ||
          JSON.stringify(context.snapshot.viewport) !== JSON.stringify(receipt.dom.viewport) ||
          context.snapshot.screenshotPath !== receipt.screenshotRef
        )
          problems.push('receipt-context-mismatch')
        const at = Date.parse(context.timestamp)
        if (
          !Number.isFinite(at) ||
          at < Date.parse(receipt.observedAt) ||
          at >= Date.parse(receipt.expiresAt)
        )
          problems.push('evidence-expired-or-invalid-time')
      }
      const rows = (receipt?.dom.controls ?? []).map((fact, i) => {
        const pixel = receipt!.pixels[i]
        const row = (verdict: RuleVerdict, reason: string) => ({
          selector: fact.selector,
          verdict,
          reason,
          fact,
          pixel,
        })
        if (problems.length) return row('unknown', problems.join('; '))
        if (fact.matchCount !== 1 || !fact.nodeId)
          return row('unknown', 'missing-or-ambiguous-target')
        if (fact.excluded) return row('not-applicable', fact.excluded)
        if (fact.issues.length) return row('unknown', fact.issues.join('; '))
        if (
          !pixel ||
          pixel.selector !== fact.selector ||
          !pixel.samples ||
          !fact.composed ||
          !fact.background ||
          !fact.roleBasis
        )
          return row('unknown', 'paint-proof-incomplete')
        const same = fact.composed.every((v, k) => Math.abs(v - fact.background![k]!) < 1e-6)
        if (same && pixel.backgroundPixels === pixel.samples)
          return row('fail', 'sole-native-text-name-has-no-distinguishable-paint')
        // A deliberately small healthy witness. Intermediate colors are not a readability pass.
        const blackWhite =
          (fact.composed.every((v) => v === 0) && fact.background.every((v) => v === 255)) ||
          (fact.composed.every((v) => v === 255) && fact.background.every((v) => v === 0))
        if (blackWhite && pixel.foregroundPixels > 0 && pixel.backgroundPixels > 0)
          return row('pass', 'opaque-black-white-text-ink-observed')
        return row(
          'unknown',
          same
            ? 'screenshot-disagrees-with-flat-paint-model'
            : 'outside-exact-disappearance-or-black-white-witness',
        )
      })
      const verdict: RuleVerdict = problems.length
        ? 'unknown'
        : rows.some((r) => r.verdict === 'fail')
          ? 'fail'
          : !rows.length || rows.some((r) => r.verdict === 'unknown')
            ? 'unknown'
            : rows.some((r) => r.verdict === 'pass')
              ? 'pass'
              : 'not-applicable'
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict,
        severity: verdict === 'fail' ? 'warning' : 'info',
        title: 'Native action text paint',
        expected:
          'The sole native action text name has distinguishable paint in the supported presentation',
        actual: problems.length
          ? problems.join('; ')
          : rows.map((r) => `${r.selector}: ${r.verdict} (${r.reason})`).join('; ') ||
            'No measured native control',
        evidenceRefs: receipt?.evidenceRefs ?? [],
        confidence: verdict === 'unknown' ? 0 : 0.95,
        details: {
          knowledgeId: 'UIK-D005',
          rows,
          problems,
          scope:
            'Sole native button/link text name, not task importance, accessibility compliance, charts or overall readability; no manual semantic confirmation required.',
          total: receipt?.dom.totalControls,
          omitted: receipt?.dom.omittedControls,
        },
      }
    },
  }
}
export const controlTextDisappearanceRule = createControlTextDisappearanceRule()
