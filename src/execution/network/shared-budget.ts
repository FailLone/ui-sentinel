import { createBodyBudget } from './transport.ts'

/** One parent + its children spend the original request/byte ceiling, synchronously. */
export function createSharedNetworkBudget(limits: {
  maxRequests: number
  maxResponseBytes: number
  maxTotalBytes: number
}) {
  let requests = 0
  return {
    body: createBodyBudget(limits.maxResponseBytes, limits.maxTotalBytes),
    reserveRequest() {
      if (requests >= limits.maxRequests) return false
      requests++
      return true
    },
    requests: () => requests,
  }
}
export type SharedNetworkBudget = ReturnType<typeof createSharedNetworkBudget>
