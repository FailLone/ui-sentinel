import type { RunEvent } from '../shared/types.ts'
export const terminalStatuses = new Set([
  'completed',
  'blocked',
  'timed-out',
  'cancelled',
  'execution-error',
  'interrupted',
])
export function mergeEvents(
  previous: readonly RunEvent[],
  incoming: readonly RunEvent[],
): RunEvent[] {
  const byId = new Map(previous.map((event) => [event.id, event]))
  for (const event of incoming) byId.set(event.id, event)
  return [...byId.values()].sort((a, b) => a.seq - b.seq)
}
export function artifactUrl(runId: string, id: string): string {
  return `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(id)}`
}

export function executionStage(
  events: readonly RunEvent[],
  now = Date.now(),
): { label: string; elapsedSeconds?: number; deadlineAt?: number } {
  const pendingModels = new Map<string, RunEvent>(),
    pendingTools = new Map<string, RunEvent>()
  const responding = new Set<string>()
  let phase = '探索'
  for (const event of events) {
    const p = event.payload
    if (event.type === 'model:request-started') pendingModels.set(String(p.attemptId), event)
    if (event.type === 'model:request-finished') pendingModels.delete(String(p.attemptId))
    if (event.type === 'tool:started') {
      pendingTools.set(String(p.toolCallId), event)
      responding.add(String(p.attemptId))
    }
    if (event.type === 'tool:finished') pendingTools.delete(String(p.toolCallId))
    if (event.type === 'run:phase-changed')
      phase = p.to === 'finalizing' ? '收尾' : p.to === 'verifying' ? '验证' : '探索'
    if (event.type === 'run:completed') return { label: '已结束' }
  }
  const tool = [...pendingTools.values()].at(-1),
    model = [...pendingModels.values()].at(-1)
  const active = tool ?? model
  if (!active) return { label: phase }
  const p = active.payload
  return {
    label: tool
      ? `执行工具：${String(p.tool)}`
      : responding.has(String(p.attemptId))
        ? '处理工具结果'
        : '等待模型响应',
    elapsedSeconds: Math.max(0, Math.floor((now - Number(p.startedAt)) / 1000)),
    deadlineAt: tool || !responding.has(String(p.attemptId)) ? Number(p.deadlineAt) : undefined,
  }
}
