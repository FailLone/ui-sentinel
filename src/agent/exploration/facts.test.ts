import { describe, expect, it } from 'vitest'
import { normalizeFacts, type RawPlanningFacts } from './facts.ts'

/** Caller-supplied public facts. No browser, database, environment or file source is involved. */
function raw(overrides: Partial<RawPlanningFacts> = {}): RawPlanningFacts {
  return {
    schemaVersion: 'r1-exploration-input-1',
    requestId: 's01',
    task: { goal: '检查目录入口', localTask: '排列当前控件或交回', revision: 'task-1' },
    state: {
      pageId: 'p0',
      url: 'https://synthetic.invalid/view/0',
      documentVersion: 'doc-1',
      observationVersion: 'obs-1',
      relatedStateVersion: 'state-1',
      cacheable: false,
    },
    candidates: [
      {
        id: 'c1',
        targetKey: 'node-1',
        observationVersion: 'obs-1',
        text: '目录',
        role: 'button',
        publicState: { visible: true, enabled: true, expanded: false, selected: null },
        geometry: { x: 10, y: 10, width: 100, height: 30, inViewport: true },
        context: '隐藏的章节导航',
        allowedActions: ['click', 'inspect'],
        estimatedCost: 1,
      },
    ],
    history: [],
    scope: { revision: 'scope-1', executableCandidateIds: ['c1'] },
    budget: {
      revision: 'budget-1',
      remainingDecisions: 8,
      remainingActions: 8,
      remainingMs: 60000,
      maxRequestMs: 15000,
      remainingCostUsd: null,
    },
    limits: { maxCandidates: 32, maxInputBytes: 32768, maxHistory: 32 },
    view: { kind: 'anonymous', roleLabel: null, source: 'none', viewKey: 'anon' },
    ...overrides,
  }
}

describe('normalizeFacts', () => {
  it('accepts a well-formed fact set and reuses the exploration input contract verbatim', () => {
    const result = normalizeFacts(raw())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.input.candidates).toHaveLength(1)
    expect(result.value.input.requestId).toBe('s01')
    expect(result.value.view.viewKey).toBe('anon')
  })

  it('reports the declared view context without granting any authority', () => {
    const result = normalizeFacts(
      raw({
        view: { kind: 'declared', roleLabel: 'admin', source: 'page-banner', viewKey: 'decl-admin' },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.view.roleLabel).toBe('admin')
    // The normalized view exposes exactly these facts: no permission or authority field exists.
    expect(Object.keys(result.value.view).sort()).toEqual(['kind', 'roleLabel', 'source', 'viewKey'])
  })

  it('rejects a candidate whose observation version is not the current observation', () => {
    const value = raw()
    value.candidates[0].observationVersion = 'obs-0'
    const result = normalizeFacts(value)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('candidate-observation-stale')
  })

  it('rejects duplicate candidate identities', () => {
    const value = raw()
    // The same candidate id observed twice: identity is the id, not the text or position.
    value.candidates = [value.candidates[0], { ...value.candidates[0] }]
    value.scope.executableCandidateIds = ['c1']
    const result = normalizeFacts(value)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('candidate-id-duplicate')
  })

  it('keeps two same-text controls as distinct candidates rather than merging them', () => {
    const value = raw()
    value.candidates = [
      value.candidates[0],
      { ...value.candidates[0], id: 'c2', targetKey: 'node-2', context: '主内容区的同名标签' },
    ]
    value.scope.executableCandidateIds = ['c1', 'c2']
    const result = normalizeFacts(value)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.input.candidates.map((c) => c.targetKey)).toEqual(['node-1', 'node-2'])
  })

  it('rejects a scoped id that is not among the observed candidates', () => {
    const value = raw()
    value.scope.executableCandidateIds = ['c1', 'ghost']
    const result = normalizeFacts(value)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('scope-unknown-candidate')
  })

  it('rejects a missing or malformed view context', () => {
    const value = raw() as Partial<RawPlanningFacts>
    delete value.view
    const result = normalizeFacts(value)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('view-context-invalid')
  })

  it('never mutates the caller-supplied facts object and never throws', () => {
    const value = raw()
    const snapshot = JSON.stringify(value)
    normalizeFacts(value)
    expect(JSON.stringify(value)).toEqual(snapshot)
    expect(() => normalizeFacts(null)).not.toThrow()
    expect(normalizeFacts(null).ok).toBe(false)
  })
})