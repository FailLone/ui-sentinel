import type { LayoutFacts, LayoutPixels } from '../../execution/layout-facts.ts'
import { cleanEvidenceIntegrity, type EvidenceIntegrity } from '../../shared/evidence-integrity.ts'
import type { Rule, RuleVerdict } from '../types.ts'

export interface LayoutReceipt {
  runId: string
  observedAt: string
  expiresAt: string
  screenshotRef: string
  facts: LayoutFacts
  pixels: LayoutPixels[]
  stable: boolean
  issues: string[]
  evidenceRefs: string[]
  evidenceIntegrity: EvidenceIntegrity
}
export interface LayoutRow {
  selector: string
  text: string
  verdict: RuleVerdict
  reason: string
  basis: string
  relatedSelectors: string[]
  relatedRuleIds: string[]
  pixels?: LayoutPixels
}
export const layoutRuleIds = ['control-text-clipping', 'control-text-overlap'] as const

/** Separate clipping and visual coexistence claims, both supplied by the ordinary observation. */
export function createControlLayoutRule(kind: 'clipping' | 'overlap', input: LayoutReceipt): Rule {
  const receipt = structuredClone(input)
  const clipping = kind === 'clipping',
    ruleId = clipping ? layoutRuleIds[0] : layoutRuleIds[1]
  return {
    id: ruleId,
    revision: '0.1.0',
    enabled: false,
    category: 'visual',
    name: clipping ? 'Sole native label glyph clipping' : 'Coexisting action label paint overlap',
    description:
      'Bounded native text paint proof from public role/structure and the same observation; not a general layout judgement.',
    routing: { version: '1', execution: 'automatic', eventTypes: [], cache: 'never' },
    async evaluate(context) {
      const problems = [...receipt.issues]
      if (!receipt.stable) problems.push('observation-changed')
      if (
        !cleanEvidenceIntegrity(receipt.evidenceIntegrity) ||
        !cleanEvidenceIntegrity(context.snapshot.evidenceIntegrity)
      )
        problems.push('evidence-intervened-or-missing')
      if (
        context.runId !== receipt.runId ||
        context.snapshot.screenshotPath !== receipt.screenshotRef ||
        context.snapshot.url !== receipt.facts.url ||
        JSON.stringify(context.snapshot.viewport) !== JSON.stringify(receipt.facts.viewport)
      )
        problems.push('receipt-context-mismatch')
      if (
        !Number.isFinite(Date.parse(context.timestamp)) ||
        Date.parse(context.timestamp) < Date.parse(receipt.observedAt) ||
        Date.parse(context.timestamp) >= Date.parse(receipt.expiresAt)
      )
        problems.push('evidence-expired')
      const rows: LayoutRow[] = receipt.facts.rows.map((target) => {
        const pixel = receipt.pixels.find((p) => p.selector === target.selector)
        const row = (verdict: RuleVerdict, reason: string): LayoutRow => ({
          selector: target.selector,
          text: target.text,
          verdict,
          reason,
          basis: clipping
            ? 'sole-visible-native-action-text; local presentation only'
            : (target.groupBasis ?? 'coexistence-not-established'),
          relatedSelectors: target.overlaps.map((o) => o.selector),
          relatedRuleIds: [],
          pixels: pixel,
        })
        if (problems.length) return row('unknown', problems.join('; '))
        if (target.excluded) return row('not-applicable', target.excluded)
        if (receipt.facts.issues.length || target.issues.length)
          return row('unknown', [...receipt.facts.issues, ...target.issues].join('; '))
        if (!clipping && !target.groupId) return row('unknown', 'coexistence-not-established')
        if (!pixel || pixel.error || pixel.ink < 4)
          return row('unknown', pixel?.error ?? 'glyph-proof-incomplete')
        if (clipping) {
          if (target.overlaps.length)
            return row('unknown', 'intersecting-paint-needs-overlap-review')
          if (pixel.mismatch) return row('unknown', 'screenshot-disagrees-with-clipped-glyph-model')
          if (!pixel.clippedInk && pixel.visibleInk === pixel.ink)
            return row('pass', 'complete-native-label-ink-observed')
          if (receipt.facts.recoveryIssues.length)
            return row('unknown', receipt.facts.recoveryIssues.join('; '))
          // Only a vertical slice through glyph ink, never an intentional horizontal abbreviation.
          if (
            pixel.clippedInk >= 4 &&
            pixel.visibleInk >= 4 &&
            target.clipping.some((c) => c.overflowY === 'clip')
          )
            return row('fail', 'native-label-glyphs-cut-by-nonscrollable-vertical-clip')
          return row('unknown', 'clipping-purpose-or-visible-witness-insufficient')
        }
        if (pixel.clippedInk) return row('unknown', 'clipping-must-be-resolved-separately')
        const siblings = receipt.facts.rows.filter(
          (t) =>
            t.nodeId !== target.nodeId &&
            t.groupId === target.groupId &&
            !t.excluded &&
            !t.issues.length &&
            t.text !== target.text,
        )
        if (!siblings.length) return row('unknown', 'coexisting-action-not-measured')
        const invalid = target.overlaps.some(
          (o) => !o.laterSibling || !siblings.some((t) => t.nodeId === o.nodeId),
        )
        if (invalid) return row('unknown', 'overlap-intent-or-paint-order-unconfirmed')
        if (pixel.overlapMismatch)
          return row('unknown', 'screenshot-disagrees-with-sibling-paint-model')
        if (!pixel.coveredInk && pixel.visibleInk === pixel.ink)
          return row('pass', 'coexisting-action-label-ink-observed')
        if (receipt.facts.recoveryIssues.length)
          return row('unknown', receipt.facts.recoveryIssues.join('; '))
        const visibleSibling = siblings.some(
          (t) =>
            target.overlaps.some((o) => o.nodeId === t.nodeId) &&
            receipt.pixels.some(
              (p) =>
                p.selector === t.selector &&
                p.ink >= 4 &&
                p.visibleInk === p.ink &&
                !p.mismatch &&
                !p.error,
            ),
        )
        if (pixel.coveredInk >= 4 && pixel.visibleInk >= 4 && visibleSibling)
          return row('fail', 'coexisting-sibling-background-erases-action-label-ink')
        return row('unknown', 'coexistence-or-occlusion-witness-insufficient')
      })
      const verdict: RuleVerdict = problems.length
        ? 'unknown'
        : rows.some((r) => r.verdict === 'fail')
          ? 'fail'
          : receipt.facts.omitted ||
              !receipt.facts.enumerationComplete ||
              rows.some((r) => r.verdict === 'unknown') ||
              !rows.length
            ? 'unknown'
            : rows.some((r) => r.verdict === 'pass')
              ? 'pass'
              : 'not-applicable'
      return {
        ruleId,
        ruleRevision: this.revision,
        verdict,
        severity: verdict === 'fail' ? 'warning' : 'info',
        title: clipping ? '原生操作文字被垂直裁切' : '共同操作组中文字被兄弟控件遮盖',
        expected: clipping
          ? 'The sole local native action label retains its glyph ink; alternative or abbreviation intent must be established separately'
          : 'Independently enabled members of the public action group retain distinguishable label ink',
        actual: problems.length
          ? problems.join('; ')
          : rows.map((r) => `${r.selector}: ${r.verdict} (${r.reason})`).join('; ') ||
            'No native label measured',
        evidenceRefs: receipt.evidenceRefs,
        confidence: verdict === 'unknown' ? 0 : 0.95,
        details: {
          knowledgeId: clipping ? 'UIK-D001' : 'UIK-D002',
          rows,
          problems,
          totalObserved: receipt.facts.totalObserved,
          omitted: receipt.facts.omitted,
          enumerationComplete: receipt.facts.enumerationComplete,
          scope: clipping
            ? 'Vertical glyph clipping of a sole native text name; no claim that all text must be complete or that no recovery exists elsewhere'
            : 'Public nav/fieldset/toolbar sibling label paint; not pointer interception, all-rectangles-must-not-overlap, or general coexistence inference',
        },
        ...(verdict === 'unknown' && !problems.length
          ? { unchecked: { reasonCode: 'control-layout-supported-scope-limit' } }
          : {}),
      }
    },
  }
}
