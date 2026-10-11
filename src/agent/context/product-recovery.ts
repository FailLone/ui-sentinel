import type { ProductSource } from '../../inspection/product-source.ts'
import type { decisionMemory } from './decision-memory.ts'
type Excerpt = { sourceId: string; contentHash: string; start: number; end: number; text: string }
/** Only decoded characters of the original source text, never wrappers or citation JSON. */
export function recoveredSourceFragment(
  source: ProductSource,
  item: any,
  raw: string,
  offset: number,
  end: number,
): Excerpt | undefined {
  const p = item.payload ?? item
  const r = p.result
  if (
    p.toolName !== 'product_source_read' ||
    r?.sourceId !== source.sourceId ||
    r?.contentHash !== source.contentHash ||
    typeof r.text !== 'string' ||
    source.markdown.slice(r.offset, r.endOffset) !== r.text
  )
    return
  const marker = '"text":' + JSON.stringify(r.text)
  const at = raw.indexOf(marker)
  if (at < 0) return
  let cursor = at + '"text":"'.length,
    sourceOffset = r.offset
  let first: number | undefined,
    text = ''
  for (const char of r.text) {
    const length = JSON.stringify(char).length - 2
    if (cursor >= offset && cursor + length <= end) {
      first ??= sourceOffset
      text += char
    }
    cursor += length
    sourceOffset += char.length
  }
  if (!text || first === undefined) return
  return {
    sourceId: source.sourceId,
    contentHash: source.contentHash,
    start: first,
    end: first + text.length,
    text,
  }
}
/** Current visibility differs from ever issued source coverage. Restored content never earns twice.
 * A scheduling allowance, not a new fact. At most two uses/run and 3000 decoded bytes. */
export function productRecoveryDelivery(source: ProductSource) {
  const shown = new Set<number>(),
    restored = new Set<number>()
  const shownTexts = () => {
    const texts: string[] = []
    let start = 0
    while (start < source.markdown.length) {
      if (!shown.has(start) && !restored.has(start)) {
        start++
        continue
      }
      let end = start + 1
      while (shown.has(end) || restored.has(end)) end++
      texts.push(source.markdown.slice(start, end))
      start = end
    }
    return texts
  }
  let used = 0,
    recoveredBytes = 0
  const valid = (v: any): v is Excerpt =>
    v?.sourceId === source.sourceId &&
    v?.contentHash === source.contentHash &&
    Number.isInteger(v.start) &&
    Number.isInteger(v.end) &&
    v.start >= 0 &&
    v.end > v.start &&
    v.end <= source.markdown.length &&
    typeof v.text === 'string' &&
    source.markdown.slice(v.start, v.end) === v.text
  const visible = (packet: any): Excerpt[] => {
    const result: Excerpt[] = []
    const visit = (v: any, identity?: { sourceId: string; contentHash: string }) => {
      if (!v || typeof v !== 'object' || (v.omitted === true && !valid(v))) return
      const own =
        v.sourceId === source.sourceId && v.contentHash === source.contentHash
          ? { sourceId: v.sourceId, contentHash: v.contentHash }
          : identity
      if (valid(v)) result.push(v)
      if (own) {
        // Read/search text and exact citations can be shown without carrying identity on each child.
        const e = {
          ...own,
          start: v.offset ?? v.start,
          end: v.endOffset ?? v.end,
          text: v.text ?? v.quote,
        }
        if (valid(e)) result.push(e)
      }
      for (const [key, value] of Object.entries(v)) if (key !== 'args') visit(value, own)
    }
    visit(packet)
    return result
  }
  const preview = (memory: ReturnType<typeof decisionMemory>) => {
    if (used >= 2) return undefined
    const fragments = (memory.latestToolResults?.tools ?? []).flatMap((t: any) =>
      t.tool === 'tool_result_read' && !t.omitted && valid(t.sourceRecovery)
        ? [t.sourceRecovery as Excerpt]
        : [],
    )
    const fresh = fragments.filter(
      (e) =>
        !shownTexts().some((t) => t.includes(e.text)) &&
        Array.from({ length: e.end - e.start }, (_, i) => e.start + i).some(
          (i) => !shown.has(i) && !restored.has(i),
        ),
    )
    const size = fresh.reduce((n, e) => n + Buffer.byteLength(e.text), 0)
    if (!fresh.length || size === 0 || recoveredBytes + size > 3000) return undefined
    return {
      kind: 'source-recovery-delivery' as const,
      fragments: fresh,
      bytes: size,
      used,
      maxUses: 2,
      maxBytes: 3000,
      factualProgress: false,
    }
  }
  return {
    preview,
    // Called only with the exact packet at request dispatch. Omitted data cannot earn credit.
    delivered(packet: any, allowance?: ReturnType<typeof preview>) {
      const fragments = visible(packet)
      const consumed =
        allowance &&
        allowance.used === used &&
        used < 2 &&
        recoveredBytes + allowance.bytes <= 3000 &&
        allowance.fragments.every((e) =>
          fragments.some((v) => v.start === e.start && v.end === e.end && v.text === e.text),
        )
      if (consumed) {
        used++
        recoveredBytes += allowance.bytes
      }
      shown.clear()
      const restoredInPacket: Excerpt[] = []
      const findRestored = (v: any) => {
        if (!v || typeof v !== 'object' || v.omitted === true) return
        if (v.tool === 'tool_result_read' && valid(v.sourceRecovery))
          restoredInPacket.push(v.sourceRecovery)
        for (const [key, value] of Object.entries(v)) if (key !== 'args') findRestored(value)
      }
      findRestored(packet)
      for (const e of restoredInPacket) for (let i = e.start; i < e.end; i++) restored.add(i)
      for (const e of fragments) {
        for (let i = e.start; i < e.end; i++) shown.add(i)
      }
      return {
        consumed: !!consumed,
        used,
        recoveredBytes,
        shownChars: shown.size,
        restoredChars: restored.size,
      }
    },
  }
}
