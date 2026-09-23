import { z } from 'zod'

const bounds = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive(),
  height: z.number().positive(),
})
export const evidencePacketSchema = z.object({
  runId: z.string(),
  snapshotId: z.string(),
  factVersion: z.string(),
  operationId: z.string().nullable(),
  parentTaskId: z.string(),
  dependsOn: z.array(z.string()),
  deadlineAt: z.number().int(),
  consistency: z.enum(['verified', 'unverified']),
  evidenceRefs: z.array(z.string()).min(2),
  capturedAt: z.string(),
  url: z.string(),
  viewport: z.object({ width: z.number().positive(), height: z.number().positive() }),
  imageDataUrl: z.string().startsWith('data:image/png;base64,'),
  question: z.string().min(1).max(600),
  elements: z
    .array(
      z.object({
        ref: z.string(),
        text: z.string(),
        tag: z.string(),
        bounds,
        blockedPoints: z.number().int().nonnegative(),
      }),
    )
    .max(600),
})
export type EvidencePacket = z.infer<typeof evidencePacketSchema>

export const visualReviewSchema = z.object({
  answer: z.string().min(1).max(800),
  coverage: z.enum(['reviewed', 'insufficient-evidence']),
  candidates: z
    .array(
      z.object({
        kind: z.enum([
          'pointer-interception',
          'occlusion',
          'clipped-control',
          'visual-hit-area',
          'other',
        ]),
        target: z.string().min(1).max(180),
        observation: z.string().min(1).max(400),
        verification: z.string().min(1).max(300),
        region: bounds,
      }),
    )
    .max(3),
  limitations: z.array(z.string().max(200)).max(3),
})
export type VisualReview = z.infer<typeof visualReviewSchema>
export interface EvidenceAnalysisResult {
  visual: VisualReview
  geometry: { checkedElements: number; partiallyOutside: string[]; intercepted: string[] }
}
