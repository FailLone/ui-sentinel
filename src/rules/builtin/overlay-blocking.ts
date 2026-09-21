import type { Rule } from '../types.ts'

export const overlayBlockingRule: Rule = {
  id: 'overlay-blocking', revision: '2.0.0', name: 'Action hit testing',
  description: 'Reports sampled interception of visible actions; never infers blocking from rectangle overlap.',
  category: 'interaction', enabled: true,
  async evaluate({ snapshot }) {
    const targets = snapshot.elements.filter(e => e.visible && (e.tag === 'button' || e.tag === 'a') && e.enabled !== false)
    const sampled = targets.filter(e => e.hitSamples && e.hitSamples.length >= 5)
    const blocked = sampled.filter(e => e.hitSamples!.every(s => s.relation === 'unrelated'))
    const partial = sampled.filter(e => e.hitSamples!.some(s => s.relation === 'unrelated') && !blocked.includes(e))
    const verdict = blocked.length ? 'fail' : sampled.length < targets.length ? 'unknown' : targets.length ? 'pass' : 'not-applicable'
    return {
      ruleId: this.id, ruleRevision: this.revision, verdict,
      severity: blocked.length ? 'error' : 'info',
      title: blocked.length ? 'Visible action intercepted at all sampled points' : 'Action hit testing',
      expected: 'Visible enabled actions receive pointer input',
      actual: `${blocked.length} intercepted actions; ${partial.length} partially covered; ${targets.length - sampled.length} unmeasured`,
      evidenceRefs: snapshot.screenshotPath ? [snapshot.screenshotPath] : [], confidence: blocked.length ? 0.95 : 0.8,
      details: { blocked: blocked.length > 0, blockedTargets: blocked, partialTargets: partial, method: 'five-point-hit-test', originalViewport: snapshot.viewport },
    }
  },
}
