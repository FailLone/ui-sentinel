import { randomUUID } from 'node:crypto'
import { getDbClient } from '../storage/database.ts'
import type { RuleProposal, RuleProposalStatus, RuleTestResult } from '../shared/types.ts'

export interface TransitionRuleConfig {
  readonly type: 'transition'
  readonly name: string
  readonly description: string
  readonly trigger: {
    readonly eventType: string
    readonly fromState?: string
    readonly toState?: string
  }
  readonly expectation: {
    readonly condition: 'state-reachable' | 'element-visible' | 'element-actionable'
    readonly target?: string
    readonly timeoutMs: number
  }
  readonly severity: 'error' | 'warning'
}

export async function createProposal(
  findingId: string,
  ruleConfig: TransitionRuleConfig,
): Promise<RuleProposal> {
  const db = getDbClient()
  const id = `proposal-${randomUUID()}`
  const now = new Date().toISOString()

  validateRuleConfig(ruleConfig)

  const proposal: RuleProposal = {
    id,
    findingId,
    ruleConfig,
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
    args,
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

  const config = proposal.ruleConfig as TransitionRuleConfig

  const positiveResults: RuleTestResult[] = positiveInputs.map((input) => {
    const result = simulateRuleExecution(config, input, 'fail')
    return { input, expected: 'fail', actual: result, passed: result === 'fail' }
  })

  const negativeResults: RuleTestResult[] = negativeInputs.map((input) => {
    const result = simulateRuleExecution(config, input, 'pass')
    return { input, expected: 'pass', actual: result, passed: result === 'pass' }
  })

  await updateProposalStatus(id, 'validating', {
    positiveResults,
    negativeResults,
  })

  return { positiveResults, negativeResults }
}

function simulateRuleExecution(
  config: TransitionRuleConfig,
  input: string,
  expectedOutcome: 'pass' | 'fail',
): 'pass' | 'fail' | 'unknown' {
  const inputLower = input.toLowerCase()

  if (config.expectation.condition === 'element-actionable') {
    if (inputLower.includes('not working') || inputLower.includes('always fails') || inputLower.includes('disabled')) {
      return 'fail'
    }
    if (inputLower.includes('working') || inputLower.includes('available') || inputLower.includes('clickable')) {
      return 'pass'
    }
    return 'unknown'
  }

  if (config.expectation.condition === 'element-visible') {
    if (inputLower.includes('missing') || inputLower.includes('hidden') || inputLower.includes('not found')) {
      return 'fail'
    }
    if (inputLower.includes('visible') || inputLower.includes('present') || inputLower.includes('shown')) {
      return 'pass'
    }
    return 'unknown'
  }

  if (config.expectation.condition === 'state-reachable') {
    if (inputLower.includes('blocked') || inputLower.includes('unreachable')) {
      return 'fail'
    }
    if (inputLower.includes('reachable') || inputLower.includes('accessible')) {
      return 'pass'
    }
    return 'unknown'
  }

  return 'unknown'
}

function validateRuleConfig(config: TransitionRuleConfig): void {
  if (config.type !== 'transition') {
    throw new Error(`Unsupported rule type: ${config.type}. Only 'transition' is supported.`)
  }

  if (!config.name || !config.description) {
    throw new Error('Rule config must have name and description')
  }

  if (!config.trigger.eventType) {
    throw new Error('Rule trigger must have an eventType')
  }

  const validConditions = new Set(['state-reachable', 'element-visible', 'element-actionable'])
  if (!validConditions.has(config.expectation.condition)) {
    throw new Error(`Unsupported condition: ${config.expectation.condition}`)
  }

  if (config.expectation.timeoutMs <= 0 || config.expectation.timeoutMs > 60_000) {
    throw new Error('timeoutMs must be between 1 and 60000')
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
