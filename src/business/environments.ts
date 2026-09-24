import { config } from '../shared/config.ts'
import type { BusinessEnvironmentId } from './types.ts'

/** One registered run environment: a public origin plus the served entry path. */
export interface BusinessEnvironment {
  readonly id: BusinessEnvironmentId
  readonly publicOrigin: string
  readonly entryUrl: string
}

/**
 * The host every arena binds to.
 *
 * This is `127.0.0.1`, not `localhost`: they are different origins to a browser, so claiming
 * `localhost` here would make the executor treat the arena's own requests as cross-origin and
 * refuse every write. It matches the bind address in the arena servers.
 */
const LOOPBACK = '127.0.0.1'

/**
 * Environments are an explicit allowlist, not an arbitrary-URL facility. Adding a business
 * means registering its environment here; the executor never accepts a URL that is not one of
 * these origins, so a profile cannot widen the network boundary.
 */
export function resolveEnvironment(id: string): BusinessEnvironment | undefined {
  if (id === 'arena' || id === 'default') {
    const publicOrigin = `http://${LOOPBACK}:${config.arenaPort}`
    return { id, publicOrigin, entryUrl: publicOrigin }
  }
  if (id === 'export-arena') {
    const publicOrigin = `http://${LOOPBACK}:${config.exportArenaPort}`
    return { id, publicOrigin, entryUrl: publicOrigin }
  }
  return undefined
}

export function environmentIds(): readonly string[] {
  return ['default', 'arena', 'export-arena']
}
