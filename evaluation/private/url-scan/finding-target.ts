/** Matches a saved comparison to a target independently located by the evaluator's browser. */
export function verifiesSortFinding(
  receipt: any,
  firstRowSelectors: readonly string[],
  priceListSelectors: readonly string[] = [],
): boolean {
  if (
    receipt?.outcome === 'failed' &&
    receipt?.binding?.mode === 'post-action-current' &&
    receipt.binding.selector === receipt.input?.selector &&
    receipt.measured?.supported
  ) {
    const input = receipt.input,
      measured = receipt.measured
    if (input.condition === 'numeric-ascending')
      return (
        priceListSelectors.includes(input.selector) &&
        measured.count === 3 &&
        JSON.stringify(measured.values) === JSON.stringify(['20', '5', '12'])
      )
    if (input.condition === 'text-equals')
      return (
        firstRowSelectors.includes(input.selector) &&
        measured.count === 1 &&
        ((measured.values?.[0] === '20' && input.expected === '5') ||
          (measured.values?.[0] === '20 · Blue widget' && input.expected === '5 · Amber gadget'))
      )
    return false
  }
  return (
    receipt?.verdict === 'fail' &&
    Array.isArray(receipt.assertions) &&
    receipt.assertions.some((a: any) => {
      const target = receipt.program?.targets?.find((t: any) => t.name === a.left?.target)
      const measured = receipt.samples?.[a.left?.sample]?.[a.left?.target]?.text
      return (
        a.verdict === 'fail' &&
        a.operator === 'eq' &&
        a.left?.metric === 'text' &&
        firstRowSelectors.includes(target?.selector) &&
        ['20', '20 · Blue widget'].includes(String(a.actualLeft)) &&
        ['5', '5 · Amber gadget'].includes(String(a.actualRight)) &&
        measured === a.actualLeft &&
        a.right?.value === a.actualRight
      )
    })
  )
}
