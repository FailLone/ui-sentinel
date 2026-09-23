import { it, expect, vi, beforeAll } from 'vitest'
const model = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    generate = model.generate
  },
}))
vi.mock('../shared/config.ts', () => ({
  config: {
    databaseUrl: ':memory:',
    agentModel: 'openai/test',
    budget: { modelRequestTimeoutMs: 80 },
  },
  checkModelConfig: () => ({ ready: true }),
}))
vi.mock('../shared/model.ts', () => ({ agentModel: 'openai/test' }))
import { initDatabase, getDbClient } from '../storage/database.ts'
import { createRun, submitFinding, appendEvent, getEvents } from '../execution/run-manager.ts'
import { generateRuleProposal } from './proposals.ts'
const declaration = {
  type: 'transition',
  name: 'Retry access',
  description: 'An operable retry within 5 seconds',
  trigger: { eventType: 'retryable-failure', fromState: null, toState: null },
  expectation: { condition: 'element-actionable', target: 'Retry button', timeoutMs: 5000 },
  severity: 'error',
}
beforeAll(initDatabase)
async function fixture(confirmed = true) {
  const run = await createRun({
    goal: 'test proposal',
    environmentId: 'test',
    entryUrl: 'http://localhost',
  })
  const finding = await submitFinding({
    runId: run.id,
    source: 'agent',
    ruleId: null,
    ruleRevision: null,
    hypothesisId: null,
    validationStatus: 'supported',
    severity: 'error',
    title: 'Retry unavailable',
    expected: 'An operable retry within 5 seconds',
    actual: 'disabled throughout',
    stepId: null,
    evidenceRefs: ['owned-measurement'],
  })
  if (confirmed)
    await getDbClient().execute({
      sql: 'INSERT INTO finding_feedback (id,finding_id,verdict,reason) VALUES (?,?,?,?)',
      args: [finding.id, finding.id, 'confirmed', 'Explicit deterministic test fixture'],
    })
  await appendEvent(run.id, 'transition:observed', {
    condition: 'element-actionable',
    eventType: 'retryable-failure',
    fromState: 'failed',
    toState: 'retry-enabled',
    startedAtMs: 0,
    observedUntilMs: 5000,
    samples: [{ atMs: 0, target: 'Retry button', value: false }],
    evidenceRefs: ['owned-measurement'],
  })
  return { run, finding }
}
it('requires confirmed feedback before spending a model request', async () => {
  const { finding } = await fixture(false)
  model.generate.mockClear()
  await expect(generateRuleProposal(finding.id)).rejects.toThrow('Human confirmation')
  expect(model.generate).not.toHaveBeenCalled()
})
it('generates an unapproved draft using only finding-linked observations and records usage', async () => {
  const { run, finding } = await fixture()
  await appendEvent(run.id, 'transition:observed', {
    eventType: 'unrelated',
    evidenceRefs: ['other-measurement'],
  })
  model.generate.mockImplementation(async (input: string) => {
    const parsed = JSON.parse(input)
    expect(parsed.observations).toHaveLength(1)
    return { object: declaration, usage: { inputTokens: 11, outputTokens: 22 } }
  })
  const result = await generateRuleProposal(finding.id)
  expect(result.status).toBe('draft')
  expect(result.ruleConfig.trigger).toEqual({ eventType: 'retryable-failure' })
  expect(result.reviewedBy).toBeNull()
  expect(
    (await getEvents(run.id)).find((e) => e.type === 'proposal:model-request-finished')?.payload,
  ).toMatchObject({ status: 'success', usage: { inputTokens: 11, outputTokens: 22 } })
})
it('rejects invented state filters not supported by source evidence', async () => {
  const { finding } = await fixture()
  model.generate.mockResolvedValue({
    object: { ...declaration, trigger: { ...declaration.trigger, fromState: 'invented' } },
  })
  await expect(generateRuleProposal(finding.id)).rejects.toThrow('does not match recorded facts')
})
it('bounds providers that ignore cancellation and prevents a late result from creating a proposal', async () => {
  const { run, finding } = await fixture()
  let settle!: (value: unknown) => void
  model.generate.mockImplementation(
    () =>
      new Promise((r) => {
        settle = r
      }),
  )
  await expect(generateRuleProposal(finding.id)).rejects.toThrow('proposal-model-request-timeout')
  settle({ object: declaration })
  await new Promise((r) => setTimeout(r, 30))
  const proposals = await getDbClient().execute({
    sql: 'SELECT id FROM rule_proposals WHERE finding_id=?',
    args: [finding.id],
  })
  expect(proposals.rows).toHaveLength(0)
  const event = (await getEvents(run.id)).find((e) => e.type === 'proposal:model-request-finished')!
  expect(event.payload).toMatchObject({ status: 'cancelled-or-timeout', usage: 'unknown' })
})

it('links new candidates to same-finding validation feedback and keeps earlier candidates unchanged', async () => {
  const { finding } = await fixture()
  model.generate.mockResolvedValue({ object: declaration })
  const previous = await generateRuleProposal(finding.id)
  await getDbClient().execute({
    sql: 'UPDATE rule_proposals SET negative_results=? WHERE id=?',
    args: [
      JSON.stringify([
        {
          input: JSON.stringify({ eventType: 'retryable-failure', samples: [] }),
          expected: 'pass',
          actual: 'unknown',
          passed: false,
        },
      ]),
      previous.id,
    ],
  })
  model.generate.mockImplementation(async (input: string) => {
    expect(JSON.parse(input).revisionFeedback).toMatchObject({
      previousProposalId: previous.id,
      tests: [{ expected: 'pass', actual: 'unknown' }],
    })
    return { object: declaration }
  })
  const revision = await generateRuleProposal(finding.id, undefined, previous.id)
  expect(revision.id).not.toBe(previous.id)
  const other = await fixture()
  await expect(generateRuleProposal(other.finding.id, undefined, previous.id)).rejects.toThrow(
    'same finding',
  )
})
