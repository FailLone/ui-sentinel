import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const require = createRequire(import.meta.url)
function version(name: string) {
  try {
    return (require(`${name}/package.json`) as { version: string }).version
  } catch {
    return 'unavailable'
  }
}
export function executionVersions() {
  let lockHash = 'unavailable'
  try {
    lockHash = createHash('sha256').update(readFileSync('pnpm-lock.yaml')).digest('hex')
  } catch {}
  return {
    node: process.version,
    mastra: version('@mastra/core'),
    playwright: version('playwright'),
    midscene: version('@midscene/web'),
    lockHash,
    toolContract: '17',
    telemetryContract: '2',
    arenaContract: 'minimum-1',
  }
}
