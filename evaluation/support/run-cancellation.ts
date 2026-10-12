/** Same cancellation notification used by the runner and the narrow window test. */
export function bindRunCancellation(
  signal: AbortSignal,
  current: () => { api: string; runId: string },
  request: typeof fetch = fetch,
) {
  const cancel = () => {
    const { api, runId } = current()
    if (api && runId)
      void request(`${api}/api/runs/${runId}/cancel`, { method: 'POST' }).catch(() => {})
  }
  signal.addEventListener('abort', cancel, { once: true })
  if (signal.aborted) cancel()
  return () => signal.removeEventListener('abort', cancel)
}
