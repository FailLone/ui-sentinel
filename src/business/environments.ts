import { config } from '../shared/config.ts'
import type { BusinessEnvironmentId } from './types.ts'

/** One registered run environment: a public origin plus the served entry path. */
export interface BusinessEnvironment {
  readonly id: BusinessEnvironmentId
  readonly publicOrigin: string
  readonly entryUrl: string
}

/**
 * Environments are an explicit allowlist, not an arbitrary-URL facility. Adding a business
 * means registering its environment here; the executor never accepts a URL that is not one of
 * these origins, so a profile cannot widen the network boundary.
 */
export function resolveEnvironment(id: string): BusinessEnvironment | undefined {
  if (id === 'arena' || id === 'default') {
    const publicOrigin = `http://localhost:${config.arenaPort}`
    return { id, publicOrigin, entryUrl: publicOrigin }
  }
  if (id === 'export-arena') {
    const publicOrigin = `http://localhost:${config.exportArenaPort}`
    return { id, publicOrigin, entryUrl: publicOrigin }
  }
  return undefined
}

export function environmentIds(): readonly string[] {
  return ['default', 'arena', 'export-arena']
}
