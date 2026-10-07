/** Matches a saved comparison to a target independently located by the evaluator's browser. */
export function verifiesSortFinding(receipt: any, firstRowSelectors: readonly string[]): boolean {
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
