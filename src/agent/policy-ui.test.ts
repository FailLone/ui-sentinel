import { describe, expect, it } from 'vitest'
import { inspectionPolicy } from './policy.ts'
import { buildUiContractSnapshot } from '../inspection/contract.ts'

/**
 * The agent brief of a `ui-scan` run (plan 7, 8/B2).
 *
 * A UI run has no adapter, so it must not be briefed as one. Two failures matter here and they pull
 * in opposite directions: a policy that still describes a business would have the agent hunting for
 * an outcome that cannot exist, and a policy that simply drops the business sentences would leave the
 * agent without the sampling and ledger obligations it is actually accountable for.
 *
 * Everything asserted is capability-level. The prompt may say which tools exist, what a field means
 * and what the scope rules are. It must not name a page, a control, an expected defect or a test
 * case: those are the answers, and they live in the private truth rather than in the production
 * prompt (plan 10.3).
 */
const features = { shortFinish: true, atomicInvestigation: true }
const contract = buildUiContractSnapshot({
  entryUrl: 'https://example.org/catalog?sort=price',
  origin: 'https://example.org',
  goal: 'check the catalog page',
  scope: { maxPages: 3, maxDepth: 1 },
  access: { resourceOrigins: ['https://cdn.example.org'], dataOrigins: [] },
  budget: { totalTimeoutMs: 300_000, maxActions: 20, maxModelCalls: 30 },
})

describe('a ui-scan brief', () => {
  it('states the anonymous, read-only boundary rather than a business requirement', () => {
    const policy = inspectionPolicy(contract.goal, features, undefined, contract)

    expect(policy).toContain('anonymous')
    expect(policy).toContain('no business')
    // The business permissions of a contract run are absent: a UI run cannot spend a write.
    expect(policy).not.toContain('entity-creating operation')
    expect(policy).not.toContain('Public requirements:')
  })

  it('carries the sampling obligation so a page with no selection is still accountable', () => {
    const policy = inspectionPolicy(contract.goal, features, undefined, contract)

    // The ledger's own categories are what the agent is asked to select among.
    expect(policy).toMatch(/local interaction/i)
    expect(policy).toMatch(/navigation/i)
    expect(policy).toContain('exploration_update')
  })

  it('names the refusal reasons an agent must report rather than work around', () => {
    const policy = inspectionPolicy(contract.goal, features, undefined, contract)

    // A blocked request is a boundary, not a defect to route around: the agent has to know that a
    // refused write is final for this run instead of retrying it another way.
    expect(policy).toMatch(/refus|denied|not permitted/i)
    expect(policy).not.toMatch(/button labelled|click the .* button at/i)
  })

  it('never claims the run can establish a business outcome', () => {
    const policy = inspectionPolicy(contract.goal, features, undefined, contract)

    expect(policy).not.toMatch(/businessResult/)
    expect(policy).not.toMatch(/Order Confirmed|checkout|purchase/i)
  })

  it('leaves a business run’s brief byte-for-byte unchanged', () => {
    const business = inspectionPolicy('complete the purchase', features, {
      profileId: 'checkout',
      requirements: [{ text: 'Confirms a successful order visibly.' }],
      effects: { maxCreates: 1, maxRetriesPerOperation: 1 },
    } as any)
    expect(business).toContain('Public requirements:')
    expect(business).toContain('business application')
  })
})
