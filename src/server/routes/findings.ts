import { Hono } from 'hono'
import { getDbClient } from '../../storage/database.ts'
import { randomUUID } from 'node:crypto'
import type { FeedbackVerdict } from '../../shared/types.ts'

export const findingRoutes = new Hono()

const VALID_VERDICTS = new Set<FeedbackVerdict>([
  'confirmed',
  'intentional',
  'cannot-reproduce',
  'deferred',
])

findingRoutes.post('/api/findings/:id/feedback', async (c) => {
  const findingId = c.req.param('id')
  const body = await c.req.json<{ verdict: string; reason?: string }>()

  if (!VALID_VERDICTS.has(body.verdict as FeedbackVerdict)) {
    return c.json({ error: `invalid verdict. Must be one of: ${[...VALID_VERDICTS].join(', ')}` }, 400)
  }

  const db = getDbClient()

  const finding = await db.execute({
    sql: 'SELECT id FROM findings WHERE id = ?',
    args: [findingId],
  })
  if (finding.rows.length === 0) {
    return c.json({ error: 'finding not found' }, 404)
  }

  const id = `fb-${randomUUID()}`
  const now = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO finding_feedback (id, finding_id, verdict, reason, created_at)
          VALUES (?, ?, ?, ?, ?)`,
    args: [id, findingId, body.verdict, body.reason ?? '', now],
  })

  return c.json({ id, findingId, verdict: body.verdict, createdAt: now })
})
