/** Private oracle. Public sorting alternatives are equivalent checks; never import production verdicts. */
export function verifyHealthyBehavior(input: {
  entryUrl: string
  overlay: boolean
  requests: readonly { method: string; path: string; observedAt?: string }[]
  snapshots: readonly { url?: string; text?: string; observedAt?: string }[]
  requiredEffects?: { sort: boolean; filter: boolean }
}): boolean {
  const orders: Record<string, string[]> = {
    price: ['5 · Amber gadget', '12 · Cyan sprocket', '20 · Blue widget'],
    name: ['5 · Amber gadget', '20 · Blue widget', '12 · Cyan sprocket'],
  }
  const snapshots = input.snapshots.filter((s) => s.url === input.entryUrl)
  const sortVerified = snapshots.some((snapshot) => {
    const time = Date.parse(snapshot.observedAt ?? '')
    if (!Number.isFinite(time)) return false
    const requests = input.requests.filter(
      (r) =>
        r.method === 'GET' &&
        r.path.startsWith('/items?') &&
        Number.isFinite(Date.parse(r.observedAt ?? '')) &&
        Date.parse(r.observedAt!) <= time,
    )
    const last = requests.at(-1)
    if (!last) return false
    const order = new URL(last.path, input.entryUrl).searchParams.get('sort')
    const expected = order ? orders[order] : undefined
    if (!expected) return false
    const lines = String(snapshot.text ?? '')
      .split('\n')
      .map((s) => s.trim())
    const rows = lines.filter((s) => Object.values(orders).flat().includes(s))
    return JSON.stringify(rows) === JSON.stringify(expected)
  })
  // Expanding the other advertised control remains mandatory for the overlay healthy control.
  const filterVerified =
    !input.overlay ||
    snapshots.some((s) =>
      String(s.text ?? '')
        .split('\n')
        .some((line) => line.trim() === 'Available products'),
    )
  return (
    (input.requiredEffects?.sort === false || sortVerified) &&
    (input.requiredEffects?.filter === false || filterVerified)
  )
}

/** Future v2 independently reads the public denominator. Legacy default above remains unchanged. */
export function verifyDefaultHealthyBehavior(
  input: Parameters<typeof verifyHealthyBehavior>[0] & { report: any },
) {
  const { report } = input
  if (report.uiScan?.contract.samplingPolicy?.revision !== 'bounded-ui-sampling-1') return false
  const frames = report.events.filter(
    (e: any) => e.type === 'scope:sampling-frozen' && e.payload.url === input.entryUrl,
  )
  if (frames.length !== 1) return false
  const frame = frames[0].payload
  const locals = frame.candidates.filter((c: any) => c.category === 'local-interaction')
  const selected = locals.filter((c: any) =>
    report.uiScan.inspection.items.some(
      (i: any) => i.itemId === c.itemId && i.selected && ['verified', 'failed'].includes(i.status),
    ),
  )
  if (frame.count !== Math.min(3, locals.length) || selected.length !== frame.count) return false
  const sort = selected.some((c: any) => c.description.includes('"Apply sort"'))
  const filter = selected.some((c: any) => c.description.includes('"Filters"'))
  return verifyHealthyBehavior({ ...input, requiredEffects: { sort, filter } })
}
