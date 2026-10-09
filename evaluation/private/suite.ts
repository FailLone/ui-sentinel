import type { VariantId } from './answers.ts'
/** Diagnostics never count as a minimum acceptance batch. */
export function evaluationCases(suite: string, repeats: number): VariantId[] {
  if ((suite === 'minimum' && repeats === 3) || (suite === 'diagnostic' && repeats === 1))
    return ['C0', 'C1', 'C2', 'C3', 'C4', 'C5']
  throw new Error(
    'Minimum requires six cases × three repeats; diagnostic requires six cases × one repeat',
  )
}
