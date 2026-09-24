import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Finding, RuleProposal, RunEvent, RunReport } from '../shared/types.ts'
import { artifactUrl, mergeEvents, terminalStatuses, executionStage } from './state.ts'
import './style.css'

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  )
  const value = await response.json()
  if (!response.ok)
    throw new Error(
      [value.error, value.message, value.missing?.join(', ')].filter(Boolean).join(': ') ||
        `HTTP ${response.status}`,
    )
  return value as T
}
type Report = RunReport & {
  artifacts?: {
    id: string
    kind?: string
    metadata?: { annotation?: boolean; sourceRef?: string }
  }[]
  evidenceRefs?: string[]
  evaluations?: unknown[]
  persistence?: { status: string; issues: string[] }
  coverage?: unknown
  hypotheses?: unknown[]
  business?: {
    status: 'versioned' | 'legacy-unversioned'
    profileId: string | null
    revision: string | null
    hash: string | null
    adapter: { id: string; revision: string } | null
    requirements: { id: string; revision: string; text: string; source: unknown }[]
    effects: { maxCreates: number; maxRetriesPerOperation: number } | null
    environment: { id: string; entryUrl: string; publicOrigin: string } | null
    integrity: 'verified' | 'hash-mismatch' | 'not-applicable'
  }
}

/** The public catalogue entry for a business profile. Carries no ports, tokens or answers. */
type ProfileOption = {
  id: string
  revision: string
  name: string
  description: string
  environments: readonly string[]
  defaultEnvironment: string
}

/**
 * The business the workbench offers.
 *
 * A profile's own `defaultEnvironment` and `entryUrl` come from the server's contract resolution,
 * never from a client-side guess: the environment a run belongs to is part of what is being
 * verified, so the workbench must not decide it. The goal text is a plain starting point, not a
 * hint about what to find.
 */
const DEFAULT_GOALS: Record<string, string> = {
  checkout: '检查购买流程，验证主要操作可用、业务结果明确以及失败后的恢复路径。',
  export: '使用公开数据集生成一份 CSV 导出，检查该流程及其实际触发的恢复体验，有依据地报告并结束。',
}
function FindingCard({
  finding,
  runId,
  onProposal,
}: {
  finding: Finding
  runId: string
  onProposal: (proposal: RuleProposal) => void
}) {
  const [reason, setReason] = useState(''),
    [message, setMessage] = useState('')
  const [verdict, setVerdict] = useState('confirmed')
  async function feedback() {
    try {
      await api(`/api/findings/${encodeURIComponent(finding.id)}/feedback`, { verdict, reason })
      setMessage('反馈已保存')
    } catch (error) {
      setMessage(String(error))
    }
  }
  async function propose() {
    try {
      const proposal = await api<RuleProposal>('/api/rule-proposals', { findingId: finding.id })
      onProposal(proposal)
      setMessage('候选已生成，请审阅条件和验证结果')
    } catch (error) {
      setMessage(String(error))
    }
  }
  return (
    <article>
      <h3>{finding.title}</h3>
      <p>
        {finding.severity} · {finding.validationStatus} · {finding.source}{' '}
        {finding.ruleId ?? finding.hypothesisId}
      </p>
      <p>预期：{finding.expected}</p>
      <p>实际：{finding.actual}</p>
      <p>步骤：{finding.stepId ?? '未关联'}</p>
      <div className="evidence">
        {finding.evidenceRefs.map((id) => (
          <Evidence key={id} id={id} runId={runId} />
        ))}
      </div>
      <label>
        反馈
        <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
          <option value="confirmed">确认问题</option>
          <option value="intentional">符合预期</option>
          <option value="cannot-reproduce">无法复现</option>
          <option value="deferred">暂缓</option>
        </select>
      </label>
      <label>
        原因
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <button onClick={feedback}>保存反馈</button> <button onClick={propose}>生成规则候选</button>
      <p role="status">{message}</p>
    </article>
  )
}
function Evidence({
  id,
  runId,
  kind,
  metadata,
}: {
  id: string
  runId: string
  kind?: string
  metadata?: { annotation?: boolean; sourceRef?: string }
}) {
  const url = artifactUrl(runId, id)
  const image = /\.(png|jpe?g|webp)$/i.test(id) || /screenshot|image|annotated/i.test(kind ?? '')
  return (
    <figure>
      <a href={url} target="_blank" rel="noreferrer">
        {image ? <img src={url} alt={`现场证据 ${id}`} loading="lazy" /> : id}
      </a>
      <figcaption>
        {metadata?.annotation ? '红框标注副本 · ' : image ? '现场截图 · ' : ''}
        {id}
        {metadata?.sourceRef && <span> · 原图 {metadata.sourceRef}</span>}
      </figcaption>
    </figure>
  )
}
function ProposalCard({ initial }: { initial: RuleProposal }) {
  const [proposal, setProposal] = useState(initial),
    [message, setMessage] = useState('')
  const [defects, setDefects] = useState('[]'),
    [healthy, setHealthy] = useState('[]')
  async function action(path: string, body: unknown) {
    try {
      await api(`/api/rule-proposals/${encodeURIComponent(proposal.id)}/${path}`, body)
      setProposal(await api(`/api/rule-proposals/${encodeURIComponent(proposal.id)}`))
      setMessage('已保存')
    } catch (error) {
      setMessage(String(error))
    }
  }
  return (
    <article>
      <h3>规则候选 {proposal.id}</h3>
      <p>状态：{proposal.status}</p>
      <pre>{JSON.stringify(proposal.ruleConfig, null, 2)}</pre>
      <h4>验证结果</h4>
      <pre>
        {JSON.stringify(
          { positive: proposal.positiveResults, negative: proposal.negativeResults },
          null,
          2,
        )}
      </pre>
      <label>
        异常用例（TransitionObservation JSON 数组）
        <textarea value={defects} onChange={(e) => setDefects(e.target.value)} />
      </label>
      <label>
        正常用例（TransitionObservation JSON 数组）
        <textarea value={healthy} onChange={(e) => setHealthy(e.target.value)} />
      </label>
      <button
        onClick={() => {
          try {
            void action('validate', {
              positiveInputs: JSON.parse(defects).map((v: unknown) => JSON.stringify(v)),
              negativeInputs: JSON.parse(healthy).map((v: unknown) => JSON.stringify(v)),
            })
          } catch {
            setMessage('请输入有效 JSON 数组')
          }
        }}
      >
        运行正反与缺失事实验证
      </button>{' '}
      <button onClick={() => action('review', { action: 'approve', reviewedBy: 'local-human' })}>
        人工批准
      </button>{' '}
      <button onClick={() => action('review', { action: 'reject', reviewedBy: 'local-human' })}>
        拒绝
      </button>{' '}
      <button disabled={proposal.status !== 'approved'} onClick={() => action('enable', {})}>
        启用已批准规则
      </button>
      <p role="status">{message}</p>
    </article>
  )
}
function App() {
  const [runId, setRunId] = useState(
    new URLSearchParams(location.search).get('run') ??
      localStorage.getItem('sentinel:lastRun') ??
      '',
  )
  const [openId, setOpenId] = useState(runId),
    [goal, setGoal] = useState(DEFAULT_GOALS.checkout!)
  const [profiles, setProfiles] = useState<readonly ProfileOption[]>([])
  const [profileId, setProfileId] = useState('checkout')
  const [health, setHealth] = useState('连接中'),
    [ready, setReady] = useState(false),
    [error, setError] = useState('')
  const [events, setEvents] = useState<RunEvent[]>([]),
    [report, setReport] = useState<Report | null>(null),
    [proposals, setProposals] = useState<RuleProposal[]>([])
  const [proposalId, setProposalId] = useState('')
  useEffect(() => {
    let stopped = false
    const check = async () => {
      try {
        const h = await api<{ model: { ready: boolean; missing: string[] } }>('/api/health')
        if (!stopped) {
          setReady(h.model.ready)
          setHealth(h.model.ready ? '服务就绪' : `模型待配置：${h.model.missing.join(', ')}`)
        }
      } catch {
        if (!stopped) {
          setReady(false)
          setHealth('服务连接失败')
        }
      }
    }
    void check()
    const timer = setInterval(check, 15_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [])
  // The catalogue of businesses this build can run. Loaded once: it is configuration, not run
  // state, and a failure here is surfaced rather than silently falling back to a default business.
  useEffect(() => {
    let stopped = false
    void api<{ profiles: ProfileOption[] }>('/api/business-profiles')
      .then((body) => {
        if (!stopped) setProfiles(body.profiles)
      })
      .catch((failure) => {
        if (!stopped) setError(String(failure))
      })
    return () => {
      stopped = true
    }
  }, [])
  useEffect(() => {
    setEvents([])
    setReport(null)
    setError('')
    if (!runId) return
    localStorage.setItem('sentinel:lastRun', runId)
    history.replaceState(null, '', `/?run=${encodeURIComponent(runId)}`)
    let stopped = false,
      cursor = -1,
      timer: ReturnType<typeof setTimeout> | undefined
    const poll = async () => {
      let done = false
      try {
        const [next, current] = await Promise.all([
          api<RunEvent[]>(`/api/runs/${encodeURIComponent(runId)}/events?after=${cursor}`),
          api<Report>(`/api/runs/${encodeURIComponent(runId)}/report`),
        ])
        if (stopped) return
        setEvents((previous) => mergeEvents(previous, next))
        cursor = Math.max(cursor, ...next.map((event) => event.seq))
        setReport(current)
        setError('')
        done = terminalStatuses.has(current.status)
        // Fetch one final tail after observing the persisted terminal report.
        if (done) {
          const tail = await api<RunEvent[]>(
            `/api/runs/${encodeURIComponent(runId)}/events?after=${cursor}`,
          )
          if (!stopped) setEvents((previous) => mergeEvents(previous, tail))
        }
      } catch (failure) {
        if (!stopped) setError(String(failure))
      }
      if (!stopped && !done) timer = setTimeout(poll, 1500)
    }
    void poll()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [runId])
  async function start() {
    try {
      setError('')
      const profile = profiles.find((p) => p.id === profileId)
      if (!profile) throw new Error('请选择业务配置')
      // The environment is the profile's own declared default, taken from the catalogue rather
      // than assumed here - a mismatch would be refused by the API anyway, and silently sending
      // `arena` for the export business would make the selection look honoured when it was not.
      const result = await api<{ runId: string }>('/api/runs', {
        goal,
        environmentId: profile.defaultEnvironment,
        businessProfile: { id: profile.id, revision: profile.revision },
      })
      setRunId(result.runId)
      setOpenId(result.runId)
    } catch (failure) {
      setError(String(failure))
    }
  }
  async function cancel() {
    try {
      await api(`/api/runs/${encodeURIComponent(runId)}/cancel`, {})
      setError('取消请求已接收，等待执行层停止并清理。')
    } catch (failure) {
      setError(String(failure))
    }
  }
  const stage = executionStage(events)
  const addProposal = (proposal: RuleProposal) =>
    setProposals((previous) => [...previous.filter((p) => p.id !== proposal.id), proposal])
  return (
    <main>
      <header>
        <h1>
          UI Sentinel <small>界面哨兵</small>
        </h1>
        <p>{health}</p>
      </header>
      <section>
        <h2>开始检查</h2>
        <label>
          业务配置
          <select
            value={profileId}
            onChange={(e) => {
              const next = e.target.value
              setProfileId(next)
              // The goal text is a starting point for that business, not a hint about findings.
              setGoal(DEFAULT_GOALS[next] ?? '')
            }}
          >
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}（{profile.id}@{profile.revision}）
              </option>
            ))}
          </select>
        </label>
        <label>
          检查目标
          <textarea value={goal} onChange={(e) => setGoal(e.target.value)} />
        </label>
        <p>
          环境：
          {profiles.find((p) => p.id === profileId)?.environments.join('、') ?? '加载中'}
          {profiles.length === 0 && ' · 业务配置加载失败时不会回退到默认业务'}
        </p>
        <button disabled={!ready || !goal.trim() || !profiles.length} onClick={start}>
          开始检查
        </button>
        <hr />
        <label>
          恢复历史运行
          <input value={openId} onChange={(e) => setOpenId(e.target.value)} />
        </label>
        <button disabled={!openId.trim()} onClick={() => setRunId(openId.trim())}>
          打开运行
        </button>
      </section>
      {error && <p role="alert">{error}</p>}
      {report && (
        <>
          <section>
            <h2>运行 {runId}</h2>
            {!terminalStatuses.has(report.status) && (
              <p aria-live="polite">
                当前：{stage.label}
                {stage.elapsedSeconds !== undefined ? ` · 已等待 ${stage.elapsedSeconds} 秒` : ''}
                {stage.deadlineAt
                  ? ` · 截止 ${new Date(stage.deadlineAt).toLocaleTimeString()}`
                  : ''}
              </p>
            )}
            <p>
              {report.persistence?.status === 'inconsistent' && (
                <strong>
                  执行记录不完整，完成结果未获验证。请先核对业务状态，勿重复提交。
                  <br />
                </strong>
              )}
              执行：{report.status} · 业务：{report.businessResult} · 停止原因：
              {report.stopReason ?? '尚未停止'}
            </p>
            {report.business && (
              <div className="business">
                {report.business.status === 'legacy-unversioned' ? (
                  // A real state, not a missing value: this run executed before contracts were
                  // versioned, so today's requirements would be a fabrication.
                  <p>
                    <strong>未版本化历史运行。</strong>
                    该任务创建于业务契约存在之前，不套用当前业务要求；其日志与证据仍可核对。
                  </p>
                ) : (
                  <>
                    <p>
                      业务契约：{report.business.profileId}@{report.business.revision} · 适配器{' '}
                      {report.business.adapter?.id}@{report.business.adapter?.revision} · 环境{' '}
                      {report.business.environment?.id}
                      {report.business.integrity === 'hash-mismatch' && (
                        <strong> · 契约哈希与内容不一致，本次结果不可作为该契约的证据</strong>
                      )}
                    </p>
                    <details>
                      <summary>当次要求（{report.business.requirements.length}）</summary>
                      <p>
                        hash <code>{report.business.hash}</code> · 写入上限{' '}
                        {report.business.effects?.maxCreates} · 每次操作重试上限{' '}
                        {report.business.effects?.maxRetriesPerOperation}
                      </p>
                      <ul>
                        {report.business.requirements.map((requirement) => (
                          <li key={`${requirement.id}@${requirement.revision}`}>
                            {requirement.text}
                            <small>
                              {' '}
                              （{requirement.id}@{requirement.revision}）
                            </small>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
              </div>
            )}
            <p>
              动作 {report.usage.actions} · 模型请求 {report.usage.modelCalls} · 耗时{' '}
              {(report.usage.elapsedMs / 1000).toFixed(1)} 秒 · 输入/输出 token{' '}
              {report.usage.modelInputTokens ?? 'unavailable'} /{' '}
              {report.usage.modelOutputTokens ?? 'unavailable'}
            </p>
            <p>
              规则执行 {report.evaluatedRuleCount} 次 · unknown {report.unknownCount}；未检查和
              unknown 不代表通过。
            </p>
            {!terminalStatuses.has(report.status) && <button onClick={cancel}>请求取消</button>}{' '}
            <a
              href={`/api/runs/${encodeURIComponent(runId)}/report`}
              target="_blank"
              rel="noreferrer"
            >
              JSON 报告
            </a>
            <details>
              <summary>覆盖、规则与假设</summary>
              <pre>
                {JSON.stringify(
                  {
                    exploredStates: report.exploredStates,
                    unexploredBranches: report.unexploredBranches,
                    coverage: report.coverage,
                    evaluations: report.evaluations,
                    hypotheses: report.hypotheses,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          </section>
          <section>
            <h2>问题与反馈</h2>
            {report.findings.length ? (
              report.findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  runId={runId}
                  onProposal={addProposal}
                />
              ))
            ) : (
              <p>尚无发现；这不表示页面已经通过全部检查。</p>
            )}
          </section>
          <section>
            <h2>现场证据</h2>
            <div className="evidence">
              {(report.artifacts ?? (report.evidenceRefs ?? []).map((id) => ({ id }))).map(
                (artifact) => (
                  <Evidence key={artifact.id} {...artifact} runId={runId} />
                ),
              )}
            </div>
          </section>
        </>
      )}
      {runId && (
        <section>
          <h2>执行时间线 · {events.length}</h2>
          <div className="timeline">
            {events.map((event) => (
              <details key={event.id}>
                <summary>
                  {event.seq} · {event.timestamp} · {event.type}
                </summary>
                <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                <div className="evidence">
                  {event.evidenceRefs.map((id) => (
                    <Evidence key={id} id={id} runId={runId} />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
      <section>
        <h2>规则候选审阅</h2>
        <label>
          候选 ID
          <input value={proposalId} onChange={(e) => setProposalId(e.target.value)} />
        </label>
        <button
          onClick={async () => {
            try {
              addProposal(await api(`/api/rule-proposals/${encodeURIComponent(proposalId)}`))
            } catch (failure) {
              setError(String(failure))
            }
          }}
        >
          打开候选
        </button>
        {proposals.map((proposal) => (
          <ProposalCard key={`${proposal.id}:${proposal.updatedAt}`} initial={proposal} />
        ))}
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
