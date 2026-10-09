import type { SharedNetworkBudget } from '../network/shared-budget.ts'
import { createHash, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { launchBrowser, saveEvidence } from '../browser.ts'
import { installRunNetworkBoundary } from '../network/boundary.ts'
import { inspectElements } from '../investigation/measure.ts'
import { getDbClient } from '../../storage/database.ts'
import type { UiContractSnapshot } from '../../inspection/contract.ts'
import type {
  CheckTask,
  BudgetLease,
  CheckResources,
  MeasurementReceipt,
  CheckResult,
} from './contract.ts'

export const bytesHash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex')
export async function checkEvidence(task: CheckTask, refs: readonly string[], owned = true) {
  if (!refs.length) throw Error('check-evidence-missing')
  for (const ref of refs) {
    const row = (
      await getDbClient().execute({
        sql: 'SELECT run_id,file_path,metadata FROM artifacts WHERE id=?',
        args: [ref],
      })
    ).rows[0]
    if (!row || row.run_id !== task.parentRunId) throw Error('check-evidence-parent-mismatch')
    const metadata = JSON.parse(String(row.metadata))
    if (
      owned &&
      (metadata.childTaskId !== task.childTaskId ||
        metadata.taskHash !== task.taskHash ||
        metadata.contractHash !== task.contractHash)
    )
      throw Error('check-evidence-owner-mismatch')
    const bytes = await readFile(String(row.file_path))
    if (owned && metadata.contentHash !== bytesHash(bytes))
      throw Error('check-evidence-bytes-mismatch')
  }
}
export async function validateCheckResult(task: CheckTask, result: CheckResult) {
  await checkEvidence(task, result.evidenceRefs)
  for (const m of result.measurements) {
    if (
      m.childTaskId !== task.childTaskId ||
      m.taskHash !== task.taskHash ||
      m.measuredAt > task.deadlineAt ||
      m.actionId !== undefined ||
      m.itemId !== undefined ||
      (result.status === 'completed' && !m.verified) ||
      m.evidenceRefs.some((ref) => !result.evidenceRefs.includes(ref))
    )
      throw Error('check-measurement-binding-invalid')
    await checkEvidence(task, m.evidenceRefs)
    let bound = false
    for (const ref of m.evidenceRefs) {
      const row = (
        await getDbClient().execute({
          sql: 'SELECT type,file_path FROM artifacts WHERE id=?',
          args: [ref],
        })
      ).rows[0]
      if (row?.type !== 'check-measurement') continue
      const saved = JSON.parse(await readFile(String(row.file_path), 'utf8'))
      if (
        saved.measurementId === m.measurementId &&
        saved.measuredAt === m.measuredAt &&
        JSON.stringify(saved.value) === JSON.stringify(m.value) &&
        saved.source?.actionId === m.actionId &&
        saved.source?.itemId === m.itemId
      )
        bound = true
    }
    if (!bound) throw Error('check-measurement-bytes-mismatch')
  }
}

export async function openCheckResources(deps: {
  task: CheckTask
  contract: UiContractSnapshot
  networkBudget: SharedNetworkBudget
  signal: AbortSignal
  budget: BudgetLease
  progress: (message: string) => Promise<void>
  emit: (type: string, payload: Record<string, unknown>, refs?: string[]) => Promise<void>
}): Promise<CheckResources> {
  const { task, signal } = deps
  let worker: Awaited<ReturnType<typeof launchBrowser>> | undefined
  let boundary: Awaited<ReturnType<typeof installRunNetworkBoundary>> | undefined
  let closed = false
  let closePromise: Promise<void> | undefined
  const evidenceRefs: string[] = []
  let intervened = false
  let tail: Promise<unknown> = Promise.resolve()
  const guard = () => {
    signal.throwIfAborted()
    if (closed || Date.now() >= task.deadlineAt) throw Error('check-resource-expired')
  }
  const metadata = () => ({
    parentRunId: task.parentRunId,
    childTaskId: task.childTaskId,
    taskHash: task.taskHash,
    contractHash: task.contractHash,
  })
  const emit = (type: string, payload: Record<string, unknown>, refs?: string[]) =>
    deps.emit(type, { ...payload, ...metadata() }, refs)
  const close = () => {
    closed = true
    return (closePromise ??= (async () => {
      // Closing the worker cancels pending network reads before draining their event tail.
      await worker?.close()
      await tail.catch(() => {})
      await boundary?.settle().catch((error) => {
        if (!signal.aborted) throw error
      })
      signal.removeEventListener('abort', abort)
      if (worker)
        await emit('check-task:resource-closed', {
          browserConnected: worker.browser.isConnected(),
          pageClosed: worker.page.isClosed(),
        })
    })())
  }
  const abort = () => {
    void close().catch(() => {})
  }
  try {
    guard()
    worker = await launchBrowser({ uiScan: true, viewport: task.start.viewport })
    // An abort during launch must still close the newly returned worker.
    guard()
    signal.addEventListener('abort', abort, { once: true })
    worker.page.setDefaultTimeout(Math.min(5000, Math.max(1, task.deadlineAt - Date.now())))
    worker.page.setDefaultNavigationTimeout(
      Math.min(10000, Math.max(1, task.deadlineAt - Date.now())),
    )
    boundary = await installRunNetworkBoundary({
      uiScan: deps.contract,
      sharedBudget: deps.networkBudget,
      narrowedScope: { maxPages: 1, maxDepth: 0 },
      page: worker.page,
      context: worker.context,
      entryUrl: task.start.url,
      signal,
      isFinished: () => closed || signal.aborted,
      sideEffectPolicy: null,
      businessRuntime: null,
      ownedOperations: new Set(),
      businessFacts: () => [],
      recordIntervention: async (payload) => {
        intervened = true
        await emit('check-task:intervention', payload)
      },
      appendEvent: (type, payload, extra) =>
        emit(`check-task:${type}`, payload, extra?.evidenceRefs),
      denyWrite: () => {},
      allowWrite: () => {
        throw Error('check-write-impossible')
      },
      countDeniedWrite: () => {},
      inspection: null,
      recordUnsupported: async (dimension, reasonCode) => {
        await emit('check-task:unsupported', { dimension, reasonCode })
      },
    })
    guard()
    await worker.page.goto(task.start.url, { waitUntil: 'domcontentloaded' })
    guard()
    await emit('check-task:resource-opened', { url: worker.page.url(), independentContext: true })
    const save = async (type: string, data: string | Buffer) => {
      guard()
      const ref = await saveEvidence(
        task.parentRunId,
        type,
        data,
        { ...metadata(), contentHash: bytesHash(data) },
        guard,
      )
      evidenceRefs.push(ref)
      return ref
    }
    return {
      signal,
      budget: deps.budget,
      progress: deps.progress,
      close,
      evidenceRefs: () => [...evidenceRefs],
      measure(selector) {
        const operation = tail.then(async (): Promise<MeasurementReceipt> => {
          guard()
          deps.budget.consume('reads')
          await boundary!.flush?.()
          const value = await inspectElements(worker!.page, selector, 0)
          guard()
          const screenshot = await save('screenshot', await worker!.page.screenshot())
          const measurementId = randomUUID()
          const measuredAt = Date.now()
          const evidence = await save(
            'check-measurement',
            JSON.stringify({
              ...metadata(),
              measurementId,
              measuredAt,
              parentSource: task.source,
              url: worker!.page.url(),
              selector,
              value,
            }),
          )
          await boundary!.flush?.()
          guard()
          const verified =
            !intervened &&
            value.total === 1 &&
            value.elements.length === 1 &&
            value.elements[0].exists === true &&
            value.elements[0].viewportFraction !== null
          const receipt: MeasurementReceipt = {
            measurementId,
            childTaskId: task.childTaskId,
            taskHash: task.taskHash,
            measuredAt,
            verified,
            evidenceRefs: [screenshot, evidence],
            value,
          }
          await emit('check-task:measurement', { receipt }, receipt.evidenceRefs)
          return receipt
        })
        tail = operation.catch(() => {})
        return operation
      },
    }
  } catch (error) {
    await close()
    throw error
  }
}

export const measurementHandler: import('./contract.ts').CheckHandler = async (task, resources) => {
  await resources.progress('measuring target with original executor')
  const measurement = await resources.measure(task.target!.selector)
  return {
    status: measurement.verified ? 'completed' : 'unverified',
    measurements: [measurement],
    evidenceRefs: measurement.evidenceRefs,
    unchecked: measurement.verified
      ? []
      : ['target absent, ambiguous, unsupported geometry or network intervention'],
  }
}
