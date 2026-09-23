import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer } from 'node:http'
import { rm } from 'node:fs/promises'

const harness = vi.hoisted(() => ({ handler: null as any, models: 0 }))
vi.mock('../shared/config.ts', () => ({
  config: {
    databaseUrl: ':memory:',
    agentModel: 'openai/test-explicit-mock',
    visionModel: 'test',
    optimizations: { observation: true, ruleRouting: true },
    budget: {
      totalTimeoutMs: 20000,
      maxActions: 10,
      maxModelCalls: 20,
      toolTimeoutMs: 15000,
      modelRequestTimeoutMs: 10000,
      modelRequestMaxRetries: 1,
    },
  },
  checkModelConfig: () => ({ ready: true, missing: [] }),
}))
vi.mock('@mastra/core/agent', () => ({
  Agent: class {
    options: any
    constructor(options: any) {
      this.options = options
    }
    async generate(prompt: string) {
      harness.models++
      const toolResults = await harness.handler(this.options.tools, prompt)
      return {
        text: 'test model',
        toolResults: toolResults ?? [],
        usage: { inputTokens: 1, outputTokens: 1 },
      }
    }
  },
}))
vi.mock('./vision.ts', () => ({
  createVisionLocator: () => ({
    aiLocate: async () => {
      throw new Error('vision not used by deterministic fixture')
    },
  }),
}))
import { createRun, getRun, getEvents, getFindings } from './run-manager.ts'
import {
  startRunExecution,
  cancelRunExecution,
  executionBusy,
  acknowledgeReconciliation,
} from './executor.ts'
import { initDatabase, getDbClient } from '../storage/database.ts'
import { clearRules, registerRule } from '../rules/engine.ts'

import { overlayBlockingRule } from '../rules/builtin/overlay-blocking.ts'
import { compileTransitionRule } from '../rules/transition.ts'
let url = '',
  writes = 0,
  responseDelay = 0
const ids: string[] = []
const server = createServer((req, res) => {
  if (req.url?.startsWith('/bound-page')) {
    res.setHeader('content-type', 'text/html')
    res.end(
      `<h1>Checkout</h1><button onclick="fetch('/failed-payment',{method:'POST'}).then(r=>r.json()).then(()=>document.querySelector('h1').textContent='Payment failed order-failed')">Pay</button><button ${req.url.includes('disabled') ? 'disabled' : ''}>Try Again</button><button>Retry upload</button>`,
    )
    return
  }
  if (req.url === '/ambiguous') {
    res.setHeader('content-type', 'text/html')
    res.end('<button>Pay later</button><button>Pay</button><button>Pay</button>')
    return
  }
  if (req.url === '/failed-payment') {
    writes++
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify({
        success: false,
        status: 'failed',
        orderId: 'order-failed',
        message: 'Payment processing failed. Please try again.',
        canRetry: true,
      }),
    )
    return
  }
  if (req.url === '/retryable-page') {
    res.setHeader('content-type', 'text/html')
    res.end(
      `<h1>Checkout</h1><button onclick="fetch('/failed-payment',{method:'POST'}).then(r=>r.json()).then(()=>document.querySelector('h1').textContent='Payment processing failed. Please try again. order-failed')">Pay</button><button disabled>Retrying...</button>`,
    )
    return
  }
  if (req.url === '/purchase') {
    writes++
    res.setHeader('content-type', 'application/json')
    setTimeout(
      () => res.end(JSON.stringify({ success: true, status: 'success', orderId: 'order-1' })),
      responseDelay,
    )
    return
  }
  if (req.url === '/uncertain') {
    writes++
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end('{}')
    return
  }
  if (req.url === '/uncertain-page') {
    res.setHeader('content-type', 'text/html')
    res.end(`<button onclick="fetch('/uncertain',{method:'POST'})">Submit</button>`)
    return
  }
  if (req.url === '/closable-overlay') {
    res.setHeader('content-type', 'text/html')
    res.end(
      `<h1>Store</h1><button style="position:absolute;left:40px;top:40px;width:200px;height:60px" onclick="fetch('/purchase',{method:'POST'}).then(r=>r.json()).then(()=>document.querySelector('h1').textContent='Order Confirmed successfully order-1')">Buy</button><div style="position:fixed;inset:0;background:#ccc;z-index:100">Campaign<button onclick="this.parentElement.remove()">Close</button></div>`,
    )
    return
  }
  if (req.url === '/overlay') {
    res.setHeader('content-type', 'text/html')
    res.end(
      '<button style="position:absolute;left:40px;top:40px;width:200px;height:60px">Pay</button><div style="position:fixed;inset:0;background:#ccc;z-index:100">Campaign</div>',
    )
    return
  }
  res.setHeader('content-type', 'text/html')
  res.end(
    `<h1>Store</h1><button onclick="document.querySelector('h1').textContent='Processing...';fetch('/purchase',{method:'POST'}).then(r=>r.json()).then(()=>document.querySelector('h1').textContent='Order Confirmed successfully order-1')">Buy</button>`,
  )
})
beforeAll(async () => {
  await initDatabase()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  url = `http://127.0.0.1:${(server.address() as any).port}`
})
afterAll(async () => {
  server.close()
  await Promise.all(ids.map((id) => rm(`data/artifacts/${id}`, { recursive: true, force: true })))
})
beforeEach(() => {
  clearRules()
  writes = 0
  responseDelay = 0
  harness.models = 0
})
async function makeRun() {
  const r = await createRun({ goal: 'buy', environmentId: 'test', entryUrl: url })
  ids.push(r.id)
  return r
}
const call = (tools: any, name: string, input: any = {}) => tools[name].execute(input, {})

describe('executor with deterministic model and real browser (not model evaluation)', () => {
  it('supplies real DOM, executes schema tools, records evidence and verifies public business outcome', async () => {
    let phase = 0
    harness.handler = async (tools: any, prompt: string) => {
      const packet = JSON.parse(prompt)
      expect(packet.observation.a11yTree).toContain(phase ? 'Confirmed' : 'Buy')
      if (phase++ === 0) {
        const result = await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
        expect(result.inspection.finishAdvice.businessResult).toBe('success')
        expect(result.inspection.snapshotId).toBeTruthy()
      } else
        await call(tools, 'run_finish', {
          businessResult: 'success',
          blocked: false,
          summary: 'visible and response agree',
        })
    }
    const run = await makeRun()
    await startRunExecution(run.id)
    expect((await getRun(run.id))?.status).toBe('completed')
    expect(writes).toBe(1)
    const events = await getEvents(run.id)
    expect(events.some((e) => e.type === 'business:response')).toBe(true)
    const reused = events.find((e) => e.type === 'observation:reused')
    expect(reused).toBeTruthy()
    expect(reused!.payload.evidenceRefs).toEqual(
      events.find((e) => e.type === 'page:observed')!.evidenceRefs,
    )
    expect(events.some((e) => e.type === 'response:observed')).toBe(true)
    expect(
      events.filter((e) => e.type === 'page:observed').every((e) => e.evidenceRefs.length === 2),
    ).toBe(true)
    expect(new Set(events.map((e) => e.seq)).size).toBe(events.length)
  })
  it('does not dispatch a late action after cancellation while model is pending', async () => {
    let release!: () => void, entered!: () => void
    const ready = new Promise<void>((r) => (entered = r)),
      waiting = new Promise<void>((r) => (release = r))
    harness.handler = async (tools: any) => {
      entered()
      await waiting
      await call(tools, 'page_act', { type: 'click', selector: 'button' })
    }
    const run = await makeRun(),
      done = startRunExecution(run.id)
    await ready
    expect(await cancelRunExecution(run.id)).toBe(true)
    release()
    await done
    expect(writes).toBe(0)
    expect((await getRun(run.id))?.status).toBe('cancelled')
  })
  it('queues a second run and cancelling it never starts a browser/model', async () => {
    let release!: () => void, entered!: () => void
    const ready = new Promise<void>((r) => (entered = r)),
      waiting = new Promise<void>((r) => (release = r))
    harness.handler = async (tools: any) => {
      entered()
      await waiting
      await call(tools, 'run_finish', {
        businessResult: 'unknown',
        blocked: true,
        summary: 'stopped',
      })
    }
    const a = await makeRun(),
      b = await makeRun(),
      first = startRunExecution(a.id),
      second = startRunExecution(b.id)
    await ready
    expect(executionBusy()).toBe(true)
    expect((await getRun(b.id))?.status).toBe('queued')
    await cancelRunExecution(b.id)
    release()
    await Promise.all([first, second])
    expect(harness.models).toBe(1)
    expect((await getRun(b.id))?.status).toBe('cancelled')
    expect(executionBusy()).toBe(false)
  })
  it('persists hypothesis/evidence and rejects forged supported evidence', async () => {
    harness.handler = async (tools: any, prompt: string) => {
      const packet = JSON.parse(prompt)
      const hyp = await call(tools, 'hypotheses_record', {
        phenomenon: 'test observation',
        basis: 'visible UI',
        verificationPlan: 'inspect snapshot',
      })
      await expect(
        call(tools, 'findings_submit', {
          hypothesisId: hyp.id,
          validationStatus: 'supported',
          severity: 'info',
          title: 'test',
          expected: 'test',
          actual: 'test',
          evidenceRefs: ['forged.png'],
        }),
      ).rejects.toThrow('invalid evidence')
      await call(tools, 'findings_submit', {
        hypothesisId: hyp.id,
        validationStatus: 'candidate',
        severity: 'info',
        title: 'test',
        expected: 'test',
        actual: 'test',
        evidenceRefs: packet.evidenceRefs,
      })
      await call(tools, 'run_finish', { businessResult: 'unknown', blocked: true, summary: 'test' })
    }
    const run = await makeRun()
    await startRunExecution(run.id)
    expect(await getFindings(run.id)).toHaveLength(1)
    expect(
      (
        await getDbClient().execute({
          sql: 'SELECT * FROM hypotheses WHERE run_id=?',
          args: [run.id],
        })
      ).rows,
    ).toHaveLength(1)
  })
})

it('hard deadline settles even if a model provider ignores cancellation', async () => {
  harness.handler = async () => new Promise(() => {})
  const run = await createRun({
    goal: 'test deadline',
    environmentId: 'test',
    entryUrl: url,
    budget: { totalTimeoutMs: 600 },
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('timed-out')
  expect((await getRun(run.id))?.usage.modelInputTokens).toBeNull()
  expect(writes).toBe(0)
  expect(executionBusy()).toBe(false)
})

it('preserves an original screenshot plus a DOM-based red annotation for actual interception', async () => {
  registerRule(overlayBlockingRule)
  harness.handler = async (tools: any) =>
    call(tools, 'run_finish', { businessResult: 'unknown', blocked: true, summary: 'intercepted' })
  const run = await createRun({
    goal: 'inspect',
    environmentId: 'test',
    entryUrl: url + '/overlay',
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  const findings = await getFindings(run.id)
  expect(
    findings.some((f) => f.ruleId === 'overlay-blocking' && f.validationStatus === 'supported'),
  ).toBe(true)
  const artifacts = await getDbClient().execute({
    sql: 'SELECT metadata FROM artifacts WHERE run_id=?',
    args: [run.id],
  })
  const annotated = artifacts.rows
    .map((r) => JSON.parse(String(r.metadata)))
    .find((m) => m.annotation)
  expect(annotated.sourceRef).toBeTruthy()
  expect(annotated.rectangles[0]).toMatchObject({ x: 40, y: 40, width: 200, height: 60 })
})

it('measures real delayed feedback at 0.5 and 12 seconds without any model request', async () => {
  for (const delay of [500, 12000]) {
    responseDelay = delay
    let phase = 0
    harness.handler = async (tools: any) => {
      if (phase++ === 0) await call(tools, 'page_act', { type: 'click', selector: 'button' })
      else
        await call(tools, 'run_finish', {
          businessResult: 'success',
          blocked: false,
          summary: 'measured fixture',
        })
    }
    const run = await makeRun()
    await startRunExecution(run.id)
    expect((await getRun(run.id))?.status).toBe('completed')
    const timing = (await getEvents(run.id)).find((e) => e.type === 'response:observed')!.payload
    expect(Number(timing.durationMs)).toBeGreaterThanOrEqual(delay - 25)
    expect(Number(timing.durationMs)).toBeLessThan(delay + 1000)
    expect(timing.method).toBe('browser-mutation-feedback')
  }
}, 25000)

it('latches shared resources after an uncertain write until explicit reconciliation', async () => {
  harness.handler = async (tools: any) =>
    call(tools, 'page_act', { type: 'click', selector: 'button' })
  const run = await createRun({
    goal: 'inspect',
    environmentId: 'test',
    entryUrl: url + '/uncertain-page',
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.stopReason).toBe('reconciliation-required')
  expect(executionBusy()).toBe(true)
  const next = await makeRun()
  await startRunExecution(next.id)
  expect((await getRun(next.id))?.status).toBe('interrupted')
  expect(writes).toBe(1)
  await acknowledgeReconciliation()
  expect(executionBusy()).toBe(false)
})

describe('execution contract regressions', () => {
  it('retains arguments and outcome and exposes usable detail refs', async () => {
    harness.handler = async (tools: any, prompt: string) => {
      const packet = JSON.parse(prompt)
      if (harness.models === 1) {
        const target = packet.observation.elements.find((e: any) => e.text === 'Buy')
        expect(target.ref).toBeTruthy()
        const detail = await call(tools, 'element_details', { refs: [target.ref] })
        expect(detail[0].selector).toBeTruthy()
        const args = { type: 'click', role: 'button', name: 'Buy' }
        const result = await call(tools, 'page_act', args)
        return [{ payload: { toolName: 'page_act', args, result } }]
      }
      const action = packet.latestToolResults.tools[0]
      expect(action.args.name).toBe('Buy')
      expect(action.outcomeText).toContain('order-1')
      expect(action.status).toBe('completed')
      const older = await call(tools, 'history_read', { start: 0, count: 1 })
      expect(older.entries[0].tools[0].args.name).toBe('Buy')
      await call(tools, 'run_finish', {
        businessResult: 'success',
        blocked: false,
        summary: 'done',
      })
    }
    const run = await makeRun()
    await startRunExecution(run.id)
    expect((await getRun(run.id))?.status).toBe('completed')
    expect(writes).toBe(1)
  })
  it('refuses ambiguous exact names instead of choosing a first match', async () => {
    harness.handler = async (tools: any) => {
      const result = await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Pay' })
      expect(result.error).toContain('found 2')
      await call(tools, 'run_finish', {
        businessResult: 'unknown',
        blocked: true,
        summary: 'ambiguous',
      })
    }
    const run = await createRun({
      goal: 'test ambiguity',
      environmentId: 'test',
      entryUrl: url + '/ambiguous',
    })
    ids.push(run.id)
    await startRunExecution(run.id)
    expect((await getRun(run.id))?.usage.actions).toBe(0)
    expect((await getRun(run.id))?.status).toBe('blocked')
  })
  it('includes a rejected model request in failure statistics', async () => {
    harness.handler = async () => {
      throw Error('test upstream unavailable')
    }
    const run = await makeRun()
    await startRunExecution(run.id)
    const event = (await getEvents(run.id)).find((e) => e.type === 'run:statistics')!
    expect(event.payload).toMatchObject({
      requests: { total: 1, error: 1, totalInputTokens: null },
    })
  })
})

it('retrieves a hypothesis after it leaves the automatic six-turn history', async () => {
  let hypothesisId = ''
  harness.handler = async (tools: any, prompt: string) => {
    const packet = JSON.parse(prompt)
    if (harness.models === 1) {
      const args = {
        phenomenon: 'test candidate',
        basis: 'observation',
        verificationPlan: 'inspect',
      }
      const result = await call(tools, 'hypotheses_record', args)
      hypothesisId = result.id
      return [{ payload: { toolName: 'hypotheses_record', args, result } }]
    }
    if (harness.models < 9) {
      if (harness.models % 4 === 0) {
        const h = await call(tools, 'hypotheses_record', {
          phenomenon: `filler-${harness.models}`,
          basis: 'observation',
          verificationPlan: 'inspect',
        })
        return [
          {
            payload: {
              toolName: 'hypotheses_record',
              args: { phenomenon: `filler-${harness.models}` },
              result: h,
            },
          },
        ]
      }
      return [
        {
          payload: {
            toolName: 'exploration_update',
            args: { state: 'checking' },
            result: { state: 'checking' },
          },
        },
      ]
    }
    expect(packet.historyWindow.start).toBeGreaterThan(0)
    expect(JSON.stringify(packet.history)).not.toContain(hypothesisId)
    const old = await call(tools, 'history_read', { start: 0, count: 1 })
    expect(old.entries[0].tools[0].id).toBe(hypothesisId)
    expect(old.entries[0].tools[0].evidenceRefs.length).toBeGreaterThan(0)
    await call(tools, 'run_finish', {
      businessResult: 'unknown',
      blocked: true,
      summary: 'test finished',
    })
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('blocked')
})

it('does not replay a completed browser write after generation fails', async () => {
  harness.handler = async (tools: any) => {
    await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
    throw Error('fetch failed after tool')
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect(writes).toBe(1)
  expect(harness.models).toBe(1)
  expect((await getRun(run.id))?.status).toBe('execution-error')
  expect((await getRun(run.id))?.businessResult).toBe('success')
})
it('counts every failed attempt and keeps aggregate usage unknown', async () => {
  harness.handler = async (tools: any) => {
    if (harness.models === 1) throw Error('fetch failed')
    await call(tools, 'run_finish', {
      businessResult: 'unknown',
      blocked: true,
      summary: 'unverified',
    })
    return []
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect(harness.models).toBe(2)
  const final = await getRun(run.id)
  expect(final?.usage.modelCalls).toBe(2)
  expect(final?.usage.modelInputTokens).toBeNull()
  const events = await getEvents(run.id)
  expect(events.filter((e) => e.type === 'model:request-started')).toHaveLength(2)
  expect(events.find((e) => e.type === 'run:statistics')?.payload).toMatchObject({
    requests: { total: 2, error: 1 },
  })
})
it('permits the last budgeted request to finish instead of failing before dispatch', async () => {
  harness.handler = async (tools: any) => {
    await call(tools, 'run_finish', { businessResult: 'unknown', blocked: true, summary: 'test' })
  }
  const run = await createRun({
    goal: 'test',
    environmentId: 'test',
    entryUrl: url,
    budget: { maxModelCalls: 1 },
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  expect(harness.models).toBe(1)
  expect((await getRun(run.id))?.status).toBe('blocked')
})
it('never converts missing run_finish into successful inspection', async () => {
  harness.handler = async (tools: any) => {
    if (harness.models === 1)
      await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
    return []
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  const final = await getRun(run.id)
  expect(final?.status).toBe('blocked')
  expect(final?.stopReason).toBe('no-progress')
  expect(final?.businessResult).toBe('success')
  expect((await getEvents(run.id)).some((e) => e.type === 'agent:done')).toBe(false)
})
it('rejects success with an unresolved hypothesis and preserves it in the partial report', async () => {
  harness.handler = async (tools: any) => {
    await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
    await call(tools, 'hypotheses_record', {
      phenomenon: 'possible defect',
      basis: 'observed',
      verificationPlan: 'measure',
    })
    expect(
      await call(tools, 'run_finish', {
        businessResult: 'success',
        blocked: false,
        summary: 'done',
      }),
    ).toMatchObject({ accepted: false, error: 'inspection-incomplete' })
    expect(
      await call(tools, 'run_finish', {
        businessResult: 'success',
        blocked: true,
        summary: 'investigation unfinished',
      }),
    ).toMatchObject({ accepted: true })
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('blocked')
  expect((await getEvents(run.id)).some((e) => e.type === 'finish:rejected')).toBe(true)
})

it('preserves closable overlay evidence after recovery and successful checkout', async () => {
  registerRule(overlayBlockingRule)
  let findingId = ''
  harness.handler = async (tools: any, prompt: string) => {
    if (harness.models === 1) {
      const found = await getFindings(ids.at(-1)!)
      findingId = found.find((f) => f.ruleId === 'overlay-blocking')!.id
      const measured = await call(tools, 'transition_observe', {
        eventType: 'overlay',
        target: 'Buy',
        selector: 'button:first-of-type',
        condition: 'element-actionable',
        durationMs: 250,
      })
      // Both nested close and underlying buy match this selector: ambiguous is unknown.
      expect(measured.samples.every((s: { value: unknown }) => s.value === null)).toBe(true)
      const exact = await call(tools, 'transition_observe', {
        eventType: 'overlay',
        target: 'Buy',
        selector: 'body > button',
        condition: 'element-actionable',
        durationMs: 250,
      })
      expect(exact.samples.every((s: { value: unknown }) => s.value === false)).toBe(true)
      await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Close' })
      await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
      return []
    }
    const packet = JSON.parse(prompt)
    expect(packet.submittedFindings.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: findingId,
          validationStatus: 'supported',
          title: expect.any(String),
          evidenceRefs: expect.any(Array),
        }),
      ]),
    )
    expect(packet.businessOutcomeObserved.businessResult).toBe('success')
    await call(tools, 'run_finish', {
      businessResult: 'success',
      blocked: false,
      summary: 'recovered from campaign obstruction and verified checkout',
    })
  }
  const run = await createRun({
    goal: 'inspect overlays and purchase',
    environmentId: 'test',
    entryUrl: url + '/closable-overlay',
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('completed')
  expect(writes).toBe(1)
  expect(
    (await getFindings(run.id)).some(
      (f) => f.ruleId === 'overlay-blocking' && f.validationStatus === 'supported',
    ),
  ).toBe(true)
})
it('allows a bounded existing measurement while finalizing', async () => {
  let hyp = ''
  harness.handler = async (tools: any, prompt: string) => {
    const packet = JSON.parse(prompt)
    if (harness.models === 1) {
      hyp = (
        await call(tools, 'hypotheses_record', {
          phenomenon: 'test input state',
          basis: 'visible',
          verificationPlan: 'measure visibility',
        })
      ).id
      return []
    }
    expect(packet.phase).toBe('finalizing')
    expect(
      await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' }),
    ).toHaveProperty('error')
    expect(
      await call(tools, 'hypotheses_record', {
        phenomenon: 'new issue',
        basis: 'test',
        verificationPlan: 'test',
      }),
    ).toHaveProperty('error')
    const measured = await call(tools, 'transition_observe', {
      eventType: 'test-event',
      target: 'buy',
      selector: 'button',
      condition: 'element-visible',
      durationMs: 5000,
    })
    expect(measured.observedUntilMs - measured.startedAtMs).toBeGreaterThanOrEqual(5000)
    await call(tools, 'findings_submit', {
      hypothesisId: hyp,
      validationStatus: 'refuted',
      severity: 'info',
      title: 'Visible',
      expected: 'visible',
      actual: 'visible throughout',
      evidenceRefs: measured.evidenceRefs,
    })
    await call(tools, 'run_finish', {
      businessResult: 'unknown',
      blocked: true,
      summary: 'test measurement complete',
    })
  }
  const run = await createRun({
    goal: 'test',
    environmentId: 'test',
    entryUrl: url,
    budget: { maxModelCalls: 3, totalTimeoutMs: 20000 },
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('blocked')
  expect(writes).toBe(0)
  expect((await getEvents(run.id)).some((e) => e.type === 'finish:accepted')).toBe(true)
})

it('delivers history contents to a later decision that resolves the hypothesis from that packet', async () => {
  harness.handler = async (tools: any, prompt: string) => {
    const packet = JSON.parse(prompt)
    if (harness.models === 1) {
      const args = {
        phenomenon: 'possible layout issue',
        basis: 'visible',
        verificationPlan: 'inspect',
      }
      const result = await call(tools, 'hypotheses_record', args)
      return [{ payload: { toolName: 'hypotheses_record', args, result } }]
    }
    if (harness.models === 2) {
      const args = { start: 0, count: 1 }
      const result = await call(tools, 'history_read', args)
      return [{ payload: { toolName: 'history_read', args, result } }]
    }
    const recalled = packet.latestToolResults.tools[0].entries[0].tools[0]
    expect(recalled.phenomenon).toBe('possible layout issue')
    expect(recalled.evidenceRefs.length).toBeGreaterThan(0)
    await call(tools, 'findings_submit', {
      hypothesisId: recalled.id,
      validationStatus: 'refuted',
      severity: 'info',
      title: 'No obstruction',
      expected: 'available',
      actual: 'visible',
      evidenceRefs: recalled.evidenceRefs,
    })
    await call(tools, 'run_finish', {
      businessResult: 'unknown',
      blocked: true,
      summary: 'No purchase attempted',
    })
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('blocked')
  expect((await getFindings(run.id))[0]?.validationStatus).toBe('refuted')
  expect((await getEvents(run.id)).some((e) => e.type === 'finish:accepted')).toBe(true)
})
it('retains verified business evidence after leaving the result page', async () => {
  harness.handler = async (tools: any, prompt: string) => {
    const packet = JSON.parse(prompt)
    if (harness.models === 1)
      await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
    else if (harness.models === 2) {
      expect(packet.businessOutcomeObserved.verifiedBusiness.orderId).toBe('order-1')
      await call(tools, 'page_act', { type: 'navigate', url })
    } else {
      expect(packet.observation.pageText).not.toContain('Confirmed')
      expect(packet.businessOutcomeObserved.businessResult).toBe('success')
      expect(
        await call(tools, 'run_finish', {
          businessResult: 'success',
          blocked: false,
          summary: 'Retained order evidence',
        }),
      ).toMatchObject({ accepted: true })
    }
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('completed')
  expect(writes).toBe(1)
})
it('probes without writing and denies a second business write before network dispatch', async () => {
  harness.handler = async (tools: any) => {
    await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
    expect(writes).toBe(1)
    expect(
      await call(tools, 'page_act', { type: 'probe', role: 'button', name: 'Buy' }),
    ).toMatchObject({ status: 'completed' })
    expect(writes).toBe(1)
    const denied = await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
    expect(denied.error).toContain('write-denied')
    expect(writes).toBe(1)
    await call(tools, 'run_finish', {
      businessResult: 'success',
      blocked: false,
      summary: 'Original evidence retained; repeat denied',
    })
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('completed')
  expect((await getEvents(run.id)).some((e) => e.type === 'write:denied')).toBe(true)
})
it('accepts completed applicable checks while reporting untriggered branches separately', async () => {
  harness.handler = async (tools: any) => {
    await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
    await call(tools, 'exploration_update', {
      state: 'paid',
      unexploredBranches: [
        { description: 'rejection not seen', trigger: 'payment-rejected' },
        { description: 'no retryable failure', trigger: 'retryable-failure' },
      ],
    })
    const wrong = await call(tools, 'run_finish', {
      businessResult: 'success',
      blocked: true,
      summary: 'branches did not trigger',
    })
    expect(wrong).toMatchObject({
      accepted: false,
      error: 'no-applicable-blocker',
      finishAdvice: { businessResult: 'success', blocked: false },
    })
    const valid = await call(tools, 'run_finish', {
      businessResult: 'success',
      blocked: false,
      summary: 'applicable scope complete',
    })
    expect(valid.accepted).toBe(true)
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('completed')
  const { buildReport } = await import('../server/routes/runs.ts')
  const report = await buildReport(run.id)
  expect(report?.unexploredBranches).toEqual([])
  expect(report?.untriggeredBranches).toHaveLength(2)
})
it('returns explicit state feedback instead of repeatedly asking for impossible rejection evidence', async () => {
  harness.handler = async (tools: any) => {
    await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
    const denied = await call(tools, 'run_finish', {
      businessResult: 'rejected',
      blocked: false,
      summary: 'wrong enum',
    })
    expect(denied).toMatchObject({
      accepted: false,
      error: 'outcome-not-supported',
      finishAdvice: { businessResult: 'success', blocked: false },
    })
    await call(tools, 'run_finish', {
      businessResult: denied.finishAdvice.businessResult,
      blocked: false,
      summary: 'corrected from verified facts',
    })
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('completed')
})

it('maps a retryable processing failure to unknown and explains the blocked finish contract', async () => {
  harness.handler = async (tools: any) => {
    await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Pay' })
    const reply = await call(tools, 'run_finish', {
      businessResult: 'rejected',
      blocked: false,
      summary: 'processing failed',
    })
    expect(reply).toMatchObject({
      accepted: false,
      finishAdvice: {
        businessResult: 'unknown',
        blocked: true,
        businessResponse: { status: 'failed', canRetry: true },
      },
    })
    await call(tools, 'run_finish', {
      businessResult: reply.finishAdvice.businessResult,
      blocked: reply.finishAdvice.blocked,
      summary: 'retry control unavailable',
    })
  }
  const run = await createRun({
    goal: 'inspect retry',
    environmentId: 'test',
    entryUrl: url + '/retryable-page',
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  expect(await getRun(run.id)).toMatchObject({
    status: 'blocked',
    businessResult: 'unknown',
    stopReason: 'blocked',
  })
  expect(writes).toBe(1)
})

it.each([false, true])(
  'binds a learned semantic target to the correct actual element, disabled=%s',
  async (disabled) => {
    registerRule(
      compileTransitionRule('learned-retry', {
        type: 'transition',
        name: 'Retry availability',
        description: 'Eligible retry becomes operable',
        trigger: { eventType: 'retryable-failure' },
        expectation: { condition: 'element-actionable', target: 'Retry button', timeoutMs: 500 },
        severity: 'error',
      }),
    )
    let oldRef = '',
      result: any
    harness.handler = async (tools: any, prompt: string) => {
      const packet = JSON.parse(prompt)
      if (harness.models === 1) {
        oldRef = packet.observation.elements.find((e: any) => e.text === 'Try Again').ref
        expect(
          await call(tools, 'rule_check', {
            ruleId: 'learned-retry',
            hypothesisIds: [],
            elementRef: oldRef,
            triggerEvidenceRefs: ['invented'],
            bindingReason: 'label alone',
          }),
        ).toMatchObject({ verdict: 'unknown' })
        await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Pay' })
        return []
      }
      if (harness.models === 2) {
        const args = {
          ruleId: 'learned-retry',
          hypothesisIds: [],
          elementRef: packet.observation.elements.find((e: any) => e.text === 'Try Again').ref,
          triggerEvidenceRefs: [packet.observedRuleTriggers[0].eventRef],
          bindingReason:
            'This retry belongs to the visibly failed order; Retry upload is another action',
        }
        expect(await call(tools, 'rule_check', { ...args, elementRef: oldRef })).toMatchObject({
          verdict: 'unknown',
        })
        const hypothesis = await call(tools, 'hypotheses_record', {
          phenomenon: 'same eligible retry check',
          basis: 'response and visible order',
          verificationPlan: 'bound check',
          trigger: 'retryable-failure',
        })
        result = await call(tools, 'rule_check', { ...args, hypothesisIds: [hypothesis.id] })
        expect(result.verdict).toBe(disabled ? 'fail' : 'pass')
        expect(
          await call(tools, 'findings_submit', {
            hypothesisId: hypothesis.id,
            validationStatus: disabled ? 'supported' : 'refuted',
            severity: 'info',
            title: 'Duplicate of same bound check',
            expected: 'operable',
            actual: 'same measurement',
            evidenceRefs: result.evidenceRefs,
          }),
        ).toMatchObject({ reused: true, checkId: result.checkId })
        return []
      }
      expect(packet.activeHypotheses).toHaveLength(0)
      expect(packet.completedRuleChecks).toHaveLength(1)
      const reused = await call(tools, 'rule_check', {
        ruleId: 'learned-retry',
        hypothesisIds: [],
        elementRef: packet.observation.elements.find((e: any) => e.text === 'Try Again').ref,
        triggerEvidenceRefs: [packet.observedRuleTriggers[0].eventRef],
        bindingReason: 'same operation and unchanged button',
      })
      expect(reused).toMatchObject({ reused: true, checkId: result.checkId })
      await call(tools, 'run_finish', {
        businessResult: 'unknown',
        blocked: true,
        summary: 'Bound check resolved; no second payment',
      })
    }
    const run = await createRun({
      goal: 'inspect retry',
      environmentId: 'test',
      entryUrl: url + '/bound-page' + (disabled ? '?disabled' : ''),
      budget: { totalTimeoutMs: 20000, maxModelCalls: 8 },
    })
    ids.push(run.id)
    await startRunExecution(run.id)
    expect((await getRun(run.id))?.status).toBe('blocked')
    const measurements = (await getEvents(run.id)).filter((e) => e.type === 'transition:observed')
    expect(measurements).toHaveLength(1)
    expect(
      (measurements[0]!.payload.samples as any[]).every(
        (s) => s.target === 'Retry button' && s.value === !disabled,
      ),
    ).toBe(true)
    expect(
      (await getFindings(run.id)).filter((f) => f.validationStatus === 'supported'),
    ).toHaveLength(disabled ? 1 : 0)
    expect(writes).toBe(1)
  },
)
