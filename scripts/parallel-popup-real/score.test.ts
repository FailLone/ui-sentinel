import { it, expect } from 'vitest'
import { scoreRow } from './score.ts'
import { batchExitCode } from './exit-code.ts'
import { spawnSync } from 'node:child_process'
it('separates committed cancellation, uncommitted persistence and successful goals', () => {
  const parent = { status: 'cancelled', persistence: { status: 'verified' } }
  const s = scoreRow('P01', parent, [])
  expect(s.safetyStop).toBe(false)
  expect(s.goalPassed).toBe(false)
  for (const status of ['not-final', 'inconsistent'])
    expect(scoreRow('P01', { ...parent, persistence: { status } }, []).safetyStop).toBe(true)
})
it('returns a nonzero process code for stopped batches after result handling; success remains zero', () => {
  expect(batchExitCode({ stopped: 'jev-http-error' })).toBe(2)
  expect(batchExitCode({ stopped: '', goalPassed: false })).toBe(3)
  for (const stopped of ['', 'jev-http-error', 'operator-cancelled']) {
    const p = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `import { batchExitCode } from './scripts/parallel-popup-real/exit-code.ts'; process.exit(batchExitCode(${JSON.stringify({ stopped })}))`,
    ])
    expect(p.status).toBe(stopped ? 2 : 0)
  }
})
