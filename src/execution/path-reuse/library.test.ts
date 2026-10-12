import { expect, it, vi } from 'vitest'
import { checkHash } from '../../inspection/check-contract.ts'
import { PRODUCT_SKILL_REVISION } from '../../inspection/product-path.ts'
const db = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('../../storage/database.ts', () => ({ getDbClient: () => db }))
import { loadPathProgram } from './library.ts'
it('persisted candidate must match the requested key as well as its own digest', async () => {
  const body = {
    revision: 'path-reuse-1',
    skillRevision: PRODUCT_SKILL_REVISION,
    bindings: [{}],
    plan: { steps: [{}] },
  }
  const program = { id: 'path-' + checkHash(body), ...body }
  db.execute.mockResolvedValue({ rows: [{ program: JSON.stringify(program) }] })
  expect(await loadPathProgram('path-' + 'a'.repeat(64))).toBeUndefined()
  expect(await loadPathProgram(program.id)).toEqual(program)
})
it('malformed stored JSON is an unavailable candidate, never executable or a parser crash', async () => {
  db.execute.mockResolvedValue({ rows: [{ program: '{' }] })
  expect(await loadPathProgram('path-' + 'a'.repeat(64))).toBeUndefined()
})
