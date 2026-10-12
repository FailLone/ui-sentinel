import { expect, it } from 'vitest'
import { checkHash } from '../../inspection/check-contract.ts'
import { PRODUCT_SKILL_REVISION } from '../../inspection/product-path.ts'
import { describeTarget, matchTarget, validPathProgram, type PathProgram } from './library.ts'
import { runPathProgram } from './runner.ts'
function harness() {
  const node = {
    selector: '#go',
    tag: 'button',
    name: 'Go',
    text: 'Go',
    visible: true,
    truncated: false,
    identity: 'new-node',
    attributes: { id: 'go' },
  }
  const page: any = { url: 'https://example.org/', complete: true, nodes: [node], total: 1 }
  const target = describeTarget(page, '#go', true)
  const body: any = {
    revision: 'path-reuse-1',
    skillRevision: PRODUCT_SKILL_REVISION,
    entryUrl: page.url,
    origin: 'https://example.org',
    source: { sourceId: 'source', contentHash: 'hash', version: '1' },
    plan: { steps: [{ action: 'click', targetName: 'Go', citation: { quote: 'Click Go' } }] },
    bindings: [{ control: target, result: target, preconditions: [] }],
  }
  const program = { id: 'path-' + checkHash(body), ...body } as PathProgram
  const events: any[] = [],
    calls: string[] = []
  let installed = false,
    cancelled = false,
    outcome = 'verified'
  const host: any = {
    programId: program.id,
    contract: { entryUrl: page.url, origin: program.origin, productSource: program.source },
    guard() {
      if (cancelled) throw Error('cancelled')
    },
    clean: () => true,
    remaining: () => ({ actions: 3, timeMs: 10000 }),
    observe: async () => {},
    page: async () => page,
    ref: async () => 'new-ref',
    install: async () => {
      installed = true
    },
    events: async () => events,
    status: async () => ({
      steps: installed
        ? [
            {
              index: 0,
              state: events.some((e) => e.type === 'action:executing') ? outcome : 'unverified',
              actual: ['fresh'],
              reason: 'new',
              actionId: 'new-action',
            },
          ]
        : [],
      nextAction: { args: { type: 'click', ref: 'new-ref', requirementId: 'new-requirement' } },
    }),
    emit: async (type: string, payload: any) => events.push({ type, payload }),
    call: async (name: string) => {
      calls.push(name)
      if (name === 'product_path_bind') return { bound: true }
      events.push({ type: 'action:executing', actionId: 'new-action', payload: { type: 'click' } })
      return { status: 'completed' }
    },
  }
  return {
    program,
    host,
    page,
    calls,
    events,
    cancel: () => {
      cancelled = true
    },
    unknown: () => {
      outcome = 'unverified'
    },
    fail: () => {
      outcome = 'failed'
    },
  }
}
it('rebinds with fresh arguments and distinguishes new measured failure', async () => {
  const h = harness()
  h.fail()
  const result = await runPathProgram(h.program, h.host)
  expect(result.status).toBe('measured-failure')
  expect(result.reason).toBe('new-measurement-failed')
  expect(h.calls).toEqual(['product_path_bind', 'page_act'])
  expect(result.actions).toHaveLength(1)
})
it.each(['source', 'origin', 'entry', 'tampered'])(
  'refuses %s mismatch before installing or dispatching',
  async (kind) => {
    const h = harness()
    if (kind === 'source') h.host.contract.productSource = { ...h.program.source, version: '2' }
    if (kind === 'origin') h.host.contract.origin = 'https://other.org'
    if (kind === 'entry') h.host.contract.entryUrl += '?other'
    if (kind === 'tampered') h.program.plan.steps[0]!.targetName = 'Other'
    expect((await runPathProgram(h.program, h.host)).status).toBe('handoff')
    expect(h.calls).toEqual([])
  },
)
it('does not import DOM identity or evidence in a stable target description', () => {
  const h = harness(),
    descriptor = describeTarget(h.page, '#go', true)
  expect(JSON.stringify(descriptor)).not.toContain('new-node')
  h.page.nodes[0].identity = 'different-run-node'
  expect(matchTarget(h.page, descriptor).identity).toBe('different-run-node')
  h.page.nodes.push({ ...h.page.nodes[0] })
  expect(() => matchTarget(h.page, descriptor)).toThrow('target-missing-or-ambiguous')
})
it('rejects node replacement between binding and dispatch', async () => {
  const h = harness(),
    call = h.host.call
  h.host.call = async (name: string) => {
    const result = await call(name)
    h.page.nodes[0].identity = 'replacement'
    return result
  }
  expect((await runPathProgram(h.program, h.host)).reason).toBe('live-node-replaced')
  expect(h.calls).toEqual(['product_path_bind'])
})
it('hands off unmet prerequisites without an action', async () => {
  const h = harness()
  h.host.call = async () => ({ error: 'product-precondition-missing' })
  expect((await runPathProgram(h.program, h.host)).reason).toBe('product-precondition-missing')
  expect(h.events.some((e) => e.type === 'action:executing')).toBe(false)
})
it('unknown execution preserves the original action and cannot loop/retry', async () => {
  const h = harness()
  h.unknown()
  const result = await runPathProgram(h.program, h.host)
  expect(result.status).toBe('handoff')
  expect(result.actions).toHaveLength(1)
  expect(result.readOnly).toBe(true)
  expect(result.remainingSteps).toEqual([0])
  expect(h.calls.filter((c) => c === 'page_act')).toHaveLength(1)
})
it.each(['before', 'after'])(
  'cancellation %s dispatch propagates and never retries',
  async (when) => {
    const h = harness(),
      call = h.host.call
    h.host.call = async (name: string) => {
      const result = await call(name)
      if (
        (when === 'before' && name === 'product_path_bind') ||
        (when === 'after' && name === 'page_act')
      )
        h.cancel()
      return result
    }
    await expect(runPathProgram(h.program, h.host)).rejects.toThrow('cancelled')
    expect(h.calls.filter((c) => c === 'page_act')).toHaveLength(when === 'before' ? 0 : 1)
    expect(h.events.some((e) => e.type === 'path-reuse:finished')).toBe(false)
  },
)
it('unknown-write exception retains isolation and is not mislabeled cache invalidation', async () => {
  const h = harness(),
    call = h.host.call
  h.host.call = async (name: string) => {
    const result = await call(name)
    if (name === 'page_act') throw Error('reconciliation-required')
    return result
  }
  await expect(runPathProgram(h.program, h.host)).rejects.toThrow('reconciliation-required')
  expect(h.calls.filter((c) => c === 'page_act')).toHaveLength(1)
})
it('budget boundary hands off without calling tools', async () => {
  const h = harness()
  h.host.remaining = () => ({ actions: 0, timeMs: 1 })
  expect((await runPathProgram(h.program, h.host)).reason).toBe('budget-insufficient')
  expect(h.calls).toHaveLength(0)
})
it('immutable program hash detects changes', () => {
  const h = harness()
  expect(validPathProgram(h.program)).toBe(true)
  h.program.bindings[0]!.result.selector = '#other'
  expect(validPathProgram(h.program)).toBe(false)
})

it('browser read errors retain execution failure rather than cache invalidation', async () => {
  const h = harness()
  h.host.page = async () => {
    throw Error('browser connection lost')
  }
  await expect(runPathProgram(h.program, h.host)).rejects.toThrow('browser connection lost')
  expect(h.calls).toHaveLength(0)
})

it.each(['rename', 'duplicate', 'result-parent'])(
  'revalidates %s after binding even if node identity is unchanged',
  async (change) => {
    const h = harness(),
      call = h.host.call
    h.host.call = async (name: string) => {
      const result = await call(name)
      if (name === 'product_path_bind') {
        if (change === 'rename') h.page.nodes[0].name = 'Other'
        if (change === 'duplicate')
          h.page.nodes.push({ ...h.page.nodes[0], selector: '#other', identity: 'other' })
        if (change === 'result-parent') {
          h.page.nodes[0].parentSelector = '#parent'
          h.page.nodes.push({
            ...h.page.nodes[0],
            selector: '#parent',
            tag: 'section',
            attributes: { 'aria-label': 'Other result' },
          })
        }
      }
      return result
    }
    const result = await runPathProgram(h.program, h.host)
    expect(result.status).toBe('handoff')
    expect(h.calls).toEqual(['product_path_bind'])
  },
)
it('persists invalidation when the original precondition gate refuses before dispatch callback', async () => {
  const h = harness()
  const call = h.host.call
  h.host.call = async (name: string) =>
    name === 'product_path_bind'
      ? call(name)
      : {
          error: 'path-reuse-invalidated-before-dispatch',
          reason: 'product-precondition-changed-before-action',
          dispatched: false,
        }
  const result = await runPathProgram(h.program, h.host)
  expect(result.status).toBe('handoff')
  expect(
    h.events.some(
      (e) =>
        e.type === 'path-regression:invalidated' &&
        e.payload.reason === 'product-precondition-changed-before-action',
    ),
  ).toBe(true)
  expect(result.actions).toEqual([])
})
it.each(['before-observation', 'after-binding'])(
  'reports actual entry change %s without dispatch',
  async (when) => {
    const h = harness(),
      call = h.host.call
    if (when === 'before-observation') h.page.url += '?moved=1'
    else
      h.host.call = async (name: string) => {
        const result = await call(name)
        if (name === 'product_path_bind') h.page.url += '?moved=1'
        return result
      }
    const result = await runPathProgram(h.program, h.host)
    expect(result.reason).toBe('entry-or-origin-mismatch')
    expect(result.actions).toEqual([])
    const event = h.events.find(
      (e) =>
        e.type ===
        (when === 'before-observation'
          ? 'path-regression:observed'
          : 'path-regression:invalidated'),
    )!
    expect((event.payload.comparison ?? event.payload).classification).toBe('entry-change')
  },
)
