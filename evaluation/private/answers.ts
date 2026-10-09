import type { BusinessResult } from '../../src/shared/types.ts'

export type VariantId = 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5'

export interface VariantExpectation {
  readonly variant: VariantId
  readonly description: string
  readonly expectedBusinessResult: BusinessResult
  readonly expectedFindings: readonly ExpectedFinding[]
  readonly mustNot: readonly string[]
}

export interface ExpectedFinding {
  readonly description: string
  readonly category: string
  readonly required: boolean
}

export const VARIANT_EXPECTATIONS: Record<VariantId, VariantExpectation> = {
  C0: {
    variant: 'C0',
    description: 'Normal purchase flow',
    expectedBusinessResult: 'success',
    expectedFindings: [],
    mustNot: ['overlay blocking', 'payment failed'],
  },
  C1: {
    variant: 'C1',
    description: 'Closable overlay blocking submit',
    expectedBusinessResult: 'success',
    expectedFindings: [
      { description: 'Overlay blocking primary action', category: 'overlay', required: true },
    ],
    mustNot: [],
  },
  C2: {
    variant: 'C2',
    description: 'Unclosable overlay blocking submit',
    expectedBusinessResult: 'unknown',
    expectedFindings: [
      { description: 'Overlay blocking with no close option', category: 'overlay', required: true },
    ],
    mustNot: [],
  },
  C3: {
    variant: 'C3',
    description: 'Button renamed and moved',
    expectedBusinessResult: 'success',
    expectedFindings: [],
    mustNot: ['button missing', 'cannot find button'],
  },
  C4: {
    variant: 'C4',
    description: 'Payment rejected with clear reason',
    expectedBusinessResult: 'rejected',
    expectedFindings: [],
    mustNot: ['path logic failure', 'button broken'],
  },
  C5: {
    variant: 'C5',
    description: 'Retry remains unavailable - no matching rule',
    expectedBusinessResult: 'unknown',
    expectedFindings: [
      {
        description: 'Retry control unavailable throughout required recovery window',
        category: 'hypothesis',
        required: true,
      },
    ],
    mustNot: [],
  },
}
