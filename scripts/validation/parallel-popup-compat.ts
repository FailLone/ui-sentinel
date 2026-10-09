/** Compatibility probe against a PINNED committed popup implementation, not uncommitted files. */
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const popupCommit = 'b25748e7d20faeb8ce934b2d63d9f692ca35f55a'
const out = resolve('data/parallel-popup-compat', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(out, { recursive: true })
const files = [
  'src/execution/popup/runtime.ts',
  'src/execution/popup/geometry.ts',
  'src/agent/popup/contract.ts',
  'src/shared/popup-policy.ts',
]
const sourceHashes: Record<string, string> = {}
for (const file of files) {
  const bytes = execFileSync('git', ['show', `${popupCommit}:${file}`])
  const target = resolve(out, 'pinned', file)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes)
  sourceHashes[file] = createHash('sha256').update(bytes).digest('hex')
}
const entry = resolve(out, 'pinned/entry.ts')
await writeFile(
  entry,
  `export {createPopupRuntime} from './src/execution/popup/runtime.ts'; export {popupCollector} from './src/execution/popup/geometry.ts';`,
)
const bundled = resolve(out, 'popup.mjs')
await build({
  entryPoints: [entry],
  outfile: bundled,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
})
const upstream = await import(pathToFileURL(bundled).href)
const fixture = createServer(async (_req, res) => {
  await new Promise((r) => setTimeout(r, 150))
  res.setHeader('content-type', 'text/html')
  res.end(
    '<dialog open style="position:fixed;left:20px;top:20px;margin:0;width:400px;height:100px;box-sizing:border-box">Visible dialog</dialog>',
  )
})
await new Promise<void>((r) => fixture.listen(0, '127.0.0.1', r))
const origin = `http://127.0.0.1:${(fixture.address() as { port: number }).port}`
Object.assign(process.env, {
  DATABASE_URL: `file:${out}/runs.db`,
  URL_SCAN_TRUSTED_ORIGINS: origin,
  URL_SCAN_DNS_MODE: 'system',
  DOTENV_CONFIG_PATH: `${out}/absent.env`,
  AGENT_MODEL: '',
  VISION_MODEL: '',
  OPENAI_API_KEY: '',
  OPENROUTER_API_KEY: '',
  COMPLETION_REVIEW_API_KEY: '',
  VISION_API_KEY: '',
})
const [
  { launchBrowser, saveEvidence },
  { installRunNetworkBoundary },
  { createRun, appendEvent },
  { resolveUiScanContract },
  { createSharedCheckBudget },
  { createSharedNetworkBudget },
  { DEFAULT_LIMITS },
  { createCheckScheduler },
  { popupCheckResult },
  { checkEvidence },
] = await Promise.all([
  import('../../src/execution/browser.ts'),
  import('../../src/execution/network/boundary.ts'),
  import('../../src/execution/run-manager.ts'),
  import('../../src/inspection/contract.ts'),
  import('../../src/execution/check-tasks/budget.ts'),
  import('../../src/execution/network/shared-budget.ts'),
  import('../../src/execution/network/session.ts'),
  import('../../src/execution/check-tasks/scheduler.ts'),
  import('../../src/execution/check-tasks/popup-adapter.ts'),
  import('../../src/execution/check-tasks/resources.ts'),
])
const resolved = resolveUiScanContract(
  { kind: 'ui-scan', entryUrl: origin + '/' },
  { reachableOrigins: [origin] },
)
assert.equal(resolved.kind, 'resolved')
if (resolved.kind !== 'resolved') throw Error('contract')
const contract = resolved.contract
const run = await createRun({
  kind: 'ui-scan',
  uiContract: contract,
  goal: contract.goal,
  entryUrl: contract.entryUrl,
  environmentId: 'default',
})
const parent = new AbortController(),
  network = createSharedNetworkBudget(DEFAULT_LIMITS)
let reads = 0,
  semanticCalls = 0,
  actions = 0
const budget = createSharedCheckBudget({
  remaining: () => ({ actions: 0, modelCalls: 0, reads: 4 - reads }),
  charge: (key, n) => {
    assert.equal(key, 'reads')
    reads += n
  },
})
const owned = new Map<string, { page: any; collector: any; evidence: Map<string, string> }>()
const host = createCheckScheduler({
  parentRunId: run.id,
  contractHash: contract.hash,
  signal: parent.signal,
  deadlineAt: Date.now() + 15000,
  budget,
  admit: async () => {},
  open: async (task, signal, lease, progress) => {
    const worker = await launchBrowser({ uiScan: true, viewport: task.start.viewport })
    let boundary: Awaited<ReturnType<typeof installRunNetworkBoundary>> | undefined
    let collector: any
    const stop = () => {
      void worker.close()
    }
    signal.addEventListener('abort', stop, { once: true })
    const close = async () => {
      await collector?.dispose()
      await worker.close()
      await boundary?.settle()
      signal.removeEventListener('abort', stop)
    }
    try {
      boundary = await installRunNetworkBoundary({
        uiScan: contract,
        sharedBudget: network,
        narrowedScope: { maxPages: 1, maxDepth: 0 },
        page: worker.page,
        context: worker.context,
        entryUrl: task.start.url,
        signal,
        isFinished: () => signal.aborted,
        sideEffectPolicy: null,
        businessRuntime: null,
        ownedOperations: new Set(),
        businessFacts: () => [],
        recordIntervention: async () => {
          throw Error('unexpected intervention')
        },
        appendEvent: async (kind, payload) => {
          await appendEvent(run.id, kind, payload)
        },
        denyWrite: () => {},
        allowWrite: () => {
          throw Error('write')
        },
        countDeniedWrite: () => {},
        inspection: null,
        recordUnsupported: async () => {},
      })
      await worker.page.goto(task.start.url)
      collector = upstream.popupCollector(worker.page)
      owned.set(task.childTaskId, { page: worker.page, collector, evidence: new Map() })
      return {
        signal,
        budget: lease,
        progress,
        measure: async () => {
          throw Error('unused generic measure')
        },
        close,
      }
    } catch (error) {
      await close()
      throw error
    }
  },
  handler: async (task, resources) => {
    const context = owned.get(task.childTaskId)!
    const guard = () => {
      resources.signal.throwIfAborted()
      if (Date.now() >= task.deadlineAt) throw Error('expired')
    }
    const save = async (kind: string, data: Buffer | string) => {
      guard()
      const ref = await saveEvidence(
        run.id,
        kind,
        data,
        {
          parentRunId: run.id,
          childTaskId: task.childTaskId,
          taskHash: task.taskHash,
          contractHash: task.contractHash,
          contentHash: createHash('sha256').update(data).digest('hex'),
        },
        guard,
      )
      context.evidence.set(ref, typeof data === 'string' ? data : '')
      return ref
    }
    const runtime = upstream.createPopupRuntime({
      signal: resources.signal,
      guard,
      goal: task.purpose,
      taskId: task.childTaskId,
      contractHash: task.contractHash,
      remaining: () => ({ actions: 0, calls: 0, timeMs: task.deadlineAt - Date.now() }),
      frame: async () => {
        resources.budget.consume('reads')
        const frame = await context.collector.capture()
        return {
          binding: frame.binding,
          reusable: frame.complete,
          url: context.page.url(),
          evidenceRefs: [],
          entries: [],
          panels: frame.facts,
        }
      },
      decide: async () => {
        semanticCalls++
        throw Error('semantic calls are forbidden')
      },
      act: async () => {
        actions++
        throw Error('actions are forbidden')
      },
      measure: (id: string, expected: unknown) =>
        context.collector.measure(id, resources.signal, expected),
      screenshot: async () => save('screenshot', await context.page.screenshot()),
      save,
      seal: async (refs: string[]) => {
        const hashes: Record<string, string> = {}
        for (const ref of refs) {
          const data = await readFile(resolve('data/artifacts', run.id, ref))
          hashes[ref] = createHash('sha256').update(data).digest('hex')
        }
        return hashes
      },
      emit: async (kind: string, payload: Record<string, unknown>, refs: string[]) => {
        await appendEvent(
          run.id,
          `compat:${kind}`,
          { ...payload, childTaskId: task.childTaskId },
          { evidenceRefs: refs },
        )
      },
      settle: async () => {}, // Evidence compatibility only: does NOT resolve a parent item.
    })
    const state = await runtime.step()
    return popupCheckResult(task, state, async (ref) => {
      await checkEvidence(task, state.evidenceRefs)
      const receipt = JSON.parse(context.evidence.get(ref)!)
      assert.equal(receipt.taskId, task.childTaskId)
      assert.equal(receipt.actionId, null)
      assert.equal(receipt.itemId, null)
      assert.deepEqual(receipt.measurement, state.measurement)
      assert.equal(receipt.measurement.samples.length, 2)
      return {
        measurementId: ref,
        childTaskId: task.childTaskId,
        taskHash: task.taskHash,
        measuredAt: Date.now(),
        verified: receipt.measurement.verdict !== 'unknown',
        evidenceRefs: state.evidenceRefs,
        value: receipt,
      }
    })
  },
  validateResult: async (task, result) => {
    await checkEvidence(task, result.evidenceRefs)
  },
  emit: async (type, snapshot) => {
    await appendEvent(run.id, type, { snapshot }, { evidenceRefs: snapshot.result?.evidenceRefs })
  },
})
try {
  const deadlineAt = Date.now() + 12000
  await Promise.all(
    [320, 640].map((width, i) =>
      host.submit({
        version: 1,
        key: `popup-${i}`,
        kind: 'element-measurement',
        purpose: 'Read-only already-visible popup compatibility',
        target: { selector: 'dialog' },
        start: { url: contract.entryUrl, viewport: { width, height: 480 }, prerequisites: [] },
        publicFacts: [],
        evidenceRefs: [],
        permissions: { session: 'anonymous', writes: 'none', actions: 'none' },
        quota: { actions: 0, modelCalls: 0, reads: 2 },
        deadlineAt,
      }),
    ),
  )
  while (host.status().some((s) => ['running', 'queued'].includes(s.status))) await host.wait(1000)
  const tasks = host.status()
  assert.deepEqual(
    tasks.map((t) => t.status),
    ['defect', 'completed'],
    JSON.stringify(tasks),
  )
  assert.equal(actions, 0)
  assert.equal(semanticCalls, 0)
  const denied = await popupCheckResult(
    tasks[0].task,
    {
      status: 'handoff',
      reason: 'popup-action-budget',
      missing: ['entry action unavailable'],
      evidenceRefs: [],
    },
    async () => {
      throw Error('must not bind handoff as completed')
    },
  )
  assert.equal(denied.status, 'unverified')
  const summary = {
    popupCommit,
    sourceHashes,
    paidRequests: 0,
    actions,
    semanticCalls,
    tasks,
    handoff: denied,
    limitation:
      'Pinned real runtime/collector compatibility for already-visible panels only. Original action/item/Jev product delegation remains unintegrated; this is not the ordinary API popup entry.',
  }
  await writeFile(resolve(out, 'summary.json'), JSON.stringify(summary, null, 2))
  console.log(
    JSON.stringify({
      output: out,
      popupCommit,
      verdicts: tasks.map((t) => t.status),
      paidRequests: 0,
    }),
  )
} finally {
  await host.close()
  fixture.closeAllConnections()
  await new Promise<void>((r) => fixture.close(() => r()))
}
