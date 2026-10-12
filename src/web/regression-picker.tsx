import { useEffect, useState } from 'react'
type Candidate = {
  runId: string
  title: string
  createdAt: string
  sourceVersion: string
  steps: string[]
  message: string
}
export function RegressionPicker({
  entryUrl,
  selected,
  onSelect,
}: {
  entryUrl: string
  selected: string
  onSelect(id: string): void
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    setCandidates([])
    setMessage('')
    setLoading(true)
    const abort = new AbortController()
    const timer = setTimeout(async () => {
      try {
        if (!entryUrl.trim()) return
        const response = await fetch(
          '/api/regression-baselines?entryUrl=' + encodeURIComponent(entryUrl.trim()),
          { signal: abort.signal },
        )
        const result = await response.json()
        // A reply already decoded before cancellation can still resolve after a URL edit.
        if (abort.signal.aborted) return
        if (!response.ok) throw Error(result.error)
        setCandidates(result.candidates)
        setMessage(
          result.candidates.length
            ? '选择历史检查后，提交本次资料以核对变化。每个通过项都会重新操作和测量。'
            : '最近 20 个同入口已完成检查中暂无可用健康路径；可先完成一次检查。',
        )
      } catch {
        if (!abort.signal.aborted) setMessage('历史检查读取失败，请核对网址或服务连接。')
      } finally {
        if (!abort.signal.aborted) setLoading(false)
      }
    }, 300)
    return () => {
      abort.abort()
      clearTimeout(timer)
    }
  }, [entryUrl])
  const chosen = candidates.find((c) => c.runId === selected)
  return (
    <section aria-label="重复检查选择">
      <label>
        沿用历史检查（可选）
        <select value={selected} disabled={loading} onChange={(e) => onSelect(e.target.value)}>
          <option value="">不沿用，重新调查</option>
          {candidates.map((c) => (
            <option key={c.runId} value={c.runId}>
              {c.title} · 版本 {c.sourceVersion} · {c.createdAt} · {c.runId.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <p role="status">{loading ? '正在读取同入口历史…' : message}</p>
      {chosen && (
        <p>
          建议尝试重新测量：{chosen.steps.join(' → ')}。{chosen.message}
        </p>
      )}
    </section>
  )
}
