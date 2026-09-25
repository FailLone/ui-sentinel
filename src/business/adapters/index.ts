import { checkoutAdapter } from './checkout.ts'
import { exportAdapter } from './export.ts'
import type { BusinessAdapter } from './types.ts'

const adapters: readonly BusinessAdapter[] = Object.freeze([checkoutAdapter, exportAdapter])

export function resolveAdapter(id: string, revision: string): BusinessAdapter | undefined {
  return adapters.find((a) => a.id === id && a.revision === revision)
}

export function registeredAdapters(): readonly BusinessAdapter[] {
  return adapters
}

export { decodeFact } from './codec.ts'
export type {
  BusinessAdapter,
  BusinessFact,
  CompatibilityTriggers,
  Correlation,
  PublicExchange,
  PublicRequest,
  RequestIntent,
  RequestShape,
  RetainedResource,
  RetrySignal,
} from './types.ts'
