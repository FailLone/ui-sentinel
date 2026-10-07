/** Private oracle. Public sorting alternatives are equivalent checks; never import production verdicts. */
export function verifyHealthyBehavior(input: {
  entryUrl: string
  overlay: boolean
  requests: readonly { method: string; path: string; observedAt?: string }[]
  snapshots: readonly { url?: string; text?: string; observedAt?: string }[]
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
  return sortVerified && filterVerified
}
