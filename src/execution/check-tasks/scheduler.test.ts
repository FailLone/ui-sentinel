import { describe, it, expect } from 'vitest'
import { createSharedCheckBudget } from './budget.ts'
import { createCheckScheduler } from './scheduler.ts'
import type { CheckTaskInput, CheckResources, CheckTask, CheckResult } from './contract.ts'

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const input = (key: string): CheckTaskInput => ({
  version: 1,
  key,
  kind: 'element-measurement',
  purpose: key,
  target: { selector: 'h1' },
  start: { url: 'https://example.org/', viewport: { width: 320, height: 240 }, prerequisites: [] },
  publicFacts: [],
  evidenceRefs: [],
  permissions: { session: 'anonymous', writes: 'none', actions: 'none' },
  quota: { actions: 0, modelCalls: 0, reads: 2 },
  deadlineAt: Date.now() + 5000,
})
const result = (task: CheckTask): CheckResult => ({
  status: 'completed',
  evidenceRefs: ['a'],
  unchecked: [],
  measurements: [
    {
      measurementId: 'm',
      childTaskId: task.childTaskId,
      taskHash: task.taskHash,
      measuredAt: Date.now(),
      verified: true,
      evidenceRefs: ['a'],
      value: {},
    },
  ],
})
function fixture(overrides: Partial<Parameters<typeof createCheckScheduler>[0]> = {}) {
  const events: string[] = [],
    closed: string[] = []
  const controller = new AbortController()
  const usage = { actions: 0, modelCalls: 0, reads: 0 }
  const budget = createSharedCheckBudget({
    remaining: () => ({
      actions: 2 - usage.actions,
      modelCalls: 2 - usage.modelCalls,
      reads: 4 - usage.reads,
    }),
    charge: (k, n) => {
      usage[k] += n
    },
  })
  const host = createCheckScheduler({
    parentRunId: 'parent',
    contractHash: 'contract',
    signal: controller.signal,
    deadlineAt: Date.now() + 10000,
    budget,
    admit: async () => {},
    open: async (task, signal, lease, progress): Promise<CheckResources> => ({
      signal,
      budget: lease,
      progress,
      measure: async () => result(task).measurements[0],
      close: async () => {
        closed.push(task.key)
      },
    }),
    handler: async (task, resources) => {
      resources.budget.consume('reads')
      await pause(30)
      return result(task)
    },
    validateResult: async () => {},
    emit: async (type) => {
      events.push(type)
    },
    ...overrides,
  })
  return { host, controller, events, closed, budget, usage }
}
describe('bounded delegation ownership', () => {
  it('reserves concurrent quota synchronously and returns unused allowance once', () => {
    let reads = 0
    const b = createSharedCheckBudget({
      remaining: () => ({ actions: 0, modelCalls: 0, reads: 3 - reads }),
      charge: (_, n) => {
        reads += n
      },
    })
    const lease = b.reserve({ actions: 0, modelCalls: 0, reads: 2 })
    expect(() => b.reserve({ actions: 0, modelCalls: 0, reads: 2 })).toThrow('unavailable')
    lease.consume('reads')
    lease.release()
    lease.release()
    expect(b.held().reads).toBe(0)
    expect(reads).toBe(1)
    expect(() => lease.consume('reads')).toThrow('exhausted')
    expect(() => b.reserve({ actions: 0, modelCalls: 0, reads: -1 })).toThrow()
  })
  it('executes two child lifetimes concurrently, preserves identity and refuses third/nested authority', async () => {
    const f = fixture(),
      a = input('a'),
      b = input('b')
    const [first] = await Promise.all([f.host.submit(a), f.host.submit(b)])
    expect(f.host.status().filter((s) => s.status === 'running')).toHaveLength(2)
    expect((await f.host.submit(a)).task.childTaskId).toBe(first.task.childTaskId)
    await expect(f.host.submit({ ...a, purpose: 'changed' })).rejects.toThrow('idempotency')
    await expect(f.host.submit(input('c'))).rejects.toThrow('limit')
    await expect(f.host.submit({ ...a, depth: 2 })).rejects.toThrow()
    await f.host.wait(1000)
    expect(f.host.gaps()).toEqual([])
    expect(f.closed.sort()).toEqual(['a', 'b'])
    expect(f.usage.reads).toBe(2)
    expect(f.budget.held().reads).toBe(0)
    await f.host.close()
  })
  it('parent cancellation drains both, rejects late results and forbids late dispatch', async () => {
    const f = fixture()
    await Promise.all([f.host.submit(input('a')), f.host.submit(input('b'))])
    f.controller.abort(Error('cancelled'))
    await f.host.close()
    expect(f.host.status().every((s) => s.status === 'cancelled' && !s.result)).toBe(true)
    expect(f.host.gaps()).toHaveLength(2)
    await expect(f.host.submit(input('c'))).rejects.toThrow()
    expect(f.closed).toHaveLength(2)
  })
  it('cancelling one does not close its sibling and failures stay observable', async () => {
    const f = fixture({
      handler: async (t) => {
        await pause(30)
        if (t.key === 'bad') throw Error('child-failure')
        return result(t)
      },
    })
    const a = await f.host.submit(input('a'))
    await f.host.submit(input('bad'))
    f.host.cancel(a.task.childTaskId)
    await f.host.wait(1000)
    expect(f.host.status().map((s) => s.status)).toEqual(['cancelled', 'failed'])
    expect(f.host.status()[1].error).toContain('child-failure')
    await f.host.close()
  })
  it('drains an in-flight preparation before closing and releases all quota', async () => {
    const f = fixture({
      admit: async () => {
        await pause(30)
      },
    })
    const submit = f.host.submit(input('a')).catch((e) => String(e))
    const close = f.host.close()
    expect(f.budget.held().reads).toBe(2)
    await close
    await submit
    expect(f.budget.held().reads).toBe(0)
    expect(f.host.status()[0].status).toBe('cancelled')
  })
  it('rejects expired results, forged completion, evidence errors and close errors', async () => {
    for (const options of [
      {
        handler: async (t: CheckTask) => {
          await pause(50)
          return result(t)
        },
      },
      { handler: async (t: CheckTask) => ({ ...result(t), unchecked: ['not done'] }) },
      {
        validateResult: async () => {
          throw Error('evidence-owner-mismatch')
        },
      },
      {
        open: async () => {
          throw Error('prepare-failed')
        },
      },
    ]) {
      const f = fixture(options),
        request = input('a')
      if ('handler' in options) request.deadlineAt = Date.now() + 25
      await f.host.submit(request)
      await f.host.wait(1000)
      expect(f.host.gaps()).toHaveLength(1)
      expect(f.budget.held().reads).toBe(0)
      expect(f.host.status()[0].result).toBeUndefined()
      await f.host.close()
    }
  })
  it('keeps rejected admission observable without starting resources or losing budget', async () => {
    const f = fixture({
      admit: async () => {
        throw Error('check-v1-read-only')
      },
    })
    await expect(f.host.submit(input('a'))).rejects.toThrow('check-v1-read-only')
    await f.host.wait(1000)
    expect(f.events).toEqual(['check-task:submitted', 'check-task:terminal'])
    expect(f.host.status()[0].status).toBe('failed')
    expect(f.budget.held().reads).toBe(0)
    expect(f.closed).toEqual([])
    await f.host.close()
  })
  it('propagates durable event failures at parent close', async () => {
    const f = fixture({
      emit: async (type) => {
        if (type === 'check-task:terminal') throw Error('storage-failed')
      },
    })
    await f.host.submit(input('a'))
    await expect(f.host.wait(1000)).rejects.toThrow('storage-failed')
    await expect(f.host.close()).rejects.toThrow('storage-failed')
  })
})

it('protects held parent action/model capacity and charges each child exactly once', () => {
  const usage = { actions: 0, modelCalls: 0, reads: 0 }
  const limits = { actions: 3, modelCalls: 4, reads: 4 }
  const budget = createSharedCheckBudget({
    remaining: () => ({
      actions: limits.actions - usage.actions,
      modelCalls: limits.modelCalls - usage.modelCalls,
      reads: 4,
    }),
    charge: (kind, amount) => {
      usage[kind] += amount
    },
  })
  const first = budget.reserve({ actions: 2, modelCalls: 3, reads: 0 })
  expect(limits.actions - usage.actions - budget.held().actions).toBe(1)
  expect(limits.modelCalls - usage.modelCalls - budget.held().modelCalls).toBe(1)
  usage.modelCalls++ // One admitted main-model request uses the unreserved remainder.
  expect(() => budget.reserve({ actions: 1, modelCalls: 1, reads: 0 })).toThrow('unavailable')
  first.consume('actions')
  first.consume('modelCalls')
  first.release()
  const second = budget.reserve({ actions: 2, modelCalls: 2, reads: 0 })
  second.consume('modelCalls', 2)
  expect(() => second.consume('modelCalls')).toThrow('exhausted')
  second.release()
  expect(usage).toEqual({ actions: 1, modelCalls: 4, reads: 0 })
  expect(budget.held()).toEqual({ actions: 0, modelCalls: 0, reads: 0 })
})
