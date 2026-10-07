import { randomUUID } from 'node:crypto'
import { interventionLimitation, type EvidenceIntegrity } from '../shared/evidence-integrity.ts'

export function createEvidenceIntegrity() {
  const interventions: { id: string; kind: string; url: string; method?: string; atMs: number }[] =
    []
  return {
    /** Called synchronously before the executor changes network/page behavior. */
    intervene(input: {
      /**
       * `network-denied` is the UI boundary's own refusal. It is an intervention for the same reason
       * a denied write is: the page ran without something it asked for, so what it renders afterwards
       * cannot establish a verdict about the unmodified site (plan 4.4).
       */
      kind: 'write-denied' | 'access-denied' | 'popup-denied' | 'network-denied'
      url: string
      method?: string
    }) {
      const event = { ...input, id: `intervention-${randomUUID()}`, atMs: Date.now() }
      interventions.push(event)
      return event
    },
    snapshot(): EvidenceIntegrity {
      return {
        version: 1,
        status: interventions.length ? 'intervened' : 'clean',
        interventionIds: interventions.map((i) => i.id),
      }
    },
    epoch: () => interventions.length,
    gaps: () => (interventions.length ? [interventionLimitation] : []),
  }
}
