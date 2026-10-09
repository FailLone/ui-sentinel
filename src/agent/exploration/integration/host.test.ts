import { describe, it, expect } from 'vitest'
import { createControlledHost, frameOf, semanticCompetition, digest } from './host.ts'
import { executeProgramTool, beginAttemptTool, guardModelAttempt } from '../../model/request.ts'
const checks = () => ({
  revision: 'item-checks-2',
  sourceReview: { state: 'sealed' },
  generic: { state: 'pending', evidenceRefs: [], eventIds: [] },
  effects: [],
})
const input = () => ({
  goal: 'Inspect Reveal first',
  observation: {
    url: 'http://127.0.0.1/',
    elements: [
      { ref: 'e1', tag: 'button', text: 'Other', visible: true, enabled: true },
      { ref: 'e2', tag: 'button', text: 'Reveal', visible: true, enabled: true },
    ],
  },
  inspectionScope: {
    candidates: [
      { itemId: 'one', ref: 'e1', snapshotId: 's1', category: 'local-interaction' },
      { itemId: 'two', ref: 'e2', snapshotId: 's1', category: 'local-interaction' },
    ],
    checks: [
      { itemId: 'one', checks: checks() },
      { itemId: 'two', checks: checks() },
    ],
    outstanding: [{ itemId: 'one' }, { itemId: 'two' }],
    checkInteractions: [],
  },
  evidenceIntegrity: { status: 'clean' },
  evidenceRefs: ['public.json'],
  budgetRemaining: { actions: 6, modelCalls: 12, timeMs: 10000 },
  activeTools: ['page_act', 'exploration_update', 'page_inspect', 'interaction_verify'],
})
const context = () => ({
  signal: new AbortController().signal,
  version: { key: 'state1', reusable: true, reason: 'static' },
})
describe('controlled host', () => {
  it('uses same frame facts, validates score identity, never replays dispatched items', async () => {
    const a = input(),
      host = createControlledHost({
        score: async (f) => ({
          binding: f.binding,
          packetHash: digest(f),
          kind: 'scores',
          orderedIds: ['two', 'one'],
        }),
      })
    expect(semanticCompetition(frameOf(a, 'state1', new Set()))).toBe(true)
    expect(await host.decide(a, context())).toMatchObject({
      kind: 'tool',
      tool: 'page_act',
      args: { name: 'Reveal' },
    })
    expect(await host.decide(a, context())).toMatchObject({ kind: 'tool', args: { name: 'Other' } })
    expect(await host.decide(a, context())).toMatchObject({ kind: 'handoff' })
  })
  it('does not score singleton or a public tie', async () => {
    let calls = 0
    const host = createControlledHost({
      score: async () => {
        calls++
        throw Error('unreachable')
      },
    })
    const a = input()
    a.goal = 'Inspect public controls'
    await host.decide(a, context())
    expect(calls).toBe(0)
  })
  it('returns useful handoff for unknown source, zero budget and non-bindable state', async () => {
    const a: any = input()
    a.inspectionScope.checks[0].checks.generic.actionId = 'original'
    a.inspectionScope.checks[0].checks.sourceReview.state = 'unresolved'
    expect(await createControlledHost().decide(a, context())).toMatchObject({
      kind: 'handoff',
      packet: { dom: a.observation, originalActions: [], evidenceRefs: ['public.json'] },
    })
    a.budgetRemaining.actions = 0
    expect(await createControlledHost().decide(a, context())).toMatchObject({
      reason: 'budget-insufficient',
    })
    const c = context()
    c.version.reusable = false
    expect(await createControlledHost().decide(input(), c)).toMatchObject({
      reason: 'state-not-reliably-bindable',
    })
  })
  it('rejects stale or alien scored candidates', async () => {
    for (const bad of ['hash', 'id']) {
      const h = createControlledHost({
        score: async (f) => ({
          binding: f.binding,
          packetHash: bad === 'hash' ? 'wrong' : digest(f),
          kind: 'scores',
          orderedIds: ['foreign', 'one'],
        }),
      })
      expect(await h.decide(input(), context())).toMatchObject({ kind: 'handoff' })
    }
  })
  it('cancellation stops a late decision before a tool is proposed', async () => {
    const c = new AbortController(),
      h = createControlledHost({
        score: async (f) => {
          c.abort()
          return {
            binding: f.binding,
            packetHash: digest(f),
            kind: 'scores',
            orderedIds: ['two', 'one'],
          }
        },
      })
    await expect(h.decide(input(), { ...context(), signal: c.signal })).rejects.toThrow()
  })
  it('shares original attempt guard and expires detached tool callbacks', async () => {
    let late: () => void = () => {}
    let id = ''
    await executeProgramTool(new AbortController().signal, 1000, async () => {
      id = beginAttemptTool()!
      late = () => guardModelAttempt()
    })
    expect(id).toMatch(/^program-/)
    const c = new AbortController()
    c.abort()
    await expect(executeProgramTool(c.signal, 1000, async () => 1)).rejects.toThrow()
    await expect(
      executeProgramTool(new AbortController().signal, 0, async () => 1),
    ).rejects.toThrow('budget-exhausted')
  })
})
