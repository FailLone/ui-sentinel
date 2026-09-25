import { describe, it, expect } from 'vitest'
import {
  finishNote,
  finishOutcomeDescription,
  journeyRunDescription,
  missingOutcomeFacts,
  pageActDescription,
} from './tool-guidance.ts'
import { checkoutProfile, exportProfile } from '../business/profiles/index.ts'
import { buildContractSnapshot } from '../business/registry.ts'

/**
 * The tool guidance the agent reads must describe the business it is actually inspecting.
 *
 * These strings were written for shopping and stayed generic. The page_act description told *every*
 * run "This shopping inspection permits only one order and blocks further network writes after it"
 * and suggested `name="Add to Cart"` - both false for export, which permits one retry and has no
 * cart. A finish note called a processing failure "not an explicit rejected/declined outcome", and
 * journey_run warned against using a journey "to purchase/pay".
 *
 * The fix is the same shape as the inspection policy: the business-specific parts come from the
 * run's own contract, so a new profile needs no edit here and no code branches on a business name.
 */
const features = { shortFinish: true, atomicInvestigation: true }
const checkout = buildContractSnapshot(checkoutProfile, 'arena')
const datasetExport = buildContractSnapshot(exportProfile, 'export-arena')

describe('tool guidance follows the run contract', () => {
  it('states the inspected contract limit and keeps shopping wording out of an export run', () => {
    const description = pageActDescription(datasetExport, features)
    // The limit is the contract's own number, not a shopping constant stated for everyone.
    expect(description).toContain(String(datasetExport.effects.maxCreates))
    expect(description).toContain(String(datasetExport.effects.maxRetriesPerOperation))
    expect(description).not.toMatch(/shopping/i)
    expect(description).not.toMatch(/Add to Cart/i)
    expect(description).not.toMatch(/only one order/i)
    expect(description).not.toMatch(/after an order result/i)
    // And the mechanism it does describe survives.
    expect(description).toContain('role+name from the a11y tree')
    expect(description).toContain('Never repeat an uncertain write')
  })

  it('states the checkout limit for a checkout run', () => {
    const description = pageActDescription(checkout, features)
    expect(description).toContain(String(checkout.effects.maxCreates))
    // The example must be a control this business could actually have, not a hardcoded cart button.
    expect(description).not.toMatch(/Add to Cart/i)
  })

  it('does not claim a business name when the run has no contract', () => {
    const description = pageActDescription(undefined, features)
    expect(description).not.toMatch(/shopping/i)
    expect(description).not.toMatch(/Add to Cart/i)
    // Without a contract nothing may be claimed about operation limits.
    expect(description).not.toMatch(/only one order/i)
    expect(description).toMatch(/role\+name from the a11y tree/)
  })

  it('describes the finish outcome in business-neutral terms', () => {
    // "confirmed paid order" is a shopping claim; a business-neutral description is true for both.
    expect(finishOutcomeDescription()).not.toMatch(/paid order/i)
    expect(finishOutcomeDescription()).not.toMatch(/rejected\/declined/i)
    expect(finishOutcomeDescription()).toMatch(/success/)
    expect(finishOutcomeDescription()).toMatch(/rejected/)
    expect(finishOutcomeDescription()).toMatch(/unknown/)
  })

  it('describes a processing failure without shopping vocabulary', () => {
    const note = finishNote()
    expect(note).not.toMatch(/rejected\/declined/i)
    // The distinction it exists to teach must survive: a processing failure is unknown, not rejected.
    expect(note).toMatch(/processing failure/i)
    expect(note).toMatch(/unknown/i)
  })

  it('names the missing fact by the contract, not by one business entity', () => {
    // The same fact for every business, so it can name neither one's entity.
    expect(missingOutcomeFacts().join(' ')).not.toMatch(/the order/i)
    expect(missingOutcomeFacts().join(' ')).toMatch(/business/i)
  })

  it('warns against replaying a write without naming one business action', () => {
    const description = journeyRunDescription()
    expect(description).not.toMatch(/purchase\/pay/i)
    expect(description).toMatch(/read-only/i)
    expect(description).toMatch(/replay uncertain actions/i)
  })
})
