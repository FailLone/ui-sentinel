import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { UiScanReportSection } from './ui-scan-report.tsx'
import type { UiScanReport } from '../server/reports/ui-scan-report.ts'

/**
 * U20: what the workbench shows for a `ui-scan` run (plan 3.2 steps 6-7).
 *
 * The display is where a claim becomes a promise to a person, so these tests assert the phrasing that
 * keeps it honest: an empty result reads as "nothing found within the verified scope" rather than
 * "the site passed", a partial run shows each unverified item with its reason, and the business
 * dimension is stated as inapplicable rather than left blank.
 */
const base: UiScanReport = {
  kind: 'ui-scan',
  businessResult: 'not-applicable',
  contract: {
    hash: 'abc123',
    integrity: 'verified',
    requestedUrl: 'http://127.0.0.1:5055/catalog?x=1#panel',
    entryUrl: 'http://127.0.0.1:5055/catalog?x=1#panel',
    origin: 'http://127.0.0.1:5055',
    goal: '检查目录',
    goalSource: 'user',
    session: 'anonymous',
    scope: { maxPages: 3, maxDepth: 1 },
    access: { resourceOrigins: [], dataOrigins: [] },
    businessWrites: 'none',
    availableCapabilities: ['entry-observation', 'automatic-rules'],
    unsupportedCapabilities: ['business-write', 'websocket'],
    schemaVersion: '1',
    policyRevision: 'url-scan-1',
  },
  inspection: {
    coverage: 'partial',
    counts: {
      total: 2,
      selected: 2,
      pending: 0,
      verified: 1,
      failed: 0,
      unverified: 1,
      excluded: 0,
    },
    items: [
      {
        itemId: 'item-1',
        category: 'entry-observation',
        url: 'http://127.0.0.1:5055/catalog?x=1#panel',
        status: 'verified',
        selected: true,
        basis: 'entry document',
        targetSource: 'executor',
        reasonCode: null,
        detail: 'entry observed',
        evidenceRefs: ['artifact-1'],
        ruleRevision: null,
        parentNavigation: null,
      },
      {
        itemId: 'item-2',
        category: 'local-interaction',
        url: 'http://127.0.0.1:5055/catalog?x=1#panel',
        status: 'unverified',
        selected: true,
        basis: 'filter control',
        targetSource: 'agent',
        reasonCode: 'target-lost',
        detail: 'the control was replaced before it was acted on',
        evidenceRefs: [],
        ruleRevision: null,
        parentNavigation: null,
      },
    ],
    gaps: [
      {
        itemId: 'item-2',
        category: 'local-interaction',
        status: 'unverified',
        reason: 'local-interaction still unverified',
        reasonCode: 'target-lost',
      },
    ],
    candidates: {
      categories: ['local-interaction'],
      detail: '3 candidate controls observed',
      truncated: 0,
      observedAt: '2026-10-07T00:00:00.000Z',
    },
    unsupported: [{ dimension: 'websocket', reasonCode: 'unsupported-capability' }],
  },
  proof: null,
  proofVerified: false,
  finishReasonCode: 'unverified-scope',
  interventions: [],
}

const render = (report: UiScanReport) =>
  renderToStaticMarkup(UiScanReportSection({ report, runId: 'run-1' }))

describe('U20: the workbench shows the scan contract, its scope and its gaps', () => {
  it('states the business dimension as inapplicable rather than leaving it blank', () => {
    const html = render(base)
    expect(html).toContain('业务不适用')
    // The boundary the run actually operated under is on screen, not only in the JSON report.
    expect(html).toContain('匿名')
    expect(html).toContain('不提交业务操作')
  })

  it('shows the executed address with its query and fragment, and never the bare origin', () => {
    const html = render(base)
    expect(html).toContain('/catalog?x=1#panel')
  })

  it('lists every unverified item with its reason instead of hiding it in a count', () => {
    const html = render(base)
    expect(html).toContain('target-lost')
    expect(html).toContain('the control was replaced before it was acted on')
    expect(html).toContain('local-interaction')
  })

  it('names the unsupported dimensions the run declared it could not check', () => {
    const html = render(base)
    expect(html).toContain('websocket')
    expect(html).toContain('business-write')
  })

  it('shows the candidate summary the scope was sampled from, including truncation', () => {
    const html = render(base)
    expect(html).toContain('3 candidate controls observed')
  })

  it('reports the coverage verdict as partial, not as a pass', () => {
    const html = render(base)
    expect(html).toContain('部分')
    expect(html).not.toContain('在已验证范围内未发现问题')
  })
})

describe('U09: a covered run with no findings says so within its scope, not for the site', () => {
  const covered: UiScanReport = {
    ...base,
    inspection: {
      ...base.inspection,
      coverage: 'covered',
      counts: {
        total: 2,
        selected: 2,
        pending: 0,
        verified: 2,
        failed: 0,
        unverified: 0,
        excluded: 0,
      },
      items: base.inspection.items.map((item) => ({
        ...item,
        status: 'verified',
        reasonCode: null,
      })),
      gaps: [],
    },
    proof: {
      version: 'inspection-proof-1',
      kind: 'ui-scan',
      claim: 'scope-covered',
      outcome: 'goal-reached',
      contractHash: 'abc123',
      scopeDigest: 'digest',
      items: [],
      counts: { total: 2, verified: 2, failed: 0, unverified: 0, excluded: 0 },
      unsupported: [],
      decidedAt: '2026-10-07T00:00:00.000Z',
      hash: 'proofhash',
    },
    proofVerified: true,
    finishReasonCode: 'scope-covered',
    interventions: [],
  }

  it('uses scoped wording for an empty result', () => {
    const html = render(covered)
    expect(html).toContain('在已验证范围内未发现问题')
  })

  it('shows the verified proof hash so the claim can be traced to the ledger', () => {
    const html = render(covered)
    expect(html).toContain('proofhash')
  })

  it('warns that the coverage verdict is not a site-wide guarantee', () => {
    const html = render(covered)
    expect(html).toMatch(/不代表|并不代表|不等于/)
  })
})

describe('U08/U16: an intervention or an unverified proof is shown as a limitation', () => {
  it('surfaces a network refusal as a scope limitation', () => {
    const html = render({
      ...base,
      interventions: [
        {
          eventId: 'event-9',
          seq: 9,
          kind: 'network-denied',
          reasonCode: 'outside-entry-origin',
          detail: 'blocked a cross-origin request',
        },
      ],
    })
    expect(html).toContain('network-denied')
    expect(html).toContain('outside-entry-origin')
  })

  it('refuses to show a covered verdict when the proof does not verify', () => {
    const html = render({
      ...base,
      inspection: { ...base.inspection, coverage: 'covered' },
      proofVerified: false,
      interventions: [],
    })
    // The header must not read "covered" while the proof behind it is unverified.
    expect(html).not.toContain('在已验证范围内未发现问题')
  })
})
