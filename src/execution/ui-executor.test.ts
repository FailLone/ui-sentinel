import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer } from 'node:http'
import { rm } from 'node:fs/promises'

/**
 * The executor's `ui-scan` mode (plan 3.1, 8/B2).
 *
 * These tests drive the real executor, the real browser and the real network session. The model is a
 * scripted stub, so nothing here calls a provider: what is under test is the assembly - whether a UI
 * run gets a business runtime it must not have, whether its network boundary is installed before the
 * first navigation, and whether its completion claim is checked against saved scope.
 */
const harness = vi.hoisted(() => ({
  handler: null as any,
  models: 0,
  trustedOrigins: [] as string[],
  businessRuntimes: 0,
}))

/**
 * The page the executor is driving.
 *
 * The handler needs it to make the *page itself* dispatch a request - a script-initiated write is
 * what the boundary is for, and asking through a tool would test the executor's own pre-check
 * instead of the interception layer (plan 4.3).
 */
const live = { page: null as import('playwright').Page | null }

vi.mock('../shared/config.ts', () => ({
  config: {
    databaseUrl: ':memory:',
    agentModel: 'openai/test-explicit-mock',
    visionModel: 'test',
    features: {
      observation: true,
      ruleRouting: true,
      journeys: true,
      urlScan: true,
      visualDiscovery: false,
    },
    completionReview: {
      model: 'typesafe/jev-1.13',
      expectedModel: 'typesafe/jev-1.13-20260917',
      apiKey: 'test-only',
      timeoutMs: 100,
    },
    budget: {
      totalTimeoutMs: 20000,
      maxActions: 10,
      maxModelCalls: 20,
      toolTimeoutMs: 15000,
      modelRequestTimeoutMs: 10000,
      modelRequestMaxRetries: 1,
    },
    // Read through so a fixture port bound in `beforeAll` is visible to the run's own policy.
    get urlScan() {
      return { trustedOrigins: harness.trustedOrigins }
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
/**
 * A UI run has no adapter, so the legacy path must not be reachable at all.
 *
 * Asserting on a spy would leave the call legal; making it throw means a run that takes the business
 * branch fails visibly instead of quietly acquiring a shopping contract.
 */
vi.mock('../business/registry.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../business/registry.ts')>()),
  legacyCompatibleContract: () => {
    throw new Error('legacy-compatible-contract-used')
  },
}))
vi.mock('./browser.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./browser.ts')>()
  return {
    ...actual,
    launchBrowser: async (...args: Parameters<typeof actual.launchBrowser>) => {
      const worker = await actual.launchBrowser(...args)
      live.page = worker.page
      return worker
    },
  }
})
vi.mock('../business/runtime.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../business/runtime.ts')>()
  return {
    ...actual,
    createBusinessRuntime: (...args: Parameters<typeof actual.createBusinessRuntime>) => {
      harness.businessRuntimes++
      return actual.createBusinessRuntime(...args)
    },
  }
})

import { createRun, getRun, getEvents } from './run-manager.ts'
import { startRunExecution } from './executor.ts'
import { initDatabase } from '../storage/database.ts'
import { clearRules } from '../rules/engine.ts'
import { registerBuiltinRules } from '../rules/builtin/index.ts'
import { resolveUiScanContract } from '../inspection/contract.ts'
import type { RunSpec } from '../shared/types.ts'

const ids: string[] = []
let runId: string | undefined
const server = createServer((request, response) => {
  const url = request.url ?? '/'
  if (url.startsWith('/api/items')) {
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ items: [{ id: 'a' }, { id: 'b' }] }))
    return
  }
  response.setHeader('content-type', 'text/html')
  response.end(
    `<html><head><title>Catalog</title></head><body><h1>Catalog</h1>` +
      `<button id="filter">Filter</button>` +
      `<button id="sort">Sort</button>` +
      `<a href="/detail?id=1">Detail</a>` +
      // A control whose click is observable: the run measures the response, which is what makes the
      // response-time rule applicable at all (its event type is `response:observed`).
      `<script>document.getElementById('sort').addEventListener('click',function(){` +
      `document.querySelector('h1').textContent='Sorted'});</script>` +
      `</body></html>`,
  )
})

let origin = ''
let entryUrl = ''

beforeAll(async () => {
  await initDatabase()
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture server did not bind')
  // `localtest.me` resolves to 127.0.0.1 but is a name, so the entry passes the public-address rule
  // the way a real user's URL does; the fixture origin is the server-owned exception of plan 4.1.
  origin = `http://localtest.me:${address.port}`
  entryUrl = `${origin}/catalog?category=books&sort=price#items`
  harness.trustedOrigins = [origin]
})

afterAll(async () => {
  server.close()
  await Promise.all(ids.map((id) => rm(`data/artifacts/${id}`, { recursive: true, force: true })))
})

beforeEach(() => {
  harness.models = 0
  harness.businessRuntimes = 0
  clearRules()
})

const call = (tools: any, name: string, input: any = {}) => tools[name].execute(input, {})

/** A run created from a resolved UI contract, the way the API route will create one (B3). */
async function makeUiRun(request: Record<string, unknown> = {}) {
  const resolved = resolveUiScanContract(
    { kind: 'ui-scan', entryUrl, ...request },
    { reachableOrigins: harness.trustedOrigins },
  )
  if (resolved.kind !== 'resolved') throw new Error(`contract refused: ${resolved.reasonCode}`)
  const contract = resolved.contract
  const spec: Omit<RunSpec, 'budget' | 'viewport'> & { budget?: Partial<RunSpec['budget']> } = {
    goal: contract.goal,
    environmentId: 'url-scan',
    entryUrl: contract.entryUrl,
    kind: 'ui-scan',
    uiContract: contract,
  }
  const run = await createRun(spec)
  ids.push(run.id)
  return run
}

describe('ui-scan executor assembly', () => {
  it('never assembles a business runtime and records the business result as not-applicable', async () => {
    let phase = 0
    harness.handler = async (tools: any) => {
      if (phase++ === 0) return []
      await call(tools, 'run_finish', { reason: 'unverified-scope' })
      return []
    }
    const run = await makeUiRun()
    await startRunExecution(run.id)

    // The decisive fact: no adapter was invented for a site that has none.
    expect(harness.businessRuntimes).toBe(0)
    const stored = await getRun(run.id)
    expect(stored?.spec.kind).toBe('ui-scan')
    expect(stored?.businessResult).toBe('not-applicable')
    expect(stored?.status).toBe('blocked')

    const events = await getEvents(run.id)
    expect(events.some((e) => e.type.startsWith('business:'))).toBe(false)
    // The boundary is installed by the executor before the entry is navigated, so the document
    // itself is judged by the policy rather than the session starting after the page already loaded.
    // Allowed requests are summarised (the plan permits that; a page may dispatch hundreds), and the
    // summary naming the entry origin is the evidence that the entry went through the policy.
    const summary = events.find((e) => e.type === 'network:allowed-summary')
    expect(summary).toBeTruthy()
    const entries = summary!.payload.entries as { origin: string; destination: string }[]
    expect(entries.some((entry) => entry.origin === origin)).toBe(true)
  })

  it('refuses a scope-covered claim with no checks and offers an honest partial ending', async () => {
    let phase = 0
    let refusal: any
    harness.handler = async (tools: any) => {
      if (phase++ === 0) return []
      if (phase === 2) {
        refusal = await call(tools, 'run_finish', { reason: 'scope-covered' })
        await call(tools, 'run_finish', { reason: 'unverified-scope' })
        return []
      }
      return []
    }
    const run = await makeUiRun()
    await startRunExecution(run.id)

    // A page was observed and offered a control, so "nothing was outstanding" is false: the run may
    // not claim coverage while the sampling obligation it created is unresolved (plan 6.2.2).
    expect(refusal.accepted).toBe(false)
    expect(refusal.error).toBe('scope-incomplete')
    expect(refusal.missingFacts.join(' ')).toMatch(/local interaction|local-interaction/i)
    // The refusal is usable: a partial ending is offered rather than leaving the run with no way out.
    expect(refusal.partialAdvice.reason).toBe('unverified-scope')

    const events = await getEvents(run.id)
    expect(events.some((e) => e.type === 'finish:rejected')).toBe(true)
    // Approval by clearing the ledger is impossible: the refusals are persisted with their reasons.
    const accepted = events.find((e) => e.type === 'finish:accepted')
    expect(accepted?.payload.reasonCode).toBe('unverified-scope')
    expect((await getRun(run.id))?.status).toBe('blocked')
  })

  it('will not let a later finish claim coverage of an item it already reported unverified', async () => {
    let phase = 0
    let covered: any
    harness.handler = async (tools: any) => {
      if (phase++ === 0) return []
      if (phase === 2) {
        // Record a genuine gap, then try to claim the whole scope was covered.
        await call(tools, 'exploration_update', {
          state: 'catalog',
          unexploredBranches: [],
          recordGap: {
            reasonCode: 'target-ambiguous',
            detail: 'the filter control could not be resolved to one element',
          },
        })
        covered = await call(tools, 'run_finish', { reason: 'scope-covered' })
        await call(tools, 'run_finish', { reason: 'unverified-scope' })
        return []
      }
      return []
    }
    const run = await makeUiRun()
    await startRunExecution(run.id)

    expect(covered.accepted).toBe(false)
    const events = await getEvents(run.id)
    const accepted = events.find((e) => e.type === 'finish:accepted')
    // The item the run itself called unverified is still in the proof, not deleted to make room.
    // The agent's own reason code is the marker that this is *its* gap rather than the sampling
    // obligation, so the assertion cannot pass on a ledger that never received the gap.
    const proof = accepted?.payload.inspectionProof as
      | { items?: { status: string; reasonCode: string | null }[] }
      | undefined
    const items = proof?.items ?? []
    expect(
      items.some((i) => i.status === 'unverified' && i.reasonCode === 'target-ambiguous'),
    ).toBe(true)
  })

  it('keeps an empty exploration update from clearing the executor-owned obligation', async () => {
    let phase = 0
    let covered: any
    harness.handler = async (tools: any) => {
      if (phase++ === 0) return []
      if (phase === 2) {
        await call(tools, 'exploration_update', { state: 'catalog', unexploredBranches: [] })
        covered = await call(tools, 'run_finish', { reason: 'scope-covered' })
        await call(tools, 'run_finish', { reason: 'unverified-scope' })
      }
      return []
    }
    const run = await makeUiRun()
    await startRunExecution(run.id)

    // The tool's own description invites the model to "send an empty list to clear"; the sampling
    // obligation the observation created is not the model's to clear (plan 5.2).
    expect(covered.accepted).toBe(false)
    expect(covered.error).toBe('scope-incomplete')
  })

  it('offers no business Journeys and no business blocker review to a ui-scan run', async () => {
    let phase = 0
    let offered: string[] = []
    let businessResult: string | undefined
    let journeyOutcome: unknown
    harness.handler = async (tools: any, prompt: string) => {
      const packet = JSON.parse(prompt)
      offered = packet.activeTools
      businessResult = packet.businessOutcomeObserved?.businessResult
      if (phase++ === 0) return []
      if (phase === 2) {
        // A Journey is a cross-run navigation segment bound to another run's business contract. A UI
        // run must neither read nor publish one (plan 1.3), so even naming one cannot replay it.
        journeyOutcome = await call(tools, 'journey_run', { journeyId: 'j-any', revision: 1 })
        await call(tools, 'run_finish', { reason: 'unverified-scope' })
      }
      return []
    }
    const run = await makeUiRun()
    await startRunExecution(run.id)

    // The tool is not offered, and the capability behind it holds nothing to replay.
    expect(offered).not.toContain('journey_run')
    expect(JSON.stringify(journeyOutcome)).toMatch(/journey|not found|error/i)
    // The business outcome the run reports about itself is not "unknown" (which would read as "not
    // checked yet") and never a business verdict: it is explicitly not applicable (plan 6.1).
    expect(businessResult).toBe('not-applicable')
  })

  it('reaches a covered, completed ending once the observed controls have been acted on', async () => {
    let phase = 0
    let covered: any
    harness.handler = async (tools: any, prompt: string) => {
      if (phase++ === 0) return []
      if (phase === 2) {
        const packet = JSON.parse(prompt)
        // The candidates are items the executor created from the observation, not a model-supplied
        // list: select the controls it actually offered.
        const [button, link] = ['local-interaction', 'navigation'].map((category) =>
          packet.inspectionScope.candidates.find((c: any) => c.category === category),
        )
        await call(tools, 'exploration_update', {
          state: 'catalog',
          unexploredBranches: [],
          selectItems: [
            {
              itemId: button.itemId,
              basis: 'the filter control is the page’s own stated affordance',
            },
            {
              itemId: link.itemId,
              basis: 'one same-origin detail page is within the declared depth',
            },
          ],
        })
        await call(tools, 'page_act', { type: 'click', selector: `#filter` })
        await call(tools, 'page_act', { type: 'navigate', url: `${origin}/detail?id=1` })
        covered = await call(tools, 'run_finish', { reason: 'scope-covered' })
        if (!covered.accepted) await call(tools, 'run_finish', { reason: 'unverified-scope' })
      }
      return []
    }
    const run = await makeUiRun()
    await startRunExecution(run.id)

    // An action the executor actually dispatched resolves the selected item, so the sampling
    // obligation the observation created is met with a real interaction and a real navigation rather
    // than a statement that one happened.
    expect(covered.accepted, JSON.stringify(covered)).toBe(true)
    expect(covered.reasonCode).toBe('scope-covered')
    const stored = await getRun(run.id)
    expect(stored?.status).toBe('completed')
    expect(stored?.stopReason).toBe('goal-reached')
    expect(stored?.businessResult).toBe('not-applicable')

    const events = await getEvents(run.id)
    const summary = events.find((e) => e.type === 'inspection:summary')
    expect(summary?.payload.coverage).toBe('covered')
    const proof = events.find((e) => e.type === 'finish:accepted')?.payload.inspectionProof as
      | { items?: { category: string; status: string }[] }
      | undefined
    // Both checks are in the persisted proof as *verified*, and their addresses come from the browser
    // rather than from the model: the tool surface has no way to state that a control responded or
    // that a page was reached.
    const items = proof?.items ?? []
    expect(items.some((i) => i.category === 'local-interaction' && i.status === 'verified')).toBe(
      true,
    )
    expect(items.some((i) => i.category === 'navigation' && i.status === 'verified')).toBe(true)
    // The navigation scope is executed, not just declared: the run landed on the target it decided
    // before dispatch, and that move is on the record.
    const committed = events.find((e) => e.type === 'navigation:committed')
    expect(committed?.payload.url).toBe(`${origin}/detail?id=1`)
  })

  it('completes a covered run when a builtin rule reports a limit this contract cannot judge', async () => {
    // The regression this guards: with the real builtin rules registered, `response-time` is
    // applicable (a response was measured) but has no threshold to judge against, because a general
    // site declares no SLA (plan 7). Turning that into an unfinished obligation made `scope-covered`
    // permanently unreachable for every healthy UI run. The previous tests could not see it because
    // they call `clearRules()`.
    registerBuiltinRules()
    let phase = 0
    let covered: any
    harness.handler = async (tools: any, prompt: string) => {
      if (phase++ === 0) return []
      if (phase === 2) {
        const packet = JSON.parse(prompt)
        const [button, link] = ['local-interaction', 'navigation'].map((category) =>
          packet.inspectionScope.candidates.find((c: any) => c.category === category),
        )
        await call(tools, 'exploration_update', {
          state: 'catalog',
          unexploredBranches: [],
          selectItems: [
            { itemId: button.itemId, basis: 'the page’s own stated affordance' },
            {
              itemId: link.itemId,
              basis: 'one same-origin detail page is within the declared depth',
            },
          ],
        })
        await call(tools, 'page_act', { type: 'click', selector: '#sort' })
        await call(tools, 'page_act', { type: 'navigate', url: `${origin}/detail?id=1` })
        covered = await call(tools, 'run_finish', { reason: 'scope-covered' })
        if (!covered.accepted) await call(tools, 'run_finish', { reason: 'unverified-scope' })
      }
      return []
    }
    const run = await makeUiRun()
    await startRunExecution(run.id)

    expect(covered.accepted, JSON.stringify(covered)).toBe(true)
    const stored = await getRun(run.id)
    expect(stored?.status).toBe('completed')
    const events = await getEvents(run.id)
    const summary = events.find((e) => e.type === 'inspection:summary')
    expect(summary?.payload.coverage).toBe('covered')
    // The limit is still reported rather than silently dropped: the rule's own verdict and reason are
    // in the ledger, so a reader can see the performance dimension was not judged.
    const unchecked = events
      .filter((e) => e.type === 'rule:evaluated')
      .find((e) => e.payload.ruleId === 'response-time' && e.payload.verdict === 'unknown')
    expect(unchecked).toBeDefined()
  })

  it('refuses an out-of-depth navigation before it is dispatched', async () => {
    let phase = 0
    let refusal: string | undefined
    let countsBefore = 0
    harness.handler = async (tools: any) => {
      if (phase++ === 0) return []
      if (phase === 2) {
        countsBefore = (await getEvents(runId!)).filter(
          (e) => e.type === 'navigation:committed',
        ).length
        // A refusal is thrown rather than returned: the model is told the action did not happen.
        refusal = await call(tools, 'page_act', {
          type: 'navigate',
          url: `${origin}/a/b/c`,
        }).then(
          () => undefined,
          (error: unknown) => String(error),
        )
        await call(tools, 'run_finish', { reason: 'unverified-scope' })
      }
      return []
    }
    const run = await makeUiRun()
    runId = run.id
    const url = `${origin}/a/b/c`
    await startRunExecution(run.id)

    // The contract's `maxDepth` is enforced on the execution path, not only in the policy text: this
    // run's maxDepth is 1, so a three-segment path is refused, and the refusal reaches the model as a
    // failed call rather than a served page.
    expect(String(refusal)).toMatch(/navigation denied: depth-exceeded/)
    const events = await getEvents(run.id)
    expect(
      events.some(
        (e) => e.type === 'navigation:denied' && e.payload.reasonCode === 'depth-exceeded',
      ),
    ).toBe(true)
    // Refused before dispatch: the run never landed anywhere, so no navigation was committed.
    expect(events.filter((e) => e.type === 'navigation:committed').length).toBe(countsBefore)
    expect(events.some((e) => e.type === 'navigation:committed' && e.payload.url === url)).toBe(
      false,
    )
  })

  it('refuses a covered claim once the boundary has actually intervened', async () => {
    let phase = 0
    let covered: any
    harness.handler = async (tools: any) => {
      if (phase++ === 0) return []
      if (phase === 2) {
        // A write the boundary refuses is an intervention: the page now runs without something it
        // asked for, so what it renders afterwards cannot establish a verdict about the site.
        await live.page!.evaluate(() => {
          void fetch('/api/items', { method: 'POST' }).catch(() => {})
        })
        await live.page!.waitForTimeout(200)
        covered = await call(tools, 'run_finish', { reason: 'scope-covered' })
        await call(tools, 'run_finish', { reason: 'unverified-scope' })
      }
      return []
    }
    const run = await makeUiRun()
    await startRunExecution(run.id)

    expect(covered.accepted).toBe(false)
    expect(covered.error).toBe('evidence-intervened')
    const events = await getEvents(run.id)
    expect(events.some((e) => e.type === 'execution:intervention')).toBe(true)
    expect(
      events.some(
        (e) => e.type === 'network:decision' && String(e.payload.reasonCode).includes('write'),
      ),
    ).toBe(true)
    // The refusal stands: the run ends blocked with its scope reported partial, not covered.
    expect((await getRun(run.id))?.status).toBe('blocked')
  })
})
