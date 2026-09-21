import { Hono } from 'hono'
import {
  createProposal,
  getProposal,
  updateProposalStatus,
  validateProposal,
  type TransitionRuleConfig,
} from '../../rules/proposal.ts'

export const proposalRoutes = new Hono()

proposalRoutes.post('/api/rule-proposals', async (c) => {
  const body = await c.req.json<{
    findingId: string
    ruleConfig: TransitionRuleConfig
  }>()

  if (!body.findingId) return c.json({ error: 'findingId required' }, 400)
  if (!body.ruleConfig) return c.json({ error: 'ruleConfig required' }, 400)

  try {
    const proposal = await createProposal(body.findingId, body.ruleConfig)
    return c.json(proposal, 201)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

proposalRoutes.get('/api/rule-proposals/:id', async (c) => {
  const id = c.req.param('id')
  const proposal = await getProposal(id)
  if (!proposal) return c.json({ error: 'not found' }, 404)
  return c.json(proposal)
})

proposalRoutes.post('/api/rule-proposals/:id/validate', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    positiveInputs: string[]
    negativeInputs: string[]
  }>()

  try {
    const results = await validateProposal(
      id,
      body.positiveInputs ?? [],
      body.negativeInputs ?? [],
    )
    return c.json(results)
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

proposalRoutes.post('/api/rule-proposals/:id/review', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json<{
    action: 'approve' | 'reject'
    reviewedBy?: string
  }>()

  if (!body.action || !['approve', 'reject'].includes(body.action)) {
    return c.json({ error: 'action must be approve or reject' }, 400)
  }

  const proposal = await getProposal(id)
  if (!proposal) return c.json({ error: 'not found' }, 404)

  if (body.action === 'approve') {
    const allPositivePass = proposal.positiveResults.every((r) => r.passed)
    const allNegativePass = proposal.negativeResults.every((r) => r.passed)

    if (!allPositivePass || !allNegativePass) {
      return c.json({
        error: 'Cannot approve: validation results have failures',
        positivePass: allPositivePass,
        negativePass: allNegativePass,
      }, 400)
    }

    if (proposal.positiveResults.length === 0 && proposal.negativeResults.length === 0) {
      return c.json({ error: 'Cannot approve: no validation results. Run validate first.' }, 400)
    }
  }

  const newStatus = body.action === 'approve' ? 'approved' : 'rejected'
  const updated = await updateProposalStatus(id, newStatus, {
    reviewedBy: body.reviewedBy ?? 'human',
  })

  return c.json(updated)
})

proposalRoutes.post('/api/rule-proposals/:id/enable', async (c) => {
  const id = c.req.param('id')
  const proposal = await getProposal(id)

  if (!proposal) return c.json({ error: 'not found' }, 404)
  if (proposal.status !== 'approved') {
    return c.json({ error: `Cannot enable: proposal status is ${proposal.status}, must be approved` }, 400)
  }

  const updated = await updateProposalStatus(id, 'enabled')
  return c.json(updated)
})
