import type { Rule } from '../types.ts'

/** Endpoints are browser-dispatched action and observed feedback, never model wall time. */
export const responseTimeRule: Rule = {
  id: 'response-time', revision: '2.0.0', name: 'Response Time Budget',
  description: 'Warn when measured UI response is unambiguously above the configured 10 second requirement.',
  category: 'performance', enabled: true,
  async evaluate({events}) {
    const threshold=10_000
    const measurements=events.filter(e=>e.type==='response:observed').map(e=>e.payload)
      .filter(p=>typeof p.durationMs==='number'&&Number.isFinite(p.durationMs)&&p.durationMs>=0&&typeof p.uncertaintyMs==='number'&&Number.isFinite(p.uncertaintyMs)&&p.uncertaintyMs>=0)
    const slow=measurements.filter(m=>Number(m.durationMs)-Number(m.uncertaintyMs)>threshold)
    const uncertain=measurements.filter(m=>Number(m.durationMs)-Number(m.uncertaintyMs)<=threshold&&Number(m.durationMs)+Number(m.uncertaintyMs)>=threshold)
    const verdict=slow.length?'fail':uncertain.length?'unknown':measurements.length?'pass':'not-applicable'
    return {
      ruleId:this.id,ruleRevision:this.revision,verdict,severity:slow.length?'warning':'info',
      title:slow.length?'UI response exceeded 10 seconds':'UI response timing',
      expected:'Feedback visible within 10000 ms of browser action dispatch',
      actual:`${measurements.length} measured responses, ${slow.length} slow, ${uncertain.length} boundary-uncertain`,
      evidenceRefs:measurements.flatMap(m=>Array.isArray(m.evidenceRefs)?m.evidenceRefs.filter((r):r is string=>typeof r==='string'):[]),
      confidence:uncertain.length?0:0.95,details:{thresholdMs:threshold,measurements,slow,uncertain},
    }
  },
}
