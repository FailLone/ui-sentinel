import type { Rule, RuleContext, RuleResult } from '../types.ts'

export const overlayBlockingRule: Rule = {
  id: 'overlay-blocking',
  revision: '1.0.0',
  name: 'Overlay Blocking Detection',
  description: 'Detects when an overlay or modal is blocking primary action buttons',
  category: 'accessibility',
  enabled: true,

  async evaluate(context: RuleContext): Promise<RuleResult> {
    const { snapshot } = context

    const overlays = snapshot.elements.filter((el) => {
      const isOverlay =
        el.tag === 'div' &&
        el.visible &&
        el.bounds.width > snapshot.viewport.width * 0.5 &&
        el.bounds.height > snapshot.viewport.height * 0.5

      const hasOverlayAttr =
        el.attributes['data-testid']?.includes('overlay') ||
        el.attributes['role'] === 'dialog' ||
        el.attributes['class']?.includes('overlay') ||
        el.attributes['class']?.includes('modal')

      return isOverlay || hasOverlayAttr
    })

    if (overlays.length === 0) {
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'pass',
        severity: 'info',
        title: 'No blocking overlays detected',
        expected: 'No overlay blocking primary actions',
        actual: 'No overlays found',
        evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
        confidence: 0.8,
        details: { overlayCount: 0 },
      }
    }

    const primaryButtons = snapshot.elements.filter((el) =>
      (el.tag === 'button' || el.tag === 'a') &&
      el.visible &&
      (el.text.toLowerCase().includes('pay') ||
        el.text.toLowerCase().includes('submit') ||
        el.text.toLowerCase().includes('checkout') ||
        el.text.toLowerCase().includes('purchase') ||
        el.text.toLowerCase().includes('complete') ||
        el.attributes['data-testid']?.includes('pay')),
    )

    const blocked = primaryButtons.some((btn) =>
      overlays.some((ov) => rectanglesOverlap(btn.bounds, ov.bounds)),
    )

    const hasCloseButton = snapshot.elements.some((el) =>
      (el.tag === 'button') &&
      el.visible &&
      (el.text.toLowerCase().includes('close') ||
        el.text.toLowerCase().includes('dismiss') ||
        el.text.toLowerCase() === 'x' ||
        el.attributes['data-testid']?.includes('close') ||
        el.attributes['aria-label']?.toLowerCase().includes('close')),
    )

    if (!blocked) {
      return {
        ruleId: this.id,
        ruleRevision: this.revision,
        verdict: 'pass',
        severity: 'info',
        title: 'Overlays present but not blocking primary actions',
        expected: 'No overlay blocking primary actions',
        actual: `${overlays.length} overlay(s) found, not blocking primary buttons`,
        evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
        confidence: 0.7,
        details: { overlayCount: overlays.length, blocked: false },
      }
    }

    return {
      ruleId: this.id,
      ruleRevision: this.revision,
      verdict: 'fail',
      severity: 'error',
      title: 'Overlay blocking primary action',
      expected: 'Primary action button should be accessible',
      actual: `Overlay is covering primary action button(s). Close button ${hasCloseButton ? 'available' : 'not found'}.`,
      evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [],
      confidence: 0.85,
      details: {
        overlayCount: overlays.length,
        blockedButtons: primaryButtons.map((b) => b.text),
        hasCloseButton,
        overlayBounds: overlays.map((o) => o.bounds),
      },
    }
  },
}

function rectanglesOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}
