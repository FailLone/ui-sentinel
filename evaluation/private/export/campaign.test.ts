import { describe, it, expect } from 'vitest'
import { FORMAL_MATRIX, planCampaign } from './campaign.ts'

/**
 * The formal campaign's gating.
 *
 * These are the decisions the plan makes binding, and every one of them is a way a batch could be
 * reported as something it was not: running group B without an approved rule, summing two builds,
 * carrying a diagnostic from an older build, or quietly dropping the groups it could not run.
 */

const imported = {
  sourceDirectory: '/data/learning/2026-09-24T10-57-41-736Z',
  databaseHash: 'a'.repeat(64),
  proposalId: 'proposal-fc30e9bb',
  ruleRevision: '1',
  reviewedBy: 'human-delegated',
  ruleConfig: {},
  declarationHash: 'b'.repeat(64),
  declared: { id: 'proposal-fc30e9bb', revision: '1', enabled: true },
}
const diagnostic = { directory: '/data/business-validation/d1', passed: true, buildHash: 'build-1' }

function input(overrides: Partial<Parameters<typeof planCampaign>[0]> = {}) {
  return {
    diagnostic,
    approvedSource: { ok: true as const, imported },
    currentBuildHash: 'build-1',
    budgetRemainingUsd: 2,
    requestedGroups: ['A', 'B', 'C', 'D'] as const,
    ...overrides,
  }
}

it('plans all four groups on a complete, single-build campaign', () => {
  const plan = planCampaign(input())
  expect(plan.blocked).toEqual([])
  expect(plan.run.map((g) => g.group)).toEqual(['A', 'B', 'C', 'D'])
  expect(plan.run.map((g) => g.runs)).toEqual([15, 6, 18, 6])
  expect(plan.totalRuns).toBe(45)
  expect(plan.aAndCComplete).toBe(true)
  // A plan is not a pass: the matrix still has to be executed and scored.
  expect(plan.scorable).toBe(true)
  expect(plan.gate).toBe(false)
})

it('blocks B and D when the approved source is absent, and still runs A and C', () => {
  const plan = planCampaign(
    input({ approvedSource: { ok: false as const, reason: 'approval-source-missing' } }),
  )
  // The plan forbids faking approval, so the groups that need it are recorded blocked...
  expect(plan.blocked.map((b) => b.group).sort()).toEqual(['B', 'D'])
  expect(plan.blocked.every((b) => b.reason.includes('approval-source-missing'))).toBe(true)
  // ...the safe work still runs, so a missing source does not waste the campaign...
  expect(plan.run.map((g) => g.group)).toEqual(['A', 'C'])
  expect(plan.totalRuns).toBe(33)
  // ...and the batch is not a pass, which is what stops B/D being silently omitted.
  expect(plan.aAndCComplete).toBe(true)
  expect(plan.scorable).toBe(true)
  expect(plan.gate).toBe(false)
  expect(plan.exitNonZero).toBe(true)
})

it('blocks B and D when an enabled rule names no reviewer', () => {
  const plan = planCampaign(
    input({
      approvedSource: {
        ok: false as const,
        reason: 'approval-source-unapproved: the enabled rule names no reviewer',
      },
    }),
  )
  expect(plan.blocked.map((b) => b.group).sort()).toEqual(['B', 'D'])
  expect(plan.exitNonZero).toBe(true)
})

it('refuses a diagnostic from a different build, or one that did not pass', () => {
  const stale = planCampaign(input({ diagnostic: { ...diagnostic, buildHash: 'build-0' } }))
  expect(stale.diagnosticRefused).toBe(true)
  expect(stale.gate).toBe(false)
  // The plan requires the diagnostic to come from the current frozen build, so nothing runs: this is
  // not "some groups skipped", it is a formal campaign that has no valid precondition at all.
  expect(stale.run).toEqual([])
  expect(stale.exitNonZero).toBe(true)
  // A diagnostic that failed cannot authorise a formal batch either.
  const failed = planCampaign(input({ diagnostic: { ...diagnostic, passed: false } }))
  expect(failed.diagnosticRefused).toBe(true)
  expect(failed.run).toEqual([])
})

it('refuses to run without a diagnostic at all', () => {
  const plan = planCampaign(input({ diagnostic: undefined }))
  expect(plan.diagnosticRefused).toBe(true)
  expect(plan.run).toEqual([])
  expect(plan.aAndCComplete).toBe(false)
  expect(plan.exitNonZero).toBe(true)
})

it('refuses to run with no budget remaining, marking nothing run', () => {
  const plan = planCampaign(input({ budgetRemainingUsd: 0 }))
  expect(plan.reasonCodes).toContain('campaign-budget-exhausted')
  expect(plan.run).toEqual([])
  expect(plan.exitNonZero).toBe(true)
})

it('states the matrix it will run rather than leaving it to the caller', () => {
  // The fixed counts are the plan's, so a batch that ran a different number is detectable.
  expect(FORMAL_MATRIX.map((g) => [g.group, g.runs])).toEqual([
    ['A', 15],
    ['B', 6],
    ['C', 18],
    ['D', 6],
  ])
  expect(FORMAL_MATRIX.reduce((n, g) => n + g.runs, 0)).toBe(45)
  // A is E0-E4 three times each; B and D are three each over two profiles.
  const a = FORMAL_MATRIX.find((g) => g.group === 'A')!
  expect(a.cases).toEqual(['E0', 'E1', 'E2', 'E3', 'E4'])
  expect(a.repeats).toBe(3)
  expect(FORMAL_MATRIX.find((g) => g.group === 'B')!.cases).toEqual(['E1', 'E2'])
  expect(FORMAL_MATRIX.find((g) => g.group === 'D')!.cases).toEqual(['abnormal', 'healthy'])
})

it('runs a subset when the caller asks for one, without inventing the rest', () => {
  const plan = planCampaign(input({ requestedGroups: ['A'] as const }))
  expect(plan.run.map((g) => g.group)).toEqual(['A'])
  expect(plan.aAndCComplete).toBe(false)
  // A partial campaign is not a formal campaign, so it can never gate.
  expect(plan.gate).toBe(false)
  expect(plan.reasonCodes).toContain('campaign-incomplete')
})

it('records rule state per group, because A and C must run without an equivalent retry rule', () => {
  const plan = planCampaign(input())
  const byGroup = Object.fromEntries(plan.run.map((g) => [g.group, g.rules]))
  expect(byGroup.A).toBe('builtin-only')
  expect(byGroup.C).toBe('builtin-only')
  expect(byGroup.B).toBe('approved-imported')
  expect(byGroup.D).toBe('approved-imported')
  // The groups get separate databases: B must not inherit anything A discovered.
  expect(new Set(plan.run.map((g) => g.database)).size).toBe(4)
})
