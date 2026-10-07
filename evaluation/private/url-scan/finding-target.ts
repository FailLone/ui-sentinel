type Results = Record<'price' | 'name', Record<string, string[]>>
type Context = {
  defective: Results
  healthy?: Results
  requests: readonly { method: string; path: string; observedAt?: string }[]
  measuredAt?: string
}
/** Private independent comparison: use the actual applied public sort and both browser controls. */
export function verifiesSortFinding(receipt: any, context: Context): boolean {
  const compare = (
    selector: string,
    values: unknown,
    condition: string,
    expected: unknown,
    at: number,
  ) => {
    if (!context.healthy || !Number.isFinite(at) || !Array.isArray(values)) return false
    const requests = context.requests
      .filter(
        (r) =>
          r.method === 'GET' &&
          Number.isFinite(Date.parse(r.observedAt ?? '')) &&
          Date.parse(r.observedAt!) <= at &&
          /^\/items\?sort=(price|name)$/.test(r.path),
      )
      .sort((a, b) => Date.parse(a.observedAt!) - Date.parse(b.observedAt!))
    const sort = requests.at(-1)?.path.endsWith('=price')
      ? 'price'
      : requests.at(-1)?.path.endsWith('=name')
        ? 'name'
        : undefined
    if (!sort) return false
    const bad = context.defective[sort]?.[selector],
      good = context.healthy[sort]?.[selector]
    if (!bad?.length || !good?.length || JSON.stringify(values) !== JSON.stringify(bad))
      return false
    const predicate = (v: string[]): boolean | null => {
      if (condition === 'text-equals' || condition === 'text-contains') {
        if (v.length !== 1 || typeof expected !== 'string') return null
        return condition === 'text-equals' ? v[0] === expected : v[0]!.includes(expected)
      }
      if (condition === 'numeric-ascending' || condition === 'numeric-descending') {
        if (v.length < 2 || v.some((n) => !/^[-+]?\d+(\.\d+)?$/.test(n))) return null
        const ns = v.map(Number)
        return ns.every(
          (n, i) => !i || (condition === 'numeric-ascending' ? ns[i - 1]! <= n : ns[i - 1]! >= n),
        )
      }
      return null
    }
    return predicate(bad) === false && predicate(good) === true
  }
  if (
    receipt?.outcome === 'failed' &&
    receipt.binding?.mode === 'post-action-current' &&
    receipt.binding.selector === receipt.input?.selector &&
    receipt.measured?.supported &&
    receipt.measured.count === receipt.measured.values?.length
  )
    return compare(
      receipt.input.selector,
      receipt.measured.values,
      receipt.input.condition,
      receipt.input.expected,
      Date.parse(context.measuredAt ?? ''),
    )
  return (
    receipt?.verdict === 'fail' &&
    Array.isArray(receipt.assertions) &&
    receipt.assertions.some((a: any) => {
      const target = receipt.program?.targets?.find((t: any) => t.name === a.left?.target)
      const measured = receipt.samples?.[a.left?.sample]?.[a.left?.target]?.text
      const at = receipt.log?.find(
        (s: any) => s.op === 'measure' && s.detail === a.left?.sample,
      )?.at
      return (
        a.verdict === 'fail' &&
        a.operator === 'eq' &&
        a.left?.metric === 'text' &&
        typeof measured === 'string' &&
        measured === a.actualLeft &&
        a.right?.value === a.actualRight &&
        at <= receipt.finishedAt &&
        at >= receipt.startedAt &&
        compare(target?.selector, [measured], 'text-equals', a.actualRight, at)
      )
    })
  )
}
