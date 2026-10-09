/** Fixture-only adapter helpers. Never imported by product code. */
import { bindReceipt } from '../../src/agent/decisions/exploration/adapter.ts'
import {
  requestExplorationScores as request,
  type SendFn,
  type RequestOptions,
} from '../../src/agent/decisions/exploration/transport.ts'
import { createExplorationSession as session } from '../../src/agent/decisions/exploration/session.ts'
function bindFake(send: SendFn): SendFn {
  return async (request, context) => {
    const result = await send(request, context)
    // Existing stub transports already bind; never overwrite a deliberately wrong envelope.
    return result && typeof result === 'object' && 'receipt' in result
      ? result
      : bindReceipt(result, context)
  }
}
export const requestExplorationScores = (options: RequestOptions) =>
  request({ ...options, send: bindFake(options.send) })
export const createExplorationSession = (options: Parameters<typeof session>[0]) =>
  session({ ...options, send: bindFake(options.send) })
