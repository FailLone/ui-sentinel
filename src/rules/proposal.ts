import { randomUUID } from 'node:crypto'
import { getDbClient } from '../storage/database.ts'
import type { RuleProposal, RuleProposalStatus, RuleTestResult } from '../shared/types.ts'

import { compileTransitionRule, evaluateTransition, validateRuleConfig, type TransitionRuleConfig, type TransitionObservation } from './transition.ts'
import { registerRule } from './engine.ts'
export type { TransitionRuleConfig } from './transition.ts'

export async function createProposal(
  findingId: string,
  ruleConfig: TransitionRuleConfig,
): Promise<RuleProposal> {
  const db = getDbClient()
  const id = `proposal-${randomUUID()}`
  const now = new Date().toISOString()

  validateRuleConfig(ruleConfig)
  const finding = await db.execute({sql: 'SELECT id FROM findings WHERE id=?',args:[findingId]})
  const feedback = await db.execute({sql:'SELECT verdict FROM finding_feedback WHERE finding_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1',args:[findingId]})
  if (!finding.rows.length || feedback.rows[0]?.verdict !== 'confirmed') throw new Error('A human-confirmed finding is required')

  const proposal: RuleProposal = {
    id,
    findingId,
    ruleConfig: { ...ruleConfig },
    status: 'draft',
    positiveResults: [],
    negativeResults: [],
    reviewedBy: null,
    createdAt: now,
    updatedAt: now,
  }

  await db.execute({
    sql: `INSERT INTO rule_proposals (id, finding_id, rule_config, status, positive_results, negative_results, reviewed_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      proposal.id,
      proposal.findingId,
      JSON.stringify(proposal.ruleConfig),
      proposal.status,
      JSON.stringify(proposal.positiveResults),
      JSON.stringify(proposal.negativeResults),
      proposal.reviewedBy,
      proposal.createdAt,
      proposal.updatedAt,
    ],
  })

  return proposal
}

export async function getProposal(id: string): Promise<RuleProposal | null> {
  const db = getDbClient()
  const result = await db.execute({
    sql: 'SELECT * FROM rule_proposals WHERE id = ?',
    args: [id],
  })
  if (result.rows.length === 0) return null
  return rowToProposal(result.rows[0])
}

export async function updateProposalStatus(
  id: string,
  status: RuleProposalStatus,
  extra?: {
    positiveResults?: RuleTestResult[]
    negativeResults?: RuleTestResult[]
    reviewedBy?: string
  },
): Promise<RuleProposal | null> {
  const db = getDbClient()
  const now = new Date().toISOString()

  const sets = ['status = ?', 'updated_at = ?']
  const args: unknown[] = [status, now]

  if (extra?.positiveResults) {
    sets.push('positive_results = ?')
    args.push(JSON.stringify(extra.positiveResults))
  }
  if (extra?.negativeResults) {
    sets.push('negative_results = ?')
    args.push(JSON.stringify(extra.negativeResults))
  }
  if (extra?.reviewedBy) {
    sets.push('reviewed_by = ?')
    args.push(extra.reviewedBy)
  }

  args.push(id)

  await db.execute({
    sql: `UPDATE rule_proposals SET ${sets.join(', ')} WHERE id = ?`,
    args: args as import('@libsql/client').InValue[],
  })

  return getProposal(id)
}

export async function validateProposal(
  id: string,
  positiveInputs: readonly string[],
  negativeInputs: readonly string[],
): Promise<{ positiveResults: RuleTestResult[]; negativeResults: RuleTestResult[] }> {
  const proposal = await getProposal(id)
  if (!proposal) throw new Error(`Proposal not found: ${id}`)
  if (!['draft','validating'].includes(proposal.status)) throw new Error('Published or reviewed revisions are immutable; create a new proposal')

  const config = proposal.ruleConfig as unknown as TransitionRuleConfig

  validateRuleConfig(config)
  if (!positiveInputs.length || !negativeInputs.length) throw new Error('Both defect and healthy structured fixtures are required')
  const evaluate = (input: string, expected: 'pass' | 'fail' | 'unknown'): RuleTestResult => {
    let observation: TransitionObservation
    try { observation = JSON.parse(input) } catch { throw new Error('Fixture must be JSON TransitionObservation, not prose') }
    const actual = evaluateTransition(config, observation)
    return { input, expected, actual, passed: actual === expected }
  }
  const positiveResults = positiveInputs.map(input => evaluate(input, 'fail'))
  const unknownInput = JSON.stringify({ ...config.trigger, startedAtMs:0, observedUntilMs:0, samples:[], evidenceRefs:[] })
  const negativeResults = [...negativeInputs.map(input => evaluate(input, 'pass')), evaluate(unknownInput, 'unknown')]
  await updateProposalStatus(id, 'validating', { positiveResults, negativeResults })
  return { positiveResults, negativeResults }
}

export async function reviewProposal(id: string, action: 'approve' | 'reject', reviewer: string) {
  const proposal = await getProposal(id)
  if (!proposal) throw new Error('Proposal not found')
  if (proposal.status === 'enabled') throw new Error('Enabled revisions are immutable')
  const results = [...proposal.positiveResults, ...proposal.negativeResults]
  if (action === 'approve' && (!['fail','pass','unknown'].every(expected => results.some(r => r.expected === expected)) || !results.every(r => r.passed) || proposal.status !== 'validating')) throw new Error('Approval requires passing defect, healthy and unknown fixtures')
  return updateProposalStatus(id, action === 'approve' ? 'approved' : 'rejected', { reviewedBy:reviewer })
}
export async function enableProposal(id: string) {
  const proposal = await getProposal(id)
  if (!proposal || proposal.status !== 'approved' || !proposal.reviewedBy) throw new Error('Human approval required')
  const updated = await updateProposalStatus(id,'enabled')
  registerRule(compileTransitionRule(id,proposal.ruleConfig as unknown as TransitionRuleConfig))
  return updated
}
export async function loadEnabledProposals(): Promise<void> {
  const rows = await getDbClient().execute("SELECT * FROM rule_proposals WHERE status = 'enabled'")
  for (const row of rows.rows) {
    const proposal = rowToProposal(row as unknown as Record<string,unknown>)
    if (proposal.reviewedBy) registerRule(compileTransitionRule(proposal.id,proposal.ruleConfig as unknown as TransitionRuleConfig))
  }
}

function rowToProposal(row: Record<string, unknown>): RuleProposal {
  return {
    id: String(row.id),
    findingId: String(row.finding_id),
    ruleConfig: JSON.parse(String(row.rule_config)),
    status: String(row.status) as RuleProposalStatus,
    positiveResults: JSON.parse(String(row.positive_results)),
    negativeResults: JSON.parse(String(row.negative_results)),
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}
