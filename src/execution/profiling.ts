import { AsyncLocalStorage } from 'node:async_hooks'

export interface ExecutionSpan {
  id: number
  parentId?: number
  kind: string
  startMs: number
  endMs: number
  status: 'success' | 'error' | 'unfinished'
  attributes: Record<string, string>
}

/** Exclusive wall time, including overlaps, rather than a sum of nested durations. */
export function summarizeSpans(spans: readonly ExecutionSpan[], wallMs: number) {
  const bounds = [...new Set([0, wallMs, ...spans.flatMap((s) => [s.startMs, s.endMs])])]
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= wallMs)
    .sort((a, b) => a - b)
  const byId = new Map(spans.map((s) => [s.id, s]))
  const depth = (s: ExecutionSpan): number => {
    const seen = new Set([s.id])
    let n = 0
    while (s.parentId !== undefined && byId.has(s.parentId) && !seen.has(s.parentId)) {
      seen.add(s.parentId)
      s = byId.get(s.parentId)!
      n++
    }
    return n
  }
  const depths = new Map(spans.map((s) => [s.id, depth(s)]))
  const exclusiveMs: Record<string, number> = {}
  for (let i = 1; i < bounds.length; i++) {
    const start = bounds[i - 1]!,
      end = bounds[i]!
    const active = spans.filter((s) => s.startMs <= start && s.endMs >= end)
    // Concurrent peer spans are explicitly attributed as overlap, never counted twice.
    const deepest = Math.max(-1, ...active.map((s) => depths.get(s.id)!))
    const leaves = active.filter((s) => depths.get(s.id) === deepest)
    const kind = leaves.length > 1 ? 'overlap' : (leaves[0]?.kind ?? 'unattributed')
    exclusiveMs[kind] = (exclusiveMs[kind] ?? 0) + end - start
  }
  const inclusiveMs: Record<string, number> = {}
  for (const s of spans)
    inclusiveMs[s.kind] =
      (inclusiveMs[s.kind] ?? 0) + Math.max(0, Math.min(wallMs, s.endMs) - Math.max(0, s.startMs))
  return {
    wallMs,
    exclusiveMs,
    inclusiveMs,
    unfinished: spans.filter((s) => s.status === 'unfinished').length,
  }
}

const scope = new AsyncLocalStorage<{ profile: ExecutionProfile; parentId?: number }>()
export class ExecutionProfile {
  readonly startedAt = Date.now()
  private readonly clockStart: number
  private spans: ExecutionSpan[] = []
  private closed = false
  private finishedWallMs: number | undefined
  constructor(private readonly clock: () => number = () => performance.now()) {
    this.clockStart = clock()
  }
  run<T>(fn: () => T): T {
    return scope.run({ profile: this }, fn)
  }
  async measure<T>(
    kind: string,
    fn: () => Promise<T>,
    attributes: Record<string, string> = {},
  ): Promise<T> {
    if (this.closed) return fn()
    const parent = scope.getStore()
    const span: ExecutionSpan = {
      id: this.spans.length + 1,
      ...(parent?.profile === this ? { parentId: parent.parentId } : {}),
      kind,
      startMs: this.clock() - this.clockStart,
      endMs: 0,
      status: 'unfinished',
      attributes,
    }
    this.spans.push(span)
    try {
      const value = await scope.run({ profile: this, parentId: span.id }, fn)
      if (!this.closed) span.status = 'success'
      return value
    } catch (error) {
      if (!this.closed) span.status = 'error'
      throw error
    } finally {
      if (!this.closed) span.endMs = this.clock() - this.clockStart
    }
  }
  finish(requests: readonly { startedAt: number; durationMs: number; purpose: string }[] = []) {
    const wallMs = this.finishedWallMs ?? this.clock() - this.clockStart
    this.finishedWallMs = wallMs
    if (!this.closed) {
      this.closed = true
      for (const s of this.spans) if (s.status === 'unfinished') s.endMs = wallMs
      for (const r of requests) {
        const startMs = Math.max(0, r.startedAt - this.startedAt)
        this.spans.push({
          id: this.spans.length + 1,
          kind: `${r.purpose}-wait`,
          startMs,
          endMs: Math.min(wallMs, startMs + r.durationMs),
          status: 'success',
          attributes: {},
        })
      }
    }
    return {
      version: '1',
      ...summarizeSpans(this.spans, wallMs),
      spans: this.spans.map((s) => ({ ...s })),
    }
  }
}
export function profileOperation<T>(
  kind: string,
  fn: () => Promise<T>,
  attributes: Record<string, string> = {},
): Promise<T> {
  return scope.getStore()?.profile.measure(kind, fn, attributes) ?? fn()
}
