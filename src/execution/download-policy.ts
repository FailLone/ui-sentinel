import type { BusinessRuntime } from '../business/runtime.ts'
import type { BusinessFact, RequestShape } from '../business/adapters/types.ts'

/** Public downloads are a narrow navigation exception, separate from application documents. */
export function isAllowedBusinessDownload(
  request: RequestShape,
  runtime: BusinessRuntime,
  ownsOperation: (id: string) => boolean,
  currentFact: (id: string) => BusinessFact | undefined,
): boolean {
  if (request.method.toUpperCase() !== 'GET') return false
  if (request.origin !== runtime.contract.environment.publicOrigin) return false
  try {
    if (new URL(request.url).origin !== request.origin) return false
  } catch {
    return false
  }
  const operationId = runtime.adapter.downloadOperation?.(request)
  if (!operationId || !ownsOperation(operationId)) return false
  const fact = currentFact(operationId)
  return fact?.operationId === operationId && fact.phase === 'succeeded'
}
