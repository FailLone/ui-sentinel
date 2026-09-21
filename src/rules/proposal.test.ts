import { describe, it, expect, beforeAll } from 'vitest'
import { Hono } from 'hono'
import { initDatabase } from '../storage/database.ts'
import { submitFinding, createRun } from '../execution/run-manager.ts'
import { proposalRoutes } from '../server/routes/proposals.ts'

describe('rule proposals', () => {
  const app = new Hono()
  app.route('/', proposalRoutes)
  let findingId: string

  beforeAll(async () => {
    await initDatabase()

    const run = await createRun({
      goal: 'test',
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
      severity: 'warning',
      title: 'Retry mechanism not recovering',
      expected: 'Retry should provide working recovery',
      actual: 'Retry always fails',
      stepId: null,
      evidenceRefs: [],
    })
    findingId = finding.id
  })

  it('creates a proposal', async () => {
    const res = await app.request('/api/rule-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        findingId,
        ruleConfig: {
          type: 'transition',
          name: 'payment-retry-recovery',
          description: 'After retryable payment failure, retry button should become actionable within 5s',
          trigger: { eventType: 'payment-failed', fromState: 'payment-failed' },
          expectation: { condition: 'element-actionable', target: 'retry-button', timeoutMs: 5000 },
          severity: 'warning',
        },
      }),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.status).toBe('draft')
    expect(body.findingId).toBe(findingId)
  })

  it('validates a proposal with positive and negative inputs', async () => {
    const createRes = await app.request('/api/rule-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        findingId,
        ruleConfig: {
          type: 'transition',
          name: 'retry-recovery-v2',
          description: 'Retry should work',
          trigger: { eventType: 'payment-failed' },
          expectation: { condition: 'element-actionable', target: 'retry-btn', timeoutMs: 5000 },
          severity: 'warning',
        },
      }),
    })
    const proposal = await createRes.json()

    const validateRes = await app.request(`/api/rule-proposals/${proposal.id}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positiveInputs: ['retry button not working after 10s', 'retry always fails'],
        negativeInputs: ['retry button working after 2s', 'retry button available and clickable'],
      }),
    })
    expect(validateRes.status).toBe(200)
    const results = await validateRes.json()
    expect(results.positiveResults).toHaveLength(2)
    expect(results.negativeResults).toHaveLength(2)
    expect(results.positiveResults.every((r: { passed: boolean }) => r.passed)).toBe(true)
    expect(results.negativeResults.every((r: { passed: boolean }) => r.passed)).toBe(true)
  })

  it('rejects approval without validation', async () => {
    const createRes = await app.request('/api/rule-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        findingId,
        ruleConfig: {
          type: 'transition',
          name: 'unvalidated',
          description: 'test',
          trigger: { eventType: 'test' },
          expectation: { condition: 'element-visible', timeoutMs: 1000 },
          severity: 'warning',
        },
      }),
    })
    const proposal = await createRes.json()

    const reviewRes = await app.request(`/api/rule-proposals/${proposal.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    })
    expect(reviewRes.status).toBe(400)
  })

  it('full lifecycle: create → validate → approve → enable', async () => {
    const createRes = await app.request('/api/rule-proposals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        findingId,
        ruleConfig: {
          type: 'transition',
          name: 'full-lifecycle',
          description: 'Full lifecycle test',
          trigger: { eventType: 'payment-failed' },
          expectation: { condition: 'element-actionable', target: 'retry-btn', timeoutMs: 5000 },
          severity: 'warning',
        },
      }),
    })
    const proposal = await createRes.json()

    await app.request(`/api/rule-proposals/${proposal.id}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positiveInputs: ['retry not working'],
        negativeInputs: ['retry working and clickable'],
      }),
    })

    const reviewRes = await app.request(`/api/rule-proposals/${proposal.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', reviewedBy: 'test-human' }),
    })
    expect(reviewRes.status).toBe(200)
    const reviewed = await reviewRes.json()
    expect(reviewed.status).toBe('approved')
    expect(reviewed.reviewedBy).toBe('test-human')

    const enableRes = await app.request(`/api/rule-proposals/${proposal.id}/enable`, {
      method: 'POST',
    })
    expect(enableRes.status).toBe(200)
    const enabled = await enableRes.json()
    expect(enabled.status).toBe('enabled')
  })
})
