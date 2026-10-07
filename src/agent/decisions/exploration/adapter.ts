import { z } from 'zod'
/** Local trusted adapter envelope; the provider is never asked to invent/echo this identity. */
export const adapterReceiptSchema = z
  .object({
    attemptId: z.string().min(1),
    requestDigest: z.string().regex(/^[a-f0-9]{64}$/),
    receipt: z.unknown(),
  })
  .strict()
export function bindReceipt(
  receipt: unknown,
  request: { attemptId: string; requestDigest: string },
) {
  return { attemptId: request.attemptId, requestDigest: request.requestDigest, receipt }
}
