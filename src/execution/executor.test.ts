import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer } from 'node:http'
import { readFile, rm } from 'node:fs/promises'

const harness = vi.hoisted(() => ({
  handler: null as any,
  models: 0,
  review: null as any,
  reviews: 0,
  corruptCommit: false,
}))
vi.mock('../shared/config.ts', () => ({
  config: {
    databaseUrl: ':memory:',
    agentModel: 'openai/test-explicit-mock',
    visionModel: 'test',
    features: { observation: true, ruleRouting: true, journeys: true },
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
vi.mock('../agent/decisions/blocker-review.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../agent/decisions/blocker-review.ts')>()),
  requestBlockerReview: (...args: any[]) => {
    harness.reviews++
    return harness.review(...args)
  },
}))
vi.mock('./completion-integrity.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./completion-integrity.ts')>()
  return {
    ...actual,
    verifyCompletionCommit: async (...args: Parameters<typeof actual.verifyCompletionCommit>) => {
      await actual.verifyCompletionCommit(...args)
      if (harness.corruptCommit) throw Error('completion-commit-unverified:injected-stale-reader')
    },
  }
})
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
import { responseTimeRule } from '../rules/builtin/response-time.ts'
/** The rule id under test; named once so a rename cannot silently make the assertion vacuous. */
const reasonRule = 'response-time'
import { compileTransitionRule } from '../rules/transition.ts'
import { config } from '../shared/config.ts'
import { bindProfile, buildContractSnapshot, resolveProfile } from '../business/registry.ts'
let reviewCloseVisible = false
let journeyChange = 'none'
let url = '',
  writes = 0,
  responseDelay = 0
const ids: string[] = []
/**
 * Fixture business protocol.
 *
 * The fixture posts to the *declared* shopping route (`POST /api/checkout`), like the real arena,
 * and picks its outcome the way the arena does: serving a page configures the outcome for that
 * page. The executor recognizes a business request by origin, method, path and response schema, so
 * a fixture that answered on `/purchase` would only work by the body-sniffing the plan forbids -
 * and would prove nothing about the adapter under test.
 */
let paymentOutcome: 'success' | 'failed' | 'uncertain' = 'success'
/** Export fixture state: how many jobs were created, and whether a status read settles them. */
let exportJobs = 0
let exportJobId = ''
let exportSettled = false
let exportStatusDelay = 0
// Serve the export workspace at the root, the way the real arena does (entryPath is '/').
let exportWorkspaceAtRoot = false
/**
 * B07's staged workspace, served at the root because navigation is confined to the entry path.
 *
 * Stage 0 reaches a verified terminal success. Stage 1 is a plain page reached by ordinary
 * navigation that says nothing about the job. Stage 2 names the job again while its *newest* status
 * is a failure whose notice the page does not render.
 *
 * The status endpoint is honest throughout: it reports version 2 succeeded, then version 3 failed,
 * for the same entity. Only what the page renders differs, which is what makes this a test of the
 * executor's rule rather than of a doctored response.
 */
let b07Enabled = false
let b07Stage = 0
let b07JobId = ''
/** The export workspace for the cancellation test: it starts a job on click. */
let exportWorkspaceStart = false
/**
 * P04: the export create is committed server-side, then the response is lost.
 *
 * The write really happened, so the correct handling is `reconciliation-required` - not a silent
 * replay of the create. What makes the case different from the shopping arena's is that export's
 * write is a 202 that only starts an asynchronous job: the executor must still reconcile.
 */
let exportCreateTruncated = false
/** P04: how many times the fixture accepted a create, so a replay is visible rather than inferred. */
let exportCreates = 0
/**
 * The E2-shaped workspace: a recoverable failure whose *published prerequisite* is unmet.
 *
 * The page asks the server for recovery eligibility before drawing the control - which is what the
 * real arena does - so the eligibility response is a genuine page-driven business read rather than
 * a fetch the test made on the run's behalf. The job payload is deliberately identical to the
 * healthy case (`permitted: true`, `prerequisitesMet: true`); only the eligibility resource
 * separates them, which is exactly F04's shape.
 */
let exportEligibilityWorkspace = false
const server = createServer((req, res) => {
  if (req.url === '/api/checkout') {
    writes++
    if (paymentOutcome === 'uncertain') {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end('{}')
      return
    }
    res.setHeader('content-type', 'application/json')
    const body =
      paymentOutcome === 'failed'
        ? {
            success: false,
            status: 'failed',
            orderId: 'order-failed',
            message: 'Payment processing failed. Please try again.',
            canRetry: true,
          }
        : { success: true, status: 'success', orderId: 'order-1' }
    if (responseDelay) setTimeout(() => res.end(JSON.stringify(body)), responseDelay)
    else res.end(JSON.stringify(body))
    return
  }
  if (req.url === '/review-close-flag') {
    res.end(JSON.stringify(reviewCloseVisible))
    return
  }
  if (req.url === '/changing-overlay') {
    res.setHeader('content-type', 'text/html')
    res.end(
      `<button style="position:absolute;left:40px;top:40px;width:200px;height:60px">Pay</button><div id="cover" style="position:fixed;inset:0;background:#ccc;z-index:100">Campaign</div><script>const timer=setInterval(async()=>{if(await fetch('/review-close-flag').then(r=>r.json())) {clearInterval(timer);const b=document.createElement('button');b.textContent='Close';b.onclick=()=>b.parentElement.remove();document.getElementById('cover').append(b);}},20)</script>`,
    )
    return
  }

  if (req.url === '/intervention-page') {
    res.setHeader('content-type', 'text/html')
    paymentOutcome = 'failed'
    res.end(`<h1>Checkout</h1><button id="pay">Pay</button><button disabled>Required helper</button><script>
      document.getElementById('pay').onclick=async function(){
        this.disabled=true;this.textContent='Retrying...';
        try{const r=await fetch('/api/checkout',{method:'POST'});const d=await r.json();
          document.querySelector('h1').textContent=d.message+' '+d.orderId;
          this.textContent='Try Again';this.disabled=false;
        }catch{document.querySelector('h1').textContent='Unexpected error order-failed';}
      };
    </script>`)
    return
  }
  if (req.url === '/journey-page') {
    res.setHeader('content-type', 'text/html')
    res.end(`<h1>Catalog</h1><button>Open cart</button><script>
      document.querySelector('button').onclick=function(){
        if(${journeyChange == 'write'}) {fetch('/api/checkout',{method:'POST'}).catch(()=>{});return;}
        document.querySelector('h1').textContent='Cart';
        var b=document.querySelector('button');b.textContent='Checkout';
        if(${journeyChange == 'banner'}) {var overlay=document.createElement('div');overlay.textContent='Campaign';overlay.style.cssText='position:fixed;inset:0;background:white;z-index:100';document.body.append(overlay);}
        b.onclick=function(){document.querySelector('h1').textContent='Checkout';b.textContent='Pay';b.onclick=null;};
      };
    </script>`)
    return
  }
  if (req.url?.startsWith('/bound-page')) {
    res.setHeader('content-type', 'text/html')
    paymentOutcome = 'failed'
    res.end(
      `<h1>Checkout</h1><button onclick="fetch('/api/checkout',{method:'POST'}).then(r=>r.json()).then(d=>document.querySelector('h1').textContent=d.message+' '+d.orderId)">Pay</button><button ${req.url.includes('disabled') ? 'disabled' : ''}>Try Again</button><button>Retry upload</button>`,
    )
    return
  }
  // B07: one root page whose *rendered* content changes with the stage, so "navigate away" and "a
  // newer contradictory status appears" are two ordinary page loads rather than an internal switch.
  if (req.url === '/' && b07Enabled) {
    res.setHeader('content-type', 'text/html')
    if (b07Stage === 0)
      // Stage 0: the workspace that starts a job and renders the settled job's notice, so the
      // success can be verified against visible evidence.
      res.end(
        `<h1>Exports</h1><p id="job"></p><button id="start">Start export</button><script>
        let jobId=null;
        document.getElementById('start').onclick=async function(){
          const d=await fetch('/api/exports',{method:'POST',headers:{'content-type':'application/json'},
            body:JSON.stringify({datasetId:'orders-q3',format:'csv'})}).then(r=>r.json());
          jobId=d.jobId;
          const j=await fetch('/api/exports/'+jobId).then(r=>r.json());
          // The job and its notice are both rendered, which is what lets the outcome be correlated.
          document.getElementById('job').textContent=j.jobId+' '+(j.notice||j.phase);
        };</script>`,
      )
    else if (b07Stage === 1)
      // Stage 1: ordinary navigation to a page that says nothing about the job. The proven result
      // must survive this - re-observing a page with no business content is not new evidence.
      res.end('<h1>Exports</h1><p>Nothing selected.</p>')
    // Stage 2 re-reads the *existing* job - no second create - and shows its identity while
    // withholding its notice. The read is the page's own, so the executor observes a version-3
    // failure for the same entity: newer evidence that contradicts the proven success.
    else
      res.end(
        `<h1>Exports</h1><p id="job"></p><script>
        const jobId=${JSON.stringify(b07JobId)};
        fetch('/api/exports/'+jobId).then(r=>r.json()).then(function(j){
          // Identity is rendered; the notice is deliberately not. Identity alone never confirmed an
          // outcome, so the newest fact cannot be correlated and must not count as confirmation.
          document.getElementById('job').textContent=j.jobId;
        });</script>`,
      )
    return
  }
  // The E2-shaped workspace: start a job, then ask the server for recovery eligibility exactly as
// the real arena does, and render the disabled control the unmet prerequisite produces.
  if (req.url === '/' && exportEligibilityWorkspace) {
    res.setHeader('content-type', 'text/html')
    res.end(`<h1>Exports</h1><p id="job"></p><button id="start">Start export</button>
      <p id="notice"></p><button id="retry" disabled>Try again</button><script>
      async function load(){
        const d=await fetch('/api/exports',{method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({datasetId:'orders-q3',format:'csv'})}).then(r=>r.json());
        const j=await fetch('/api/exports/'+d.jobId).then(r=>r.json());
        document.getElementById('job').textContent=j.jobId+' '+(j.notice||j.phase);
        // The workspace asks the server for the authoritative prerequisite rather than inferring
        // it from the job, and honours the answer by leaving the control inoperable.
        const e=await fetch('/api/exports/'+d.jobId+'/eligibility').then(r=>r.json());
        document.getElementById('notice').textContent=e.prerequisite.note;
        document.getElementById('retry').disabled=!e.prerequisite.met;
      }
      document.getElementById('start').onclick=load;</script>`)
    return
  }
  // The plain export workspace used by the cancellation test: one control that starts a job.
  if (req.url === '/' && exportWorkspaceStart) {
    res.setHeader('content-type', 'text/html')
    res.end(`<h1>Exports</h1><p id="job"></p><button id="start">Start export</button><script>
      document.getElementById('start').onclick=async function(){
        const d=await fetch('/api/exports',{method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({datasetId:'orders-q3',format:'csv'})}).then(r=>r.json());
        document.getElementById('job').textContent=d.jobId+' '+d.phase;
      };</script>`)
    return
  }
  // An asynchronous export workspace: it owns a job and polls it in the background. The poll is a
  // real business read the run did not initiate, which is what makes this a test of attribution -
  // an unrelated action must not adopt the poll's result as its own.
  if (req.url === '/' && exportWorkspaceAtRoot) {
    res.setHeader('content-type', 'text/html')
    res.end(`<h1>Exports</h1><p id="job"></p><button id="start">Start export</button>
      <button id="clear">Clear</button><script>
      let jobId=null;let poll=null;window.__staleJob='';
      function show(phase,notice){document.getElementById('job').textContent=(jobId||'')+' '+phase+' '+(notice||'');}
      document.getElementById('start').onclick=async function(){
        const r=await fetch('/api/exports',{method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({datasetId:'orders-q3',format:'csv'})});
        const d=await r.json();jobId=d.jobId;window.__staleJob=d.jobId;show(d.phase,d.notice);
        // The workspace refreshes its job status continuously - including after the job settles -
        // so a status response can land at any moment, including while the user clicks something
        // else. That ongoing background read is what the action must not mistake for its own.
        poll=setInterval(async function(){
          if(!jobId)return;
          const j=await fetch('/api/exports/'+jobId).then(r=>r.json());
          if(document.body.innerText.indexOf(jobId)<0)return;
          show(j.phase,j.notice);
        },60);
      };
      // The Clear control removes the job from the page. It dispatches no write, so nothing it
      // could be credited with exists. Meanwhile the page keeps refreshing that job's status in
      // the background: the response arrives, but the job's notice is deliberately not rendered.
      // An action that adopts that response as its own then waits for a notice the page will never
      // show, and stalls until the tool timeout.
      document.getElementById('clear').onclick=async function(){
        jobId=null;show('cleared','');
        // The workspace refreshes the job status one more time while clearing it, and that read
        // outlives the click: its response arrives after the page has already dropped the notice.
        // A response arriving here is a real business fact about the job - but it is not this
        // click's result, and nothing the page shows could ever confirm it.
        await fetch('/api/exports/'+window.__staleJob).catch(function(){});
        show('cleared','');
      };
    </script>`)
    return
  }
  if (req.url?.startsWith('/api/exports')) {
    // The E2-shaped protocol: the create settles to a *failed* job that the API still permits
    // retrying, while the eligibility resource publishes an unmet prerequisite. The control is
    // rendered disabled, as the arena does - the whole defect is that gap.
    if (exportEligibilityWorkspace) {
      const segments = req.url.split('/').filter(Boolean)
      const job = segments[2] ?? ''
      res.setHeader('content-type', 'application/json')
      if (req.method === 'POST' && req.url === '/api/exports') {
        const id = `job-elig-${++exportJobs}`
        res.end(
          JSON.stringify({
            jobId: id,
            attempt: 0,
            version: 1,
            phase: 'processing',
            notice: null,
            retry: { permitted: false, remaining: 0, afterMs: 0, prerequisitesMet: false },
            datasetId: 'orders-q3',
            format: 'csv',
          }),
        )
        return
      }
      if (segments[3] === 'eligibility') {
        res.end(
          JSON.stringify({
            jobId: job,
            prerequisite: {
              scope: 'export.retry',
              note: 'Retrying this export is not available from this workspace.',
              met: false,
            },
            backendPermitsRetry: true,
          }),
        )
        return
      }
      // The job payload is identical to the healthy case: `retry.permitted` is true and the
      // prerequisites are met. Nothing here can carry the E2 claim.
      res.end(
        JSON.stringify({
          jobId: job,
          attempt: 0,
          version: 2,
          phase: 'failed',
          notice: 'Export could not complete. You may try again.',
          retry: { permitted: true, remaining: 1, afterMs: 0, prerequisitesMet: true },
          datasetId: 'orders-q3',
          format: 'csv',
        }),
      )
      return
    }
    // B07's staged protocol: the job's own status is honest and versioned, and the *page* decides
    // whether that status is rendered. The status response is never doctored - only what the user
    // can see changes between stages, which is exactly the condition B07 describes.
    if (b07Enabled) {
      const stageJob = req.url.split('/')[3] ?? ''
      res.setHeader('content-type', 'application/json')
      if (req.method === 'POST' && req.url === '/api/exports') {
        b07JobId = `job-b07-${++exportJobs}`
        res.end(
          JSON.stringify({
            jobId: b07JobId,
            attempt: 0,
            version: 1,
            phase: 'processing',
            notice: null,
            retry: { permitted: false, remaining: 0, afterMs: 0, prerequisitesMet: false },
            datasetId: 'orders-q3',
            format: 'csv',
          }),
        )
        return
      }
      // The status is honest and versioned: succeeded at version 2, then failed at version 3, for
      // the same entity. The page decides only whether that status is shown.
      const job = stageJob || b07JobId
      const failed = b07Stage >= 2
      res.end(
        JSON.stringify({
          jobId: job,
          attempt: 0,
          version: failed ? 3 : 2,
          phase: failed ? 'failed' : 'succeeded',
          notice: failed
            ? 'Export could not complete. You may try again.'
            : `Export ready. ${job} is available.`,
          retry: { permitted: false, remaining: 0, afterMs: 0, prerequisitesMet: false },
          datasetId: 'orders-q3',
          format: 'csv',
        }),
      )
      return
    }
    // A minimal asynchronous export protocol: create returns processing, a status read settles it.
    if (req.method === 'POST' && req.url === '/api/exports') {
      exportJobId = `job-${++exportJobs}`
      exportCreates++
      // The job is genuinely created before the response dies: the write is committed and its
      // result is unknowable to the caller, which is what reconciliation is for.
      if (exportCreateTruncated) {
        // The job was created above; the response is what is lost. A 5xx is how the existing P04
        // case models an uncertain write. Truncating the socket instead makes Chromium re-send the
        // POST on its own, which puts two creates in the fixture and would make "one write" a
        // statement about the transport rather than about the executor.
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end('{}')
        return
      }
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          jobId: exportJobId,
          attempt: 0,
          version: 1,
          phase: 'processing',
          notice: null,
          retry: { permitted: false, remaining: 0, afterMs: 0, prerequisitesMet: false },
          datasetId: 'orders-q3',
          format: 'csv',
        }),
      )
      return
    }
    const jobId = req.url.split('/')[3] ?? ''
    const body = JSON.stringify({
      jobId,
      attempt: 0,
      version: exportSettled ? 2 : 1,
      phase: exportSettled ? 'succeeded' : 'processing',
      notice: exportSettled ? `Export ready. ${jobId} is available.` : null,
      retry: { permitted: false, remaining: 0, afterMs: 0, prerequisitesMet: false },
      datasetId: 'orders-q3',
      format: 'csv',
    })
    // A real status read takes time. The delay is what puts a background poll in flight while
    // another action is being dispatched, which is the condition under test.
    if (exportStatusDelay)
      setTimeout(() => {
        res.setHeader('content-type', 'application/json')
        res.end(body)
      }, exportStatusDelay)
    else {
      res.setHeader('content-type', 'application/json')
      res.end(body)
    }
    return
  }
  if (req.url === '/ambiguous') {
    res.setHeader('content-type', 'text/html')
    res.end('<button>Pay later</button><button>Pay</button><button>Pay</button>')
    return
  }
  if (req.url === '/retryable-page') {
    res.setHeader('content-type', 'text/html')
    paymentOutcome = 'failed'
    res.end(
      `<h1>Checkout</h1><button onclick="fetch('/api/checkout',{method:'POST'}).then(r=>r.json()).then(()=>document.querySelector('h1').textContent='Payment processing failed. Please try again. order-failed')">Pay</button><button disabled>Retrying...</button>`,
    )
    return
  }
  if (req.url === '/uncertain-page') {
    res.setHeader('content-type', 'text/html')
    paymentOutcome = 'uncertain'
    res.end(`<button onclick="fetch('/api/checkout',{method:'POST'})">Submit</button>`)
    return
  }
  if (req.url === '/closable-overlay') {
    res.setHeader('content-type', 'text/html')
    paymentOutcome = 'success'
    res.end(
      `<h1>Store</h1><button style="position:absolute;left:40px;top:40px;width:200px;height:60px" onclick="fetch('/api/checkout',{method:'POST'}).then(r=>r.json()).then(()=>document.querySelector('h1').textContent='Order Confirmed successfully order-1')">Buy</button><div style="position:fixed;inset:0;background:#ccc;z-index:100">Campaign<button onclick="this.parentElement.remove()">Close</button></div>`,
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
  paymentOutcome = 'success'
  res.setHeader('content-type', 'text/html')
  res.end(
    `<h1>Store</h1><button onclick="document.querySelector('h1').textContent='Processing...';fetch('/api/checkout',{method:'POST'}).then(r=>r.json()).then(()=>document.querySelector('h1').textContent='Order Confirmed successfully order-1')">Buy</button>`,
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
  config.features.blockerReview = false
  config.budget.totalTimeoutMs = 20000
  harness.reviews = 0
  harness.corruptCommit = false
  config.features.atomicInvestigation = false
  config.features.shortFinish = false
  clearRules()
  reviewCloseVisible = false
  journeyChange = 'none'
  writes = 0
  responseDelay = 0
  harness.models = 0
  exportJobs = 0
  exportJobId = ''
  exportSettled = false
  exportStatusDelay = 0
  exportWorkspaceAtRoot = false
  b07Enabled = false
  b07Stage = 0
  b07JobId = ''
  exportWorkspaceStart = false
  exportCreateTruncated = false
  exportCreates = 0
  exportEligibilityWorkspace = false
})

async function makeRun() {
  const r = await createRun({ goal: 'buy', environmentId: 'test', entryUrl: url })
  ids.push(r.id)
  return r
}
const call = (tools: any, name: string, input: any = {}) => tools[name].execute(input, {})

it('accepts a short explicit finish request and generates the conclusion from persisted facts', async () => {
  config.features.shortFinish = true
  let phase = 0
  harness.handler = async (tools: any) => {
    if (phase++ === 0) {
      await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Buy' })
      return []
    }
    expect(await call(tools, 'run_finish', { reason: 'x'.repeat(241) })).toMatchObject({
      error: true,
    })
    return [
      {
        toolName: 'run_finish',
        result: await call(tools, 'run_finish', { reason: 'scope-covered' }),
      },
    ]
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  const events = await getEvents(run.id)
  expect(
    events.find((e) => e.type === 'finish:accepted')?.payload,
    JSON.stringify(events.filter((e) => ['execution:stopped', 'tool:finished'].includes(e.type))),
  ).toMatchObject({
    businessResult: 'success',
    blocked: false,
    reasonCode: 'scope-covered',
  })
  expect(events.filter((e) => e.type === 'finish:requested')).toHaveLength(1)
  expect(writes).toBe(1)
  const { buildReport } = await import('../server/reports/run-report.ts')
  expect((await buildReport(run.id))?.conclusion).toMatchObject({
    reasonCode: 'scope-covered',
    source: 'persisted-evidence',
  })
})

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

// R07 end-to-end: the run's own contract decides the response-time requirement.
//
// A 12-second response is a failure against the declared ten seconds and a pass against a contract
// that asked for twenty. Nothing about the measurement changes between the two runs - only the
// contract - so a rule that agreed in both cases could not be reading the contract at all.
it('R07: judges a real measured response against the requirement the run declared', async () => {
  registerRule(responseTimeRule)
  const readCheck = async (feedbackWarningMs: number) => {
    responseDelay = 12_000
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
    // Bound to a *registered* environment id with the fixture's own origin: the id must be one
    // this build serves, while the origin the contract records is what the run actually operates on.
    const bound = bindProfile(resolveProfile({ id: 'checkout', revision: '1' })!, {
      id: 'arena',
      entryUrl: url,
      publicOrigin: url,
    })
    const run = await createRun({
      goal: 'measure feedback',
      environmentId: 'arena',
      entryUrl: url,
      businessContract: { ...bound, feedbackWarningMs } as never,
    })
    ids.push(run.id)
    await startRunExecution(run.id)
    const events = await getEvents(run.id)
    const measured = events.find((e) => e.type === 'response:observed')!.payload
    expect(Number(measured.durationMs)).toBeGreaterThanOrEqual(11_500)
    const check = events.find(
      (e) =>
        e.type === 'rule:evaluated' && (e.payload as { ruleId?: string }).ruleId === reasonRule,
    )!.payload as { verdict?: string; expected?: string }
    return check
  }
  const strict = await readCheck(10_000)
  expect(strict.verdict, JSON.stringify(strict)).toBe('fail')
  expect(strict.expected).toContain('10000')
  // The identical measurement, judged against a contract that declares twenty seconds.
  const relaxed = await readCheck(20_000)
  expect(relaxed.verdict, JSON.stringify(relaxed)).toBe('pass')
  expect(relaxed.expected).toContain('20000')
}, 60000)

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
      const hyp = await call(tools, 'hypotheses_record', {
        phenomenon: 'Buy may remain intercepted throughout a short sample',
        basis: 'Overlay is present',
        verificationPlan: 'Sample Buy hit testing',
      })
      const measured = await call(tools, 'transition_observe', {
        hypothesisId: hyp.id,
        eventType: 'overlay',
        target: 'Buy',
        selector: 'button:first-of-type',
        condition: 'element-actionable',
        durationMs: 250,
      })
      // Both nested close and underlying buy match this selector: ambiguous is unknown.
      expect(measured.samples.every((s: { value: unknown }) => s.value === null)).toBe(true)
      const exact = await call(tools, 'transition_observe', {
        hypothesisId: hyp.id,
        eventType: 'overlay',
        target: 'Buy',
        selector: 'body > button',
        condition: 'element-actionable',
        durationMs: 250,
      })
      expect(exact.samples.every((s: { value: unknown }) => s.value === false)).toBe(true)
      await call(tools, 'findings_submit', {
        hypothesisId: hyp.id,
        validationStatus: 'supported',
        severity: 'error',
        title: 'Buy intercepted during sample',
        expected: 'Operable',
        actual: 'Intercepted throughout sample',
        evidenceRefs: exact.evidenceRefs,
      })
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
      hypothesisId: hyp,
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
      expect(packet.businessOutcomeObserved.verifiedOperations).toEqual([
        { operationId: 'order-1', businessResult: 'success' },
      ])
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
      blocked: true,
      summary: 'Original evidence retained; repeat denied',
    })
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('blocked')
  expect((await getRun(run.id))?.businessResult).toBe('success')
  expect((await getEvents(run.id)).some((e) => e.type === 'write:denied')).toBe(true)
})
it.each([false, true])(
  'does not turn a policy-induced disabled retry into a supported defect (atomic=%s)',
  async (atomic) => {
    config.features.atomicInvestigation = atomic
    config.features.shortFinish = true
    registerRule({
      id: 'retry-control-test',
      revision: '1',
      name: 'Recovery control',
      description: 'Inspect recovery',
      category: 'interaction',
      enabled: true,
      async evaluate(ctx) {
        return {
          ruleId: this.id,
          ruleRevision: '1',
          verdict: ctx.snapshot.elements.some(
            (e) => e.text === 'Retrying...' && e.enabled === false,
          )
            ? 'fail'
            : 'pass',
          severity: 'error',
          title: 'Disabled recovery',
          expected: 'Operable recovery',
          actual: 'Recovery state',
          evidenceRefs: [],
          confidence: 1,
          details: {},
        }
      },
    })
    registerRule(
      compileTransitionRule('learned-retry', {
        type: 'transition',
        name: 'Recovery becomes operable',
        description: 'Operable recovery expected',
        trigger: { eventType: 'retryable-failure' },
        expectation: { condition: 'element-actionable', target: 'Recovery', timeoutMs: 250 },
        severity: 'error',
      }),
    )
    const run = await createRun({
      goal: 'Inspect recovery; Required helper must always be operable.',
      environmentId: 'test',
      entryUrl: url + '/intervention-page',
    })
    ids.push(run.id)
    let savedFinding = ''
    let clean: any
    harness.handler = async (tools: any, prompt: string) => {
      if (harness.models === 1) {
        clean = await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Pay' })
        const hypothesis = await call(tools, 'hypotheses_record', {
          phenomenon: 'Required helper is disabled',
          basis: 'Goal requires an operable helper; snapshot has enabled=false.',
          verificationPlan: 'Inspect the saved DOM state',
          trigger: 'always',
        })
        const finding = await call(tools, 'findings_submit', {
          hypothesisId: hypothesis.id,
          validationStatus: 'supported',
          severity: 'error',
          title: 'Required helper disabled',
          expected: 'Helper enabled',
          actual: 'Visible helper has enabled=false',
          evidenceRefs: clean.evidenceRefs,
        })
        savedFinding = finding.id
        // The trigger is bound to the normalized fact's public observation, so the binding names
        // the response the retry eligibility was actually read from.
        const trigger = (await getEvents(run.id)).find((e) => e.type === 'business:observation')!
        expect(trigger).toBeTruthy()
        const healthyRef = clean.elements.find((e: any) => e.text === 'Try Again').ref
        expect(
          await call(tools, 'rule_check', {
            ruleId: 'learned-retry',
            elementRef: healthyRef,
            triggerEvidenceRefs: [trigger.id],
            hypothesisIds: [],
            bindingReason: 'Visible recovery for the failed operation',
          }),
        ).toMatchObject({ verdict: 'pass' })

        const denied = await call(tools, 'page_act', {
          type: 'click',
          role: 'button',
          name: 'Try Again',
        })
        expect(denied.error).toContain('write-denied')
        expect(denied.evidenceIntegrity.status).toBe('intervened')
        const bad = denied.elements.find((e: any) => e.text === 'Retrying...')
        expect(bad.enabled).toBe(false)
        expect(writes).toBe(1)
        const bound = await call(tools, 'rule_check', {
          ruleId: 'learned-retry',
          elementRef: bad.ref,
          triggerEvidenceRefs: [trigger.id],
          hypothesisIds: [],
          bindingReason: 'Same recovery after an execution intervention',
        })
        expect(bound.verdict).toBe('unknown')
        return
      }
      const bad = JSON.parse(prompt).observation.elements.find((e: any) => e.text === 'Retrying...')
      if (atomic) {
        expect(
          await call(tools, 'investigation_check', {
            phenomenon: 'Recovery disabled after denied write',
            basis: 'Actual button now disabled',
            trigger: 'retryable-failure',
            elementRef: bad.ref,
            target: 'Recovery',
            condition: 'element-actionable',
            durationMs: 5000,
            severity: 'error',
            freshWindowReason: '',
          }),
        ).toMatchObject({
          verdict: 'unknown',
          validationStatus: 'inconclusive',
          sampleCount: 0,
          evidenceIntegrity: { status: 'intervened' },
        })
      } else {
        const h = await call(tools, 'hypotheses_record', {
          phenomenon: 'Recovery disabled after denied write',
          basis: 'Actual button now disabled',
          verificationPlan: 'Measure actionability',
          trigger: 'retryable-failure',
        })
        const measurement = await call(tools, 'transition_observe', {
          hypothesisId: h.id,
          eventType: 'retryable-failure',
          target: 'Recovery',
          elementRef: bad.ref,
          condition: 'element-actionable',
          durationMs: 5000,
        })
        expect(measurement).toMatchObject({
          evidenceStatus: 'unknown',
          samples: [],
          evidenceIntegrity: { status: 'intervened' },
        })
        const claim = {
          hypothesisId: h.id,
          validationStatus: 'supported',
          severity: 'error',
          title: 'Recovery defect',
          expected: 'Operable control',
          actual: 'Control disabled',
        }
        await expect(
          call(tools, 'findings_submit', { ...claim, evidenceRefs: measurement.evidenceRefs }),
        ).rejects.toThrow('inspection-intervention')
        // Clean historical artifacts cannot launder a hypothesis originating in an intervened state.
        await expect(
          call(tools, 'findings_submit', { ...claim, evidenceRefs: clean.evidenceRefs }),
        ).rejects.toThrow('inspection-intervention')
        await call(tools, 'findings_submit', {
          ...claim,
          validationStatus: 'inconclusive',
          evidenceRefs: measurement.evidenceRefs,
        })
      }
      // User navigation and clearing Agent-authored branches do not clear this server-owned gap.
      const observed = await call(tools, 'page_act', {
        type: 'navigate',
        url: url + '/intervention-page',
      })
      expect(observed.inspection.evidenceIntegrity.status).toBe('intervened')
      await call(tools, 'exploration_update', {
        state: 'inspection limited by policy',
        unexploredBranches: [],
      })
      expect(await call(tools, 'run_finish', { reason: 'unverified-scope' })).toMatchObject({
        accepted: true,
      })
    }
    await startRunExecution(run.id)
    expect((await getRun(run.id))?.status).toBe('blocked')
    const supported = (await getFindings(run.id)).filter((f) => f.validationStatus === 'supported')
    expect(supported.map((f) => f.id)).toEqual([savedFinding])
    const events = await getEvents(run.id)
    const intervention = events.find((e) => e.type === 'execution:intervention')!
    expect(
      events
        .filter((e) => e.seq > intervention.seq && e.type === 'rule:evaluated')
        .every((e) => e.payload.verdict === 'unknown'),
    ).toBe(true)
    const { buildReport } = await import('../server/reports/run-report.ts')
    const report = await buildReport(run.id)
    expect(report?.inspectionIntegrity.status).toBe('intervened')
    expect(report?.inspectionIntegrity.affectedArtifactIds.length).toBeGreaterThan(0)
    expect(report?.unexploredBranches.some((s) => s.startsWith('inspection-intervention:'))).toBe(
      true,
    )
    expect(report?.unknownCount).toBeGreaterThan(0)
  },
)

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
  const { buildReport } = await import('../server/reports/run-report.ts')
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
        response: { phase: 'failed', result: 'unknown', operationId: 'order-failed' },
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
      expect(packet.activeTools).not.toContain('transition_observe')
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

it('reuses evidenced navigation under a write barrier and rejects a changed handler before backend mutation', async () => {
  // Journey reuse is scoped to a contract identity (R06), so these runs carry one - as every run
  // created through the API does. Sharing it is what makes the source run's evidence reusable here.
  const contract = buildContractSnapshot(
    resolveProfile({ id: 'checkout', revision: '1' })!,
    'arena',
  )
  const create = async () => {
    const run = await createRun({
      goal: 'inspect navigation',
      environmentId: 'test',
      entryUrl: url + '/journey-page',
      businessContract: contract,
    })
    ids.push(run.id)
    return run
  }
  let step = 0
  harness.handler = async (tools: any) => {
    if (step < 2)
      await call(tools, 'page_act', {
        type: 'click',
        role: 'button',
        name: step++ === 0 ? 'Open cart' : 'Checkout',
      })
    else
      await call(tools, 'run_finish', {
        businessResult: 'unknown',
        blocked: true,
        summary: 'navigation inspected; payment not requested',
      })
  }
  const source = await create()
  await startRunExecution(source.id)
  expect(
    (await getEvents(source.id))
      .filter((e) => e.type === 'action:completed')
      .map((e) => e.payload.networkWrites),
  ).toEqual([0, 0])
  for (const changed of ['none', 'banner', 'write']) {
    journeyChange = changed
    let phase = 0
    let result: any
    harness.handler = async (tools: any, prompt: string) => {
      if (phase++ === 0) {
        const candidate = JSON.parse(prompt).availableJourneys[0]
        expect(candidate).toBeTruthy()
        result = await call(tools, 'journey_run', {
          journeyId: candidate.id,
          revision: candidate.revision,
        })
      } else
        await call(tools, 'run_finish', {
          businessResult: 'unknown',
          blocked: true,
          summary: 'navigation inspected or safely handed back',
        })
    }
    const run = await create()
    await startRunExecution(run.id)
    expect(result).toMatchObject({
      status: changed === 'none' ? 'completed' : 'handoff',
      nextStep: changed === 'none' ? 2 : changed === 'banner' ? 1 : 0,
    })
    expect(writes).toBe(0)
    expect((await getRun(run.id))?.stopReason).not.toBe('reconciliation-required')
    if (changed === 'write')
      expect(
        (await getEvents(run.id)).some(
          (e) => e.type === 'write:denied' && e.payload.reason === 'journey-read-only-boundary',
        ),
      ).toBe(true)
  }
}, 20000)

it.each([false, true])(
  'measures a novel target using its current elementRef, disabled=%s',
  async (disabled) => {
    harness.handler = async (tools: any, prompt: string) => {
      const packet = JSON.parse(prompt)
      expect(packet.activeTools).not.toContain('transition_observe')
      const elementRef = packet.observation.elements.find((e: any) => e.text === 'Try Again').ref
      const hyp = await call(tools, 'hypotheses_record', {
        phenomenon: 'Retry actionability may differ',
        basis: 'Observed target state',
        verificationPlan: 'Measure current target',
      })
      const args = {
        hypothesisId: hyp.id,
        eventType: 'test',
        target: 'retry',
        elementRef,
        condition: 'element-actionable',
        durationMs: 250,
      }
      await expect(
        call(tools, 'transition_observe', { ...args, hypothesisId: 'not-owned' }),
      ).rejects.toThrow('measurement-requires-unresolved-hypothesis')
      const measurement = await call(tools, 'transition_observe', args)
      expect(measurement.evidenceStatus).toBe('complete')
      expect(measurement.samples.every((s: any) => s.value === !disabled)).toBe(true)
      expect(measurement.elementRef).toBe(elementRef)
      await expect(call(tools, 'transition_observe', args)).rejects.toThrow('stale-or-unknown')
      await call(tools, 'run_finish', {
        businessResult: 'unknown',
        blocked: true,
        summary: 'read-only target measured',
      })
    }
    const run = await createRun({
      goal: 'measure target',
      environmentId: 'test',
      entryUrl: url + '/bound-page' + (disabled ? '-disabled' : ''),
    })
    ids.push(run.id)
    await startRunExecution(run.id)
    expect((await getRun(run.id))?.status).toBe('blocked')
    expect(writes).toBe(0)
  },
)

it('keeps unknown samples inconclusive instead of accepting them as negative proof', async () => {
  harness.handler = async (tools: any) => {
    const hyp = await call(tools, 'hypotheses_record', {
      phenomenon: 'retry might be unavailable',
      basis: 'test',
      verificationPlan: 'measure actionability',
    })
    const measured = await call(tools, 'transition_observe', {
      hypothesisId: hyp.id,
      eventType: 'test',
      target: 'retry',
      selector: '.nonexistent',
      condition: 'element-actionable',
      durationMs: 250,
    })
    expect(measured.evidenceStatus).toBe('unknown')
    const claim = {
      hypothesisId: hyp.id,
      severity: 'error',
      title: 'retry unavailable',
      expected: 'operable',
      actual: 'unknown target',
      evidenceRefs: measured.evidenceRefs,
    }
    for (const validationStatus of ['supported', 'refuted'])
      await expect(call(tools, 'findings_submit', { ...claim, validationStatus })).rejects.toThrow(
        'unknown-measurement',
      )
    await call(tools, 'findings_submit', { ...claim, validationStatus: 'inconclusive' })
    await call(tools, 'run_finish', {
      businessResult: 'unknown',
      blocked: true,
      summary: 'target could not be verified',
    })
  }
  const run = await makeRun()
  await startRunExecution(run.id)
  expect((await getFindings(run.id)).map((f) => f.validationStatus)).toEqual(['inconclusive'])
})

function reviewFixture(choice = 'observed-blocker') {
  return {
    id: 'local-review',
    model: 'typesafe/jev-1.13-20260917',
    provider: 'TypeSafe',
    answers: { completion: { choice, confidence: 0.8, probabilities: {} } },
    usage: { input_tokens: 123, output_tokens: 1, cost: 0.0001 },
  }
}
function enableBlockerReview() {
  config.features.blockerReview = true
  config.features.shortFinish = true
  config.budget.totalTimeoutMs = 40000
  registerRule(overlayBlockingRule)
}
it('commits an evidenced blocker review through canonical finish without another explorer request', async () => {
  enableBlockerReview()
  harness.review = async (body: any) => {
    expect(body.state.inspectionState.submittedFindings.total).toBe(1)
    return reviewFixture()
  }
  harness.handler = () => {
    throw Error('Full exploration unexpectedly dispatched')
  }
  const run = await createRun({
    goal: 'Inspect payment and any blocker',
    environmentId: 'test',
    entryUrl: url + '/overlay',
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  const final = await getRun(run.id)
  const events = await getEvents(run.id)
  expect(final?.stopReason).toBe('blocked')
  expect(final?.businessResult).toBe('unknown')
  expect(final?.usage.modelCalls).toBe(1)
  expect(final?.usage.modelInputTokens).toBe(123)
  const accepted = events.find((e) => e.type === 'finish:accepted')!
  expect((accepted.payload.task as { unexploredBranches: unknown[] }).unexploredBranches).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        trigger: 'always',
        description: expect.stringContaining('pending conditional outcomes are unverified'),
      }),
    ]),
  )
  expect(accepted.payload.summary).toContain('Applicable unresolved items: 1')
  expect(harness.models).toBe(0)
  expect(harness.reviews).toBe(1)
  expect(events.filter((e) => e.type === 'finish:accepted')).toHaveLength(1)
  expect(
    events.some((e) => e.type === 'tool:started' && e.payload.origin === 'completion-review'),
  ).toBe(true)
  expect(await getFindings(run.id)).toHaveLength(1)
})
it.each(['continue', 'unknown', 'scope-covered', 'error'])(
  'defers %s review once per fact version and retains full Agent finish',
  async (choice) => {
    enableBlockerReview()
    harness.review = async () => {
      if (choice === 'error') throw Error('completion-review-timeout')
      return reviewFixture(choice)
    }
    harness.handler = async (tools: any) => {
      if (harness.models === 1)
        return [{ toolName: 'page_observe', result: await tools.page_observe.execute({}) }]
      return [
        {
          toolName: 'run_finish',
          result: await tools.run_finish.execute({ reason: 'observed-blocker' }),
        },
      ]
    }
    const run = await createRun({
      goal: 'Inspect payment and any blocker',
      environmentId: 'test',
      entryUrl: url + '/overlay',
    })
    ids.push(run.id)
    await startRunExecution(run.id)
    expect(harness.reviews).toBe(1)
    expect(harness.models).toBe(2)
    const final = await getRun(run.id)
    expect(final?.stopReason).toBe('blocked')
    expect(final?.usage.modelCalls).toBe(3)
    if (choice === 'error') expect(final?.usage.modelInputTokens).toBeNull()
  },
)
it('leaves a closable overlay to exploration even if the review model would wrongly finish', async () => {
  enableBlockerReview()
  harness.review = async () => reviewFixture()
  harness.handler = async (tools: any) => {
    if (harness.models === 1)
      return [
        {
          toolName: 'page_act',
          result: await tools.page_act.execute({ type: 'click', role: 'button', name: 'Close' }),
        },
      ]
    if (harness.models === 2)
      return [
        {
          toolName: 'page_act',
          result: await tools.page_act.execute({ type: 'click', role: 'button', name: 'Buy' }),
        },
      ]
    return [
      {
        toolName: 'run_finish',
        result: await tools.run_finish.execute({ reason: 'scope-covered' }),
      },
    ]
  }
  const run = await createRun({
    goal: 'Inspect overlay and purchase',
    environmentId: 'test',
    entryUrl: url + '/closable-overlay',
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  expect(harness.reviews).toBe(0)
  expect(harness.models).toBe(3)
  expect(writes).toBe(1)
  expect((await getRun(run.id))?.businessResult).toBe('success')
})
it('cannot commit a review after cancellation', async () => {
  enableBlockerReview()
  let started!: () => void
  let release!: () => void
  const ready = new Promise<void>((r) => {
    started = r
  })
  const wait = new Promise<void>((r) => {
    release = r
  })
  harness.review = async () => {
    started()
    await wait
    return reviewFixture()
  }
  harness.handler = () => {
    throw Error('No explorer after cancellation')
  }
  const run = await createRun({
    goal: 'Inspect blocker',
    environmentId: 'test',
    entryUrl: url + '/overlay',
  })
  ids.push(run.id)
  const task = startRunExecution(run.id)
  await ready
  await cancelRunExecution(run.id)
  release()
  await task
  expect((await getRun(run.id))?.stopReason).toBe('cancelled')
  expect((await getEvents(run.id)).filter((e) => e.type === 'finish:accepted')).toHaveLength(0)
})

it('rejects a previously valid blocker proposal when the page gains a recovery control during review', async () => {
  enableBlockerReview()
  harness.review = async () => {
    reviewCloseVisible = true
    await new Promise((r) => setTimeout(r, 250))
    return reviewFixture()
  }
  harness.handler = async (tools: any, prompt: string) => {
    if (harness.models === 1) expect(JSON.parse(prompt).observation.a11yTree).toContain('Close')
    if (harness.models === 1)
      return [
        {
          toolName: 'page_act',
          result: await tools.page_act.execute({ type: 'click', role: 'button', name: 'Close' }),
        },
      ]
    return [
      {
        toolName: 'run_finish',
        result: await tools.run_finish.execute({ reason: 'unverified-scope' }),
      },
    ]
  }
  const run = await createRun({
    goal: 'Inspect blockage and recovery',
    environmentId: 'test',
    entryUrl: url + '/changing-overlay',
  })
  ids.push(run.id)
  await startRunExecution(run.id)
  const events = await getEvents(run.id)
  expect(harness.reviews).toBe(1)
  expect(harness.models).toBe(2)
  expect(
    events.some(
      (e) => e.type === 'finish:rejected' && e.payload.error === 'completion-review-state-changed',
    ),
  ).toBe(true)
  expect(
    events
      .filter((e) => e.type === 'completion-review:commit')
      .every((e) => e.payload.accepted === false),
  ).toBe(true)
})

it('quarantines a run after an uncertain completion commit and does not replay its business action', async () => {
  config.features.shortFinish = true
  harness.corruptCommit = true
  harness.handler = async (tools: any) => {
    if (harness.models === 1)
      return [
        {
          toolName: 'page_act',
          result: await tools.page_act.execute({ type: 'click', role: 'button', name: 'Buy' }),
        },
      ]
    return [
      {
        toolName: 'run_finish',
        result: await tools.run_finish.execute({ reason: 'scope-covered' }),
      },
    ]
  }
  const run = await makeRun()
  try {
    await expect(startRunExecution(run.id)).rejects.toThrow('completion-commit-unverified')
    expect(writes).toBe(1)
    expect((await getRun(run.id))?.stopReason).toBe('reconciliation-required')
    expect((await getEvents(run.id)).some((e) => e.type === 'run:storage-inconsistent')).toBe(true)
    expect(executionBusy()).toBe(true)
    const second = await makeRun()
    await startRunExecution(second.id)
    expect((await getRun(second.id))?.stopReason).toBe('reconciliation-required')
    expect(harness.models).toBe(2)
    expect(writes).toBe(1)
  } finally {
    harness.corruptCommit = false
    await acknowledgeReconciliation()
  }
})

// Regression: a business fact belongs to the action that dispatched the request producing it.
//
// The export workspace polls its own job in the background. When that poll lands while an
// unrelated action is in flight, the action used to adopt the poll's fact as its own response and
// then wait for that job's notice to appear on the page - which a cleared page can never show, so
// the action ran to the full tool timeout and the run ended in `execution-error`. The action must
// only ever see facts for operations it dispatched itself.
describe('asynchronous business response attribution', () => {
  it('does not adopt a background status poll as the response of an unrelated action', async () => {
    // Bound to the fixture's own origin: the profile's registered export-arena port is a different
    // server, and a contract must describe the boundary the run actually operates on.
    const bound = bindProfile(resolveProfile({ id: 'export', revision: '1' })!, {
      id: 'export-arena',
      entryUrl: url,
      publicOrigin: url,
    })
    exportWorkspaceAtRoot = true
    let phase = 0
    harness.handler = async (tools: any) => {
      if (phase++ === 0) {
        const started = await call(tools, 'page_act', {
          type: 'click',
          role: 'button',
          name: 'Start export',
        })
        expect(started.status, JSON.stringify(started).slice(0, 300)).toBe('completed')
        return []
      }
      // Let the job settle, then click Clear. Clearing dispatches no business write, but the page
      // refreshes the job's status as it goes and deliberately stops rendering that job. An action
      // that adopts that status response as its own then waits for a notice the page will never
      // show, and burns the tool timeout.
      exportSettled = true
      await new Promise((r) => setTimeout(r, 400))
      const cleared = await call(tools, 'page_act', {
        type: 'click',
        role: 'button',
        name: 'Clear',
      })
      expect(cleared.status, JSON.stringify(cleared).slice(0, 400)).toBe('completed')
      await call(tools, 'run_finish', { businessResult: 'unknown', blocked: true, summary: 'done' })
      return []
    }
    const run = await createRun({
      goal: 'Start an export and clear it',
      environmentId: 'test',
      entryUrl: url,
      businessContract: bound as never,
    })
    ids.push(run.id)
    await startRunExecution(run.id)
    const events = await getEvents(run.id)
    // The Clear action dispatches no write, so no background status response may be adopted as its
    // response. A misattributed one makes the action wait for that job's notice to appear on the
    // page - and when the notice belongs to another job, that wait runs to the tool timeout. So the
    // run's own outcome is the assertion: it must reach a real conclusion rather than an error.
    const stops = events
      .filter((e) => e.type === 'execution:stopped')
      .map((e) => e.payload as { error?: string; reason?: string })
    expect(stops, JSON.stringify(stops)).not.toContainEqual(
      expect.objectContaining({ error: 'tool-timeout' }),
    )
    expect((await getRun(run.id))?.status, JSON.stringify(stops)).not.toBe('error')
    // The Clear action itself must have completed, not failed on a wait it should never perform.
    const clearedAction = events.filter(
      (e) => e.type === 'tool:finished' && (e.payload as { tool?: string }).tool === 'page_act',
    )
    // The decisive observation is the action's own duration. A misattributed status response makes
    // the Clear action wait for a notice the page has already dropped, and that wait runs to the
    // full tool timeout (15s here). Correct attribution means the action finishes as soon as the
    // click settles - it has no business response to wait for at all.
    const clearDuration = (clearedAction.at(-1)?.payload as { durationMs?: number } | undefined)
      ?.durationMs
    expect(
      clearDuration,
      `Clear action durations: ${JSON.stringify(clearedAction.map((e) => (e.payload as { durationMs?: number }).durationMs))}`,
    ).toBeLessThan(2000)
  })
})

// B07: a verified terminal outcome survives ordinary navigation, and is withdrawn when the same
// entity's newest status contradicts it.
//
// The two halves belong together because they are the two sides of one rule. An executor that keeps
// its conclusion forever would fail the second half; one that re-derives from whatever is on screen
// would fail the first - re-observing a page with no business content is not new evidence about the
// business, and treating it as such would silently discard a proven result on any navigation.
describe('verified business state across navigation (B07)', () => {
  it('retains a proven outcome through navigation, then withdraws it on a newer contradiction', async () => {
    const bound = bindProfile(resolveProfile({ id: 'export', revision: '1' })!, {
      id: 'export-arena',
      entryUrl: url,
      publicOrigin: url,
    })
    b07Enabled = true
    // The model packet is where the run's own conclusion is reported to the agent, so it is where
    // retention and withdrawal are observable without reading executor internals.
    const results: Record<string, unknown>[] = []
    harness.handler = async (tools: any, prompt: string) => {
      const packet = JSON.parse(prompt)
      const observed = packet.businessOutcomeObserved as {
        businessResult?: string
        verifiedOperations?: { operationId: string }[]
      }
      results.push({ url: packet.observation?.url, ...observed })
      if (results.length === 1) {
        // A real run to a terminal success: the create's job settles on the status read, and the
        // page renders that job's notice, so the outcome verifies against visible evidence.
        const started = await call(tools, 'page_act', {
          type: 'click',
          role: 'button',
          name: 'Start export',
        })
        expect(started.status, JSON.stringify(started).slice(0, 300)).toBe('completed')
        return []
      }
      if (results.length === 2) {
        // Stage 1: ordinary navigation to a page with no business content. The proven success must
        // still be the run's conclusion after this - nothing here is new evidence about the job.
        b07Stage = 1
        await call(tools, 'page_act', { type: 'navigate', url: `${url}/` })
        return []
      }
      if (results.length === 3) {
        // Give the run another turn on the contentless page: retention is not a one-turn accident.
        await call(tools, 'page_observe', {})
        return []
      }
      if (results.length === 4) {
        // Stage 2: the page re-reads the existing job and shows only its identity. A version-3
        // failure for the same entity now exists, contradicting the proven success.
        b07Stage = 2
        await call(tools, 'page_act', { type: 'navigate', url: `${url}/` })
        return []
      }
      await call(tools, 'run_finish', { businessResult: 'unknown', blocked: true, summary: 'done' })
      return []
    }
    const run = await createRun({
      goal: 'Export a dataset and then navigate away',
      environmentId: 'test',
      entryUrl: url,
      businessContract: bound as never,
    })
    ids.push(run.id)
    await startRunExecution(run.id)

    const events = await getEvents(run.id)
    const sequence = results.map((r) => ({
      url: r.url,
      businessResult: r.businessResult,
      verified: (r.verifiedOperations as { operationId: string }[] | undefined)?.length ?? 0,
    }))
    const detail = JSON.stringify(sequence)
    // Turn 2 is the packet built *after* the click: the job's notice was visible, so the outcome is
    // proven and attributed to the entity by its own id.
    expect(sequence[1]?.businessResult, detail).toBe('success')
    expect(sequence[1]?.verified, detail).toBe(1)
    // Turns 3 and 4 are ordinary navigation onto a page with no business content. Re-observing a
    // page that says nothing about the job is not new evidence, so the proven success must survive
    // - including the second time, which rules out "retained by accident for one turn".
    expect(sequence[2]?.businessResult, detail).toBe('success')
    expect(sequence[2]?.url, detail).toBe(`${url}/`)
    expect(sequence[3]?.businessResult, detail).toBe('success')
    // The page really did stop showing the job, so those turns are genuinely contentless and the
    // retention above is a real decision rather than the same page being read twice.
    const navigated = events.filter(
      (e) => e.type === 'page:observed' && (e.payload as { url?: string }).url === `${url}/`,
    )
    expect(navigated.length, detail).toBeGreaterThanOrEqual(3)
    // The second half: the same entity's newest status is a version-3 failure, so the previously
    // proven success is no longer the newest word on it. The outcome must be withdrawn rather than
    // reported forever - the run cannot keep claiming a success the business has contradicted.
    expect(sequence[4]?.businessResult, detail).not.toBe('success')
    expect((await getRun(run.id))?.businessResult, detail).not.toBe('success')
  })
})

// P04 and P07 on the export business.
//
// Both are properties of the executor rather than of a business - an uncertain write must be
// reconciled, and a late dispatch after cancellation must not happen. They were covered only on the
// shopping arena, and export's write is a different shape: a 202 that merely *starts* an
// asynchronous job, so a create whose response is lost leaves a job running that nobody has
// correlated. The executor must reach the same conclusion there, and it must not reach it by
// replaying the create, which would leave two jobs for one intent.
describe('export side-effect and cancellation boundaries (P04, P07)', () => {
  function bindExport() {
    return bindProfile(resolveProfile({ id: 'export', revision: '1' })!, {
      id: 'export-arena',
      entryUrl: url,
      publicOrigin: url,
    })
  }

  it('P04: an export create whose response is lost is quarantined, never replayed', async () => {
    exportWorkspaceStart = true
    exportCreateTruncated = true
    let dispatched = 0
    harness.handler = async (tools: any) => {
      if (dispatched++ === 0) {
        const result = await call(tools, 'page_act', {
          type: 'click',
          role: 'button',
          name: 'Start export',
        })
        // The action itself may report the transport failure; what matters is the run's handling.
        void result
        return []
      }
      // A second attempt at the same intent. The policy must refuse it rather than write again.
      await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Start export' })
      return []
    }
    const run = await createRun({
      goal: 'Start an export',
      environmentId: 'test',
      entryUrl: url,
      businessContract: bindExport() as never,
    })
    ids.push(run.id)
    await startRunExecution(run.id)

    // The uncertain write must be reconciled explicitly, exactly as on the shopping arena.
    expect((await getRun(run.id))?.stopReason).toBe('reconciliation-required')
    // And it must not have been replayed: one committed write, one job, not two. An asynchronous
    // create makes this sharper than on the shopping arena, because a replayed create would leave a
    // second job running that nothing correlates.
    expect(exportCreates).toBe(1)
    expect(exportJobs).toBe(1)
    // The run reported the uncertainty rather than a business result it could not know.
    expect((await getRun(run.id))?.businessResult).not.toBe('success')
    // Release the latch, so the next scenario is not blocked behind this quarantine.
    await acknowledgeReconciliation()
    expect(executionBusy()).toBe(false)
  })

  it('P07: cancelling during an export model turn dispatches no late create', async () => {
    exportWorkspaceStart = true
    let release!: () => void, entered!: () => void
    const ready = new Promise<void>((r) => (entered = r)),
      waiting = new Promise<void>((r) => (release = r))
    let late: { status?: string; error?: string } | undefined
    harness.handler = async (tools: any) => {
      entered()
      await waiting
      // The late action, dispatched only after cancellation has already been requested. Whether it
      // is refused, or allowed but prevented from reaching the business, the assertion below is that
      // it must not produce a write.
      try {
        late = await call(tools, 'page_act', {
          type: 'click',
          role: 'button',
          name: 'Start export',
        })
      } catch (error) {
        late = { status: 'threw', error: String(error) }
      }
    }
    const run = await createRun({
      goal: 'Start an export',
      environmentId: 'test',
      entryUrl: url,
      businessContract: bindExport() as never,
    })
    ids.push(run.id)
    const done = startRunExecution(run.id)
    await ready
    expect(await cancelRunExecution(run.id)).toBe(true)
    release()
    await done

    expect((await getRun(run.id))?.status).toBe('cancelled')
    // The late action really was attempted and really was refused - it did not simply never run,
    // which is the difference between a lazy tool call and a protected one.
    expect(late, 'the late action was never attempted, so this case proves nothing').toBeDefined()
    // Refused by name, not merely "not completed": a tool call that silently returned nothing would
    // leave the write unprotected and this test still passing. The refusal is enforced at more than
    // one layer - removing `throwIfAborted` from the tool guard alone does not defeat it - so this
    // asserts the behaviour rather than naming the layer that produced it.
    expect(late?.error, JSON.stringify(late)).toContain('cancelled')
    // No create reached the business: export's write is a real second job here, so its absence is
    // direct evidence rather than an inference from an empty event list.
    expect(exportCreates).toBe(0)
    expect(exportJobs).toBe(0)
  })
})

// F04: the recovery eligibility resource.
//
// E1 and E2 publish the same failure payload - same notice, same `retry.permitted`,
// `prerequisitesMet` true - so nothing in the job response separates "the control is broken" from
// "recovery is deliberately unavailable". The eligibility resource is the only public source that
// does, and it is the source the workspace itself consults. A run must retain it as evidence, or
// the E2 finding it is required to report has no independent basis beyond one screenshot.
describe('retained business resources (F04)', () => {
  it('retains the recovery eligibility resource the page consulted, as citable evidence', async () => {
    exportEligibilityWorkspace = true
    const bound = bindProfile(resolveProfile({ id: 'export', revision: '1' })!, {
      id: 'export-arena',
      entryUrl: url,
      publicOrigin: url,
    })
    let clicked = false
    harness.handler = async (tools: any) => {
      if (!clicked) {
        clicked = true
        // Starting the export drives the workspace's own eligibility fetch: the resource is read
        // by the page, not by the test on the run's behalf.
        await call(tools, 'page_act', { type: 'click', role: 'button', name: 'Start export' })
        // Let the workspace finish its status read and its eligibility request before observing.
        await new Promise((r) => setTimeout(r, 600))
        return []
      }
      await call(tools, 'page_observe', {})
      return []
    }
    const run = await createRun({
      goal: 'Start an export and inspect recovery',
      environmentId: 'test',
      entryUrl: url,
      businessContract: bound as never,
    })
    ids.push(run.id)
    await startRunExecution(run.id)

    // The resource is retained under the adapter's own declared kind, and its body is the
    // published document - not a summary the executor composed.
    const retained = (await getEvents(run.id)).filter(
      (e) => e.type === 'business:resource' || e.type === 'business:observation',
    )
    const eligibility = retained.find((e) =>
      String((e.payload as { url?: string }).url ?? '').includes('/eligibility'),
    )
    expect(
      eligibility,
      `no eligibility observation was recorded; events: ${JSON.stringify(retained.map((e) => [e.type, (e.payload as { url?: string }).url]))}`,
    ).toBeDefined()
    expect(
      (eligibility!.payload as { body?: { prerequisite?: { met?: boolean } } }).body?.prerequisite
        ?.met,
    ).toBe(false)
    // And it must be exposed as a citable artifact, which is what lets a finding reference the
    // source it consulted rather than only the control's appearance.
    const artifacts = await getDbClient().execute({
      sql: 'SELECT id,type,file_path,metadata FROM artifacts WHERE run_id=?',
      args: [run.id],
    })
    const resourceRows = artifacts.rows.filter((r) => String(r.type) === 'resource')
    expect(
      resourceRows.length,
      `artifact types: ${JSON.stringify(artifacts.rows.map((r) => r.type))}`,
    ).toBe(1)
    // The artifact body is the business's own published document, not a summary the executor
    // composed: a claim about the prerequisite must be checkable against the source itself.
    const body = JSON.parse(await readFile(String(resourceRows[0]!.file_path), 'utf8'))
    expect(body.prerequisite).toEqual({
      scope: 'export.retry',
      note: 'Retrying this export is not available from this workspace.',
      met: false,
    })
    expect(body.backendPermitsRetry).toBe(true)
    // The classification is metadata, so the body stays verbatim.
    const metadata = JSON.parse(String(resourceRows[0]!.metadata))
    expect(metadata.resourceKind).toBe('recovery-eligibility')
    expect(metadata.operationId).toBe('job-elig-1')
    // A finding may only cite refs it owns, so the ref must be reachable by its own id.
    const resourceId = String(resourceRows[0]!.id)
    expect((await getEvents(run.id)).some((e) => e.evidenceRefs.includes(resourceId))).toBe(true)
  })
})
