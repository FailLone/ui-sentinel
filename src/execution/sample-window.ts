/** Anchor samples to a clock grid rather than adding RPC latency to every interval. */
export async function sampleWindow<T>(options: {
  durationMs: number
  sample: () => Promise<T>
  guard: () => void
  now?: () => number
  wait?: (ms: number) => Promise<void>
}) {
  const now = options.now ?? Date.now
  const wait = options.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const startedAtMs = now()
  const deadline = startedAtMs + options.durationMs
  const samples: { atMs: number; value: T }[] = []
  // The rule permits a 250ms boundary gap. Leave 50ms for ordinary browser RPC jitter;
  // a larger actual gap remains unknown under the unchanged evaluator.
  const cadenceMs = 200
  while (true) {
    options.guard()
    const value = await options.sample()
    options.guard()
    const atMs = now()
    samples.push({ atMs, value })
    if (atMs >= deadline) break
    const nextTick = startedAtMs + (Math.floor((atMs - startedAtMs) / cadenceMs) + 1) * cadenceMs
    await wait(Math.max(0, Math.min(nextTick, deadline) - now()))
  }
  return { startedAtMs, samples }
}
