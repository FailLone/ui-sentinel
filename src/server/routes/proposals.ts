import { Hono } from 'hono'
import { z } from 'zod'
import {
  createProposal,
  getProposal,
  validateProposal,
  reviewProposal,
  enableProposal,
  type TransitionRuleConfig,
} from '../../rules/proposal.ts'
import { generateRuleProposal } from '../../agent/proposals.ts'

import { isEvaluationActive } from '../evaluation-access.ts'

export const proposalRoutes = new Hono()
proposalRoutes.use('/api/rule-proposals*', async (c, next) => {
  if (c.req.method !== 'GET' && isEvaluationActive())
    return c.json({ error: 'evaluation configuration is frozen' }, 409)
  await next()
})
proposalRoutes.onError((error, c) => c.json({ error: error.message }, 400))
proposalRoutes.post('/api/rule-proposals', async (c) => {
  const body = z
    .object({
      findingId: z.string().min(1),
      previousProposalId: z.string().min(1).optional(),
      reviewerFeedback: z.string().min(1).max(4000).optional(),
      ruleConfig: z.record(z.string(), z.unknown()).optional(),
    })
    .parse(await c.req.json())
  const proposal = body.ruleConfig
    ? await createProposal(body.findingId, body.ruleConfig as unknown as TransitionRuleConfig)
    : await generateRuleProposal(
        body.findingId,
        c.req.raw.signal,
        body.previousProposalId,
        body.reviewerFeedback,
      )
  return c.json(proposal, 201)
})
proposalRoutes.get('/api/rule-proposals/:id', async (c) => {
  const p = await getProposal(c.req.param('id'))
  return p ? c.json(p) : c.json({ error: 'not found' }, 404)
})
proposalRoutes.post('/api/rule-proposals/:id/validate', async (c) => {
  const body = z
    .object({
      positiveInputs: z.array(z.string()).min(1).max(50),
      negativeInputs: z.array(z.string()).min(1).max(50),
    })
    .parse(await c.req.json())
  return c.json(await validateProposal(c.req.param('id'), body.positiveInputs, body.negativeInputs))
})
proposalRoutes.post('/api/rule-proposals/:id/review', async (c) => {
  const body = z
    .object({
      action: z.enum(['approve', 'reject']),
      reviewedBy: z.string().min(1).default('human'),
    })
    .parse(await c.req.json())
  return c.json(await reviewProposal(c.req.param('id'), body.action, body.reviewedBy))
})
proposalRoutes.post('/api/rule-proposals/:id/enable', async (c) =>
  c.json(await enableProposal(c.req.param('id'))),
)
