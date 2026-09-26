import { isAllowedBusinessDownload } from './download-policy.ts'
import { createRunQueue } from './run-queue.ts'
import {
  actionInput,
  journeyInput,
  ruleSearchInput,
  ruleDetailsInput,
  historyReadInput,
  toolResultReadInput,
  observeInput,
  checksInput,
  elementDetailsInput,
  hypothesisInput,
  transitionInput,
  findingInput,
  explorationInput,
} from './tool-inputs.ts'
import { inspectionPolicy } from '../agent/policy.ts'
import { verifyCompletionCommit } from './completion-integrity.ts'
import { createEvidenceIntegrity } from './evidence-integrity.ts'
import { cleanEvidenceIntegrity, interventionLimitation } from '../shared/evidence-integrity.ts'
import {
  createTemporalInvestigator,
  temporalInvestigationInput,
  type InvestigationResult,
} from './temporal-investigation.ts'
import { loadJourneys, conditionMatches } from './journeys/library.ts'
import { runJourney } from './journeys/runner.ts'
import { createRuleEvaluationCache, ruleCatalog } from '../rules/routing.ts'
import type { RuleContext } from '../rules/types.ts'
import {
  readObservationVersion,
  sameObservationVersion,
  type ObservationVersion,
} from './observation-version.ts'
import { ExecutionProfile, profileOperation } from './profiling.ts'
import { executionVersions } from './versions.ts'
import { Agent } from '@mastra/core/agent'
import {
  blockerEvidenceEligible,
  hasRecoveryOpportunity,
  blockerReviewBody,
  requestBlockerReview,
} from '../agent/decisions/blocker-review.ts'
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { randomUUID, createHash } from 'node:crypto'
import {
  getRun,
  updateRunStatus,
  appendEvent,
  getEvents,
  getFindings,
  registerActiveRun,
  removeActiveRun,
  submitFinding,
  recordHypothesis,
  updateHypothesis,
} from './run-manager.ts'
import {
  launchBrowser,
  observePage,
  saveEvidence,
  isAllowedPageUrl,
  isAllowedNavigationUrl,
  annotateEvidence,
  captureA11yTree,
  sampleElementCondition,
  sampleBoundElementCondition,
} from './browser.ts'
import { createVisionLocator } from './vision.ts'
import { config, checkModelConfig } from '../shared/config.ts'
import { sampleWindow } from './sample-window.ts'
import { agentModel } from '../shared/model.ts'
import { getDbClient } from '../storage/database.ts'
import { runChecks, getEnabledRules, getRule } from '../rules/engine.ts'
import { evaluateTransition, type TransitionObservation } from '../rules/transition.ts'
import { ruleCheckInput, resolveRuleContract, retryTrigger } from './rule-binding.ts'
import {
  normalizeFactEvents,
  latestFactForOperation,
  retryableTriggerFromFacts,
} from '../business/facts.ts'
import { createSideEffectPolicy } from './side-effect-policy.ts'
import {
  createBusinessRuntime,
  concludeBusinessResult,
  verifyContractSnapshot,
  type BusinessRuntime,
} from '../business/runtime.ts'
import { legacyCompatibleContract } from '../business/registry.ts'
import type { BusinessFact } from '../business/adapters/types.ts'
import type { PageSnapshot } from '../rules/types.ts'
import type { RunUsage, BusinessResult, StopReason } from '../shared/types.ts'
import { createRequestTracker, type RequestTracker } from '../agent/model/request-tracker.ts'
import { analyzeInputComposition } from '../agent/context/input-analyzer.ts'
import {
  classifyResponse,
  summarizeProgress,
  type ProgressClassification,
} from '../agent/context/progress-classifier.ts'
import { createElementStore } from './element-store.ts'
import type { SlimSnapshot } from './observation-slim.ts'
import { createStaleDetector } from './stale-detector.ts'
import { extractToolSummary, type HistoryEntry } from '../agent/context/compact-history.ts'
import { executeModelRequest, guardModelAttempt, beginAttemptTool } from '../agent/model/request.ts'
import { createTaskState } from './task-state.ts'
import {
  decisionMemory,
  boundedHistoryPage,
  readToolResult,
  findingMemory,
} from '../agent/context/decision-memory.ts'
import { createPhaseTracker } from './run-phase.ts'
import { createProgressDetector, type ProgressFacts } from './progress-detector.ts'
import { legacyFinishInput, shortFinishInput, resolveShortFinish } from './finish-contract.ts'
import {
  finishNote,
  journeyRunDescription,
  missingOutcomeFacts,
  pageActDescription,
  retainedResourceGuidance,
  completedCheckNextStep,
} from './tool-guidance.ts'

const queue = createRunQueue(executeRun)
export const {
  startRunExecution,
  cancelRunExecution,
  executionBusy,
  reconcileInterruptedRuns,
  acknowledgeReconciliation,
} = queue

async function executeRun(runId: string): Promise<void> {
  const profile = new ExecutionProfile()
  return profile.run(() => executeProfiledRun(runId, profile))
}

async function executeProfiledRun(runId: string, profile: ExecutionProfile): Promise<void> {
  const run = await getRun(runId)
  if (!run || run.status !== 'queued' || queue.isCancellationRequested(runId)) return
  if (queue.requiresReconciliation()) {
    await updateRunStatus(runId, 'interrupted', { stopReason: 'reconciliation-required' })
    await appendEvent(runId, 'run:completed', {
      status: 'interrupted',
      stopReason: 'reconciliation-required',
    })
    return
  }
  const check = checkModelConfig()
  if (!check.ready) {
    await updateRunStatus(runId, 'execution-error', { stopReason: 'execution-error' })
    await appendEvent(runId, 'run:error', {
      error: 'configuration-missing',
      missing: check.missing,
    })
    return
  }
  const legacyUnversioned = !run.spec.businessContract
  let businessRuntime: BusinessRuntime
  try {
    const contract = run.spec.businessContract ?? legacyCompatibleContract(run.spec.entryUrl)
    if (!verifyContractSnapshot(contract)) throw Error('business-contract-hash-mismatch')
    if (contract.environment.publicOrigin !== new URL(run.spec.entryUrl).origin)
      throw Error('business-contract-origin-mismatch')
    businessRuntime = createBusinessRuntime(contract)
  } catch (error) {
    await appendEvent(runId, 'execution:stopped', {
      reason: 'execution-error',
      error: String(error),
    })
    await updateRunStatus(runId, 'execution-error', { stopReason: 'execution-error' })
    await appendEvent(runId, 'run:completed', {
      status: 'execution-error',
      businessResult: 'unknown',
      stopReason: 'execution-error',
    })
    return
  }
  const active = registerActiveRun(runId),
    signal = active.abortController.signal
  const startedAt = Date.now(),
    budget = run.spec.budget
  let timedOut = false,
    sideEffectPending = false
  const usage = {
    actions: 0,
    modelCalls: 0,
    elapsedMs: 0,
    modelInputTokens: 0,
    modelOutputTokens: 0,
  }
  let modelUsageAvailable = true,
    reportedModelCalls = 0
  let businessResult: BusinessResult = 'unknown',
    stopReason: StopReason = 'budget-exhausted'
  let worker: Awaited<ReturnType<typeof launchBrowser>> | undefined
  let latest: Awaited<ReturnType<typeof observePage>> | undefined
  const inspectedResultRefs = new Set<string>()
  let attemptTools = 0
  let attemptReads = 0
  let finished = false
  let stepId = 'initial'
  const transitions: NonNullable<PageSnapshot['transitionObservations']>[number][] = []
  const notes: unknown[] = []
  // The run's business is fixed by its persisted contract. A run created before contracts were
  // persisted has no versioned business at all: it keeps the original shopping *protocol*, but no
  // requirements, thresholds or effects may be invented for it from today's registry. Its boundary
  // is the entry URL it was actually created with, which is why the network checks below are
  // anchored to the run's own recorded environment rather than to a freshly resolved one.
  const businessContract = businessRuntime.contract
  /**
   * The network boundary this run actually operates on.
   *
   * For a versioned run this is the contract's own persisted origin. A legacy run has no persisted
   * origin, so its boundary is the entry URL it was created with - never the port today's registry
   * happens to resolve to, which would block the run's own document and let a stale port decide
   * what the browser may reach.
   */
  const runOrigin = new URL(run.spec.entryUrl).origin
  let businessFacts: BusinessFact[] = []
  const ownedOperations = new Set<string>()
  let drainResponses: () => Promise<void> = async () => {}
  let closeResponses: () => Promise<void> = async () => {}
  const verifiedByOperation = new Map<string, { result: BusinessResult; evidenceRefs: string[] }>()
  /**
   * Public business resources this run retained, keyed by their artifact id.
   *
   * These are not facts about the entity's state, so they are kept separately: they are the
   * business's own documents that a claim must cite when the claim is about them. The E2 defect -
   * a recovery control that cannot be operated although the API permits the retry - is legible only
   * against the eligibility resource, whose prerequisite the workspace itself obeys.
   */
  const retainedResources: {
    kind: string
    operationId: string | null
    url: string
    evidenceRefs: string[]
    value: unknown
  }[] = []

  const requestTracker = createRequestTracker()
  const ruleEvaluationCache = createRuleEvaluationCache()
  const classifications: ProgressClassification[] = []
  const taskState = createTaskState(run.spec.goal)
  const integrity = createEvidenceIntegrity()
  const evidenceMetadata = () => ({ evidenceIntegrity: integrity.snapshot() })
  const completionGaps = () => [...taskState.completionGaps(), ...integrity.gaps()]
  async function recordIntervention(input: Parameters<typeof integrity.intervene>[0]) {
    const intervention = integrity.intervene(input)
    await appendEvent(
      runId,
      'execution:intervention',
      { ...intervention, limitation: interventionLimitation },
      { stepId },
    )
    return intervention
  }
  const findingFacts = new Set<string>()
  const measurementFacts = new Set<string>()
  let noToolStreak = 0
  let noProgressDecisions = 0
  const phaseTracker = createPhaseTracker(budget)
  const progressDetector = createProgressDetector()
  const knownHypothesisIds = new Set<string>()
  const ruleCheckResults: {
    checkId: string
    ruleId: string
    bindingId: string
    operationId: string
    elementRef: string
    verdict: 'pass' | 'fail' | 'unknown'
    findingId?: string
    evidenceRefs: string[]
    hypothesisId?: string
  }[] = []
  const boundCache: {
    handle: import('playwright').ElementHandle<SVGElement | HTMLElement>
    fingerprint: string
    triggerRef: string
    lastValue: boolean | null
    result: (typeof ruleCheckResults)[number]
  }[] = []
  let temporalInvestigator: ReturnType<typeof createTemporalInvestigator> | undefined
  const completedInvestigations: InvestigationResult[] = []
  let observeCount = 0
  let observationVersion: ObservationVersion | undefined
  let observedBusinessCount = -1
  let observedIntegrityEpoch = -1
  let observationReused = false
  let latestChecks: Awaited<ReturnType<typeof runChecks>> | undefined
  const elementStore = createElementStore()
  const staleDetector = createStaleDetector()
  let latestSlim: SlimSnapshot | undefined
  let latestA11y: string | undefined
  const history: HistoryEntry[] = []
  const referenceIndex = () =>
    latestSlim?.elements.map((e) => ({
      ref: e.ref,
      tag: e.tag,
      text: e.text,
      enabled: e.enabled,
      visible: e.visible,
      blockedPoints: e.hit.blocked,
    })) ?? []
  const timer = setTimeout(() => {
    timedOut = true
    active.abortController.abort(new Error('budget-exhausted'))
  }, budget.totalTimeoutMs)
  const guard = () => {
    signal.throwIfAborted()
    guardModelAttempt()
    if (Date.now() - startedAt >= budget.totalTimeoutMs) throw new Error('budget-exhausted')
  }
  const countModel = () => {
    guard()
    if (usage.modelCalls >= budget.maxModelCalls) throw new Error('budget-exhausted')
    usage.modelCalls++
  }
  let toolTail: Promise<unknown> = Promise.resolve()
  function serial<T>(tool: string, fn: () => Promise<T>, reviewedDecisionId?: string): Promise<T> {
    // Captured by AsyncLocalStorage from the originating generate attempt.
    // A read-only review is committed by the executor after fresh validation, not by a late model callback.
    if (reviewedDecisionId) guard()
    const attemptId = reviewedDecisionId ?? beginAttemptTool()
    if (['history_read', 'tool_result_read'].includes(tool) && ++attemptReads > 3)
      return Promise.resolve({
        error:
          'At most three retrieval pages per decision. Inspect the returned pages before requesting more.',
      } as T)
    if (++attemptTools > 8)
      return Promise.resolve({
        error: 'At most eight tools per decision; inspect the delivered results before continuing.',
      } as T)
    const p = toolTail.then(async () => {
      guard()
      if (finished) throw new Error('run already finished')
      const denied = phaseTracker.authorizeTool(tool, taskState.hasOpenHypotheses())
      if (denied) return { error: denied, status: 'denied' } as T
      const toolCallId = randomUUID(),
        toolStartedAt = Date.now()
      const deadline = setTimeout(
        () => active.abortController.abort(new Error('tool-timeout')),
        config.budget.toolTimeoutMs,
      )
      await appendEvent(runId, 'tool:started', {
        attemptId,
        toolCallId,
        tool,
        origin: reviewedDecisionId ? 'completion-review' : 'agent',
        startedAt: toolStartedAt,
        deadlineAt: toolStartedAt + config.budget.toolTimeoutMs,
      })
      try {
        guard()
        const result = await profileOperation('tool', fn, { tool, toolCallId })
        await appendEvent(runId, 'tool:finished', {
          attemptId,
          toolCallId,
          tool,
          status: result && typeof result === 'object' && 'error' in result ? 'error' : 'success',
          durationMs: Date.now() - toolStartedAt,
        })
        return result
      } catch (error) {
        await appendEvent(runId, 'tool:finished', {
          attemptId,
          toolCallId,
          tool,
          status: 'error',
          error: String(error),
          durationMs: Date.now() - toolStartedAt,
        })
        throw error
      } finally {
        clearTimeout(deadline)
      }
    })
    toolTail = p.catch(() => {})
    return p
  }
  const reportedUsage = (): RunUsage => ({
    ...usage,
    elapsedMs: Date.now() - startedAt,
    modelInputTokens:
      reportedModelCalls > 0 && modelUsageAvailable && reportedModelCalls === usage.modelCalls
        ? usage.modelInputTokens
        : null,
    modelOutputTokens:
      reportedModelCalls > 0 && modelUsageAvailable && reportedModelCalls === usage.modelCalls
        ? usage.modelOutputTokens
        : null,
  })
  const persistUsage = () => updateRunStatus(runId, 'running', { usage: reportedUsage() })
  const checks = () => profileOperation('rules', performChecks)
  async function performChecks() {
    if (!latest) throw new Error('Observe first')
    const events = await getEvents(runId)
    const context: RuleContext = {
      runId,
      currentUrl: latest.snapshot.url,
      pageTitle: latest.snapshot.title,
      timestamp: latest.snapshot.observedAt,
      events,
      // The run's own declared feedback requirement, so the response-time rule judges against what
      // this contract states rather than a remembered default.
      feedbackWarningMs: businessContract.feedbackWarningMs,
      factVersion: observationVersion?.reusable ? observationVersion.key : undefined,
      observedTriggers: (function () {
        const t = retryTrigger(events, latest!.snapshot.text)
        return t ? [t.eventType] : []
      })(),
      snapshot: { ...latest.snapshot, transitionObservations: transitions } as PageSnapshot,
    }
    const result = await runChecks(
      context,
      config.features?.ruleRouting ? { route: true, cache: ruleEvaluationCache } : undefined,
    )
    for (const skipped of result.skipped ?? []) await appendEvent(runId, 'rule:skipped', skipped)
    const existing = await getFindings(runId)
    for (const r of result.results) {
      if (result.reused?.includes(r.ruleId)) {
        await appendEvent(runId, 'rule:check-reused', {
          ruleId: r.ruleId,
          revision: r.ruleRevision,
          source: 'automatic',
          evidenceRefs: r.evidenceRefs,
          factVersion: context.factVersion,
        })
        continue
      }
      const refs = [...new Set([...latest.evidenceRefs, ...r.evidenceRefs])]
      if (r.verdict === 'fail' && Array.isArray(r.details.blockedTargets)) {
        const targets = r.details.blockedTargets as {
          bounds: { x: number; y: number; width: number; height: number }
        }[]
        if (targets.length) {
          try {
            refs.push(
              await annotateEvidence(
                worker!.browser,
                runId,
                latest.snapshot.screenshotPath,
                targets.map((t) => t.bounds),
                latest.snapshot.viewport,
              ),
            )
          } catch (error) {
            await appendEvent(runId, 'evidence:annotation-unavailable', { error: String(error) })
          }
        }
      }
      await appendEvent(
        runId,
        'rule:evaluated',
        { ...r, evidenceRefs: refs },
        { stepId, evidenceRefs: refs },
      )
      if (
        r.verdict === 'fail' &&
        !transitions.some((o) => o.binding?.ruleId === r.ruleId) &&
        !existing.some((f) => f.ruleId === r.ruleId && f.actual === r.actual)
      ) {
        const f = await submitFinding({
          runId,
          source: 'rule',
          ruleId: r.ruleId,
          ruleRevision: r.ruleRevision,
          hypothesisId: null,
          validationStatus: 'supported',
          severity: r.severity,
          title: r.title,
          expected: r.expected,
          actual: r.actual,
          stepId,
          evidenceRefs: refs,
        })
        findingFacts.add(JSON.stringify([f.ruleId, f.actual, f.validationStatus]))
        await appendEvent(
          runId,
          'finding:submitted',
          { findingId: f.id, details: r.details },
          { stepId, evidenceRefs: refs },
        )
      }
    }
    latestChecks = result
    return result
  }
  const observe = (allowReuse = false) =>
    profileOperation('observation', () => performObservation(allowReuse))
  async function performObservation(allowReuse: boolean) {
    guard()
    await drainResponses()
    observationReused = false
    const optimized = config.features?.observation === true
    let before = optimized ? await readObservationVersion(worker!.page) : undefined
    if (optimized && allowReuse && latest && before) {
      await appendEvent(runId, 'observation:validated', {
        version: before.key,
        reusable: before.reusable,
        reason: before.reason,
      })
      if (
        sameObservationVersion(observationVersion, before) &&
        observedBusinessCount === businessFacts.length &&
        observedIntegrityEpoch === integrity.epoch()
      ) {
        observationReused = true
        await appendEvent(runId, 'observation:reused', {
          snapshotId: latestSlim?.snapshotId,
          reason: before.reason,
          version: before.key,
          evidenceRefs: latest.evidenceRefs,
        })
        return latest
      }
    }
    observeCount++
    latest = await observePage(worker!.page, runId, evidenceMetadata)
    latestA11y = await captureA11yTree(worker!.page)
    let after = optimized ? await readObservationVersion(worker!.page) : undefined
    if (before?.reusable && after?.reusable && before.key !== after.key) {
      await appendEvent(runId, 'observation:inconsistent', {
        reason: 'state changed across screenshot/DOM/a11y; recapturing',
        evidenceRefs: latest.evidenceRefs,
      })
      before = after
      latest = await observePage(worker!.page, runId, evidenceMetadata)
      latestA11y = await captureA11yTree(worker!.page)
      after = await readObservationVersion(worker!.page)
      if (after.reusable && before.key !== after.key)
        throw Error('observation-changing: cannot establish consistent evidence')
    }
    observationVersion =
      before && after && sameObservationVersion(before, after) ? after : undefined
    await drainResponses()
    observedBusinessCount = businessFacts.length
    observedIntegrityEpoch = integrity.epoch()
    const snapshotId = `s${observeCount}`
    latestSlim = elementStore.registerSnapshot(
      snapshotId,
      latest.snapshot,
      latest.snapshot.screenshotPath,
    )
    await appendEvent(
      runId,
      'page:observed',
      {
        snapshotRef: latest.evidenceRefs[1],
        url: latest.snapshot.url,
        observedAt: latest.snapshot.observedAt,
        observeSeq: observeCount,
        a11yBytes: latestA11y.length,
      },
      { stepId, evidenceRefs: latest.evidenceRefs },
    )
    await checks()
    if (!cleanEvidenceIntegrity(latest.snapshot.evidenceIntegrity)) return latest
    const overlay = latest.snapshot.elements.some((e) =>
      e.hitSamples?.some((s) => s.relation === 'unrelated'),
    )
    const pageText = latest.snapshot.text.replace(/\s+/g, ' ')
    // The newest fact per operation, correlated against the page the adapter owns. Another
    // operation's success, a lone success label or a response with no visible notice cannot
    // confirm this operation.
    const operations = [...new Set(businessFacts.map((f) => f.operationId))]
    for (const operationId of operations) {
      const fact = latestFactForOperation(businessFacts, operationId)
      if (!fact) continue
      const trigger = businessRuntime.compatibilityTriggers(fact)
      taskState.observeNormalizedFacts(
        {
          phase: fact.phase,
          retryEligibility: fact.retryEligibility,
          paymentOutcome: trigger.paymentOutcome,
        },
        overlay,
      )
      const concluded = concludeBusinessResult([fact])
      if (concluded === 'unknown') verifiedByOperation.delete(operationId)
      if (fact.phase === 'processing') continue
      const correlation = businessRuntime.correlateVisible(fact, {
        pageText,
        visibleText: latest.snapshot.elements.filter((e) => e.visible).map((e) => e.text),
      })
      if (correlation.kind === 'confirmed') {
        if (concluded !== 'unknown')
          verifiedByOperation.set(operationId, {
            result: concluded,
            evidenceRefs: [...latest.evidenceRefs],
          })
      } else if (correlation.kind === 'contradicted') {
        // A contradicting newer fact invalidates a previously verified result.
        verifiedByOperation.delete(operationId)
      }
    }
    // A newly observed operation invalidates the earlier conclusion for it.
    for (const operationId of [...verifiedByOperation.keys()])
      if (!operations.includes(operationId)) verifiedByOperation.delete(operationId)
    const concludedResults = [...verifiedByOperation.values()].map((v) => v.result)
    const retained = concludedResults.includes('success')
      ? 'success'
      : concludedResults.length && concludedResults.every((r) => r === 'rejected')
        ? 'rejected'
        : 'unknown'
    if (retained !== businessResult) {
      businessResult = retained
      await updateRunStatus(runId, 'running', { businessResult })
      await appendEvent(
        runId,
        'business:verified',
        {
          businessResult,
          contractHash: businessContract.hash,
          verifiedOperations: [...verifiedByOperation.entries()].map(([operationId, v]) => ({
            operationId,
            businessResult: v.result,
          })),
        },
        { stepId, evidenceRefs: latest.evidenceRefs },
      )
    }
    return latest
  }
  try {
    await updateRunStatus(runId, 'running')
    await appendEvent(runId, 'run:started', {
      goal: run.spec.goal,
      versions: executionVersions(),
      models: {
        agent: config.agentModel,
        vision: config.visionModel,
        completionReview: config.features?.blockerReview
          ? config.completionReview.model
          : undefined,
      },
      budget,
      requestPolicy: {
        timeoutMs: config.budget.modelRequestTimeoutMs,
        maxRetries: config.budget.modelRequestMaxRetries,
        finalizingMaxCalls: 2,
      },
      tokenUsage: 'unavailable-until-reported',
    })
    worker = await launchBrowser({ viewport: run.spec.viewport })
    guard()
    const page = worker.page
    let mutationFailed = false
    let deniedWrites = 0
    let businessCreated = false
    let networkWrites = 0
    const sideEffectPolicy = createSideEffectPolicy({
      contract: businessContract,
      adapter: businessRuntime.adapter,
      publicOrigin: runOrigin,
      currentFact: (id) => latestFactForOperation(businessFacts, id),
      ownsOperation: (id) => ownedOperations.has(id),
    })
    // Side-effect budget, reserved before dispatch. A create or retry counts when the request
    // leaves, not when its response arrives, so two immediate requests cannot both pass.
    const detachedResponses = new Set<import('playwright').Request>()
    const policyDenied = new Set<import('playwright').Request>()
    const pendingWrites = new Set<import('playwright').Request>()
    page.on('request', (request) => {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
        pendingWrites.add(request)
        networkWrites++
      }
    })
    page.on('requestfailed', (request) => {
      if (policyDenied.delete(request)) {
        pendingWrites.delete(request)
        return
      }
      if (pendingWrites.has(request)) {
        sideEffectPending = true
        mutationFailed = true
      }
      pendingWrites.delete(request)
    })
    // Ordered fact commits: observations, finish and exit all drain this queue before reading
    // facts, so an async response cannot land after the run has already concluded.
    let factTail: Promise<unknown> = Promise.resolve()
    const responseTasks = new Set<Promise<void>>()
    let responseError: unknown
    let responsesClosed = false
    drainResponses = async () => {
      const deadline = Date.now() + config.budget.toolTimeoutMs
      while (responseTasks.size) {
        guard()
        if (Date.now() >= deadline) throw Error('business-response-timeout')
        await new Promise((r) => setTimeout(r, 10))
      }
      if (responseError) throw responseError
      guard()
    }
    closeResponses = async () => {
      responsesClosed = true
      await factTail
    }
    /**
     * Operation ids this action's own dispatched writes addressed.
     *
     * A page that polls an asynchronous job in the background emits business responses while an
     * unrelated action is in flight, so "a new fact appeared" does not mean "this action produced
     * it". Only a fact whose operation this action actually dispatched to counts as its response.
     */
    let dispatchedOperations: Set<string> | null = null
    /** Operation ids of every write this run dispatched, so a response can be traced to one. */
    const writeOperations = new WeakMap<import('playwright').Request, string>()
    /** Writes that created an entity: their operation id exists only once the response arrives. */
    const writeCreates = new WeakSet<import('playwright').Request>()
    const commitFact = async (exchange: {
      url: string
      method: string
      origin: string
      statusCode: number
      body: unknown
      bodyText: string | null
      bodyReadFailed: boolean
      /** The operation identity of the write that produced this response, when it named one. */
      dispatchedOperation?: string
      /** True when this response is the answer to a create this run dispatched. */
      dispatchedCreate?: boolean
    }) => {
      if (responsesClosed || signal.aborted || finished) return
      const request = {
        url: exchange.url,
        method: exchange.method,
        origin: exchange.origin,
        statusCode: exchange.statusCode,
        body: exchange.body,
      }
      const publicExchange = {
        request,
        allowedOrigin: runOrigin,
        bodyText: exchange.bodyText,
        bodyReadFailed: exchange.bodyReadFailed,
      }
      const compatibility = businessRuntime.compatibilityEvent?.(publicExchange)
      const fact = businessRuntime.decodeResponse(publicExchange)
      if (!fact) {
        // A non-business response is not a fact and not a success. Only a recognized business
        // response is recorded as an observation: an unrelated document or poll is not the
        // evidence of anything, and recording it would let a rule bind to the wrong response.
        if (!compatibility) {
          // A resource this business publishes alongside its entity is retained as the run's own
          // citable evidence before it is judged as a fact. Export recovery is why this exists: the
          // eligibility resource is the only public source separating a broken control from a
          // deliberately unavailable recovery, and it carries no `phase` of its own, so it is not a
          // fact about the entity. The artifact is the published body *verbatim* - the source an
          // agent consulted, not a summary the executor composed - with the classification kept in
          // its metadata, so a finding can cite the business's own document.
          const resource = businessRuntime.retainResource?.(publicExchange)
          if (!resource || (resource.operationId && !ownedOperations.has(resource.operationId)))
            return
          const resourceRef = await saveEvidence(runId, 'resource', exchange.bodyText!, {
            ...evidenceMetadata(),
            resourceKind: resource.kind,
            operationId: resource.operationId,
            url: exchange.url,
          })
          // Newest-wins per (kind, operation): a re-read of the same resource supersedes the older
          // copy rather than accumulating, so the agent is offered the current document and the
          // finding cites the version that was actually in force. Distinct kinds and distinct
          // entities each keep their own entry.
          const existing = retainedResources.findIndex(
            (r) => r.kind === resource.kind && r.operationId === resource.operationId,
          )
          const entry = {
            kind: resource.kind,
            operationId: resource.operationId,
            url: exchange.url,
            evidenceRefs: [resourceRef],
            value: resource.value,
          }
          if (existing >= 0) retainedResources[existing] = entry
          else retainedResources.push(entry)
          await appendEvent(runId, 'business:observation', {
            url: exchange.url,
            method: exchange.method,
            statusCode: exchange.statusCode,
            body: exchange.body,
            bodyReadFailed: exchange.bodyReadFailed,
            contractHash: businessContract.hash,
          })
          await appendEvent(
            runId,
            'business:resource',
            {
              kind: resource.kind,
              operationId: resource.operationId,
              contractHash: businessContract.hash,
            },
            { evidenceRefs: [resourceRef] },
          )
          return
        }
        const observation = await appendEvent(runId, 'business:observation', {
          url: exchange.url,
          method: exchange.method,
          statusCode: exchange.statusCode,
          body: exchange.body,
          bodyReadFailed: exchange.bodyReadFailed,
          contractHash: businessContract.hash,
        })
        await appendEvent(runId, compatibility.type, {
          ...compatibility.payload,
          statusCode: exchange.statusCode,
          observationRef: observation.id,
        })
        return
      }
      if (exchange.dispatchedCreate) ownedOperations.add(fact.operationId)
      if (!ownedOperations.has(fact.operationId)) return
      if (exchange.dispatchedOperation && exchange.dispatchedOperation !== fact.operationId) return
      // The public observation is recorded first and is business-neutral: url, method, status and
      // the raw body, with no interpretation. Every business gets the same record, so a fact - or a
      // rule bound to one - always cites the response it actually came from.
      const observation = await appendEvent(runId, 'business:observation', {
        url: exchange.url,
        method: exchange.method,
        statusCode: exchange.statusCode,
        body: exchange.body,
        bodyReadFailed: exchange.bodyReadFailed,
        contractHash: businessContract.hash,
      })
      const withSource = {
        ...fact,
        contractHash: businessContract.hash,
        sourceEventId: observation.id,
      }
      const event = await appendEvent(runId, 'business:fact', withSource)
      businessFacts = normalizeFactEvents([
        ...businessFacts.map((f) => ({ type: 'business:fact', payload: f }) as never),
        { type: 'business:fact', payload: withSource } as never,
      ])
      if (compatibility)
        await appendEvent(runId, compatibility.type, {
          ...compatibility.payload,
          statusCode: exchange.statusCode,
          observationRef: observation.id,
          factEventId: event.id,
        })
      // Credit the operation to the action that dispatched the write it belongs to. A create names
      // no entity until its response arrives, and a background poll has no dispatched write behind
      // it at all - so neither can pass itself off as another action's response.
      if (exchange.dispatchedOperation || exchange.dispatchedCreate)
        dispatchedOperations?.add(fact.operationId)
      if (fact.phase !== 'processing') businessCreated = true
      return true
    }
    page.on('response', (response) => {
      if (responsesClosed || signal.aborted || finished) return
      const request = response.request()
      // Business responses are observed whether or not they belong to a tracked write, so an
      // asynchronous status GET is captured; the serialized commit queue keeps ordering.
      if (detachedResponses.has(request)) detachedResponses.delete(request)
      const tracked = pendingWrites.has(request)
      if (tracked && response.status() >= 500) mutationFailed = true
      const readBody = async () => {
        const url = request.url()
        const method = request.method()
        let origin = ''
        try {
          origin = new URL(url).origin
        } catch {
          return
        }
        let body: unknown = null
        let bodyText: string | null = null
        let bodyReadFailed = false
        try {
          const text = await response.text()
          bodyText = text
          body = text ? JSON.parse(text) : null
        } catch {
          bodyReadFailed = true
        }
        // The operation a write was aimed at, read from the request itself. A retry names its
        // entity in the path; a create has none until its response arrives, in which case the
        // create response is its own provenance.
        const dispatchedOperation = writeOperations.get(request)
        const dispatchedCreate = writeCreates.has(request)
        const commit = commitFact({
          url,
          method,
          origin,
          statusCode: response.status(),
          body,
          bodyText,
          bodyReadFailed,
          dispatchedOperation,
          dispatchedCreate,
        })
        try {
          const acknowledged = await commit
          // A transport success does not establish the result of a business write. An unreadable
          // receipt or one without a recognized operation can hide a committed create/retry.
          if (tracked && (dispatchedCreate || dispatchedOperation) && !acknowledged)
            mutationFailed = true
        } finally {
          if (tracked) pendingWrites.delete(request)
        }
      }
      const task = factTail
        .then(readBody)
        .catch((error) => {
          if (!signal.aborted && !responsesClosed) responseError = error
          if (tracked) {
            mutationFailed = true
            pendingWrites.delete(request)
          }
        })
        .finally(() => responseTasks.delete(task))
      responseTasks.add(task)
      factTail = task
    })
    page.setDefaultTimeout(config.budget.toolTimeoutMs)
    page.setDefaultNavigationTimeout(config.budget.toolTimeoutMs)
    signal.addEventListener(
      'abort',
      () => {
        void worker?.close().catch(() => {})
      },
      { once: true },
    )
    await worker.context.route('**/*', async (route) => {
      const request = route.request()
      const url = request.url()
      let origin = ''
      try {
        origin = new URL(url).origin
      } catch {
        origin = ''
      }
      // Every write is judged by the run's side-effect policy: what the adapter says the request
      // is, against the contract's budget. Button wording and action intent never grant a write.
      const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      if (isWrite) {
        if (signal.aborted || finished || responsesClosed || mutationFailed) {
          policyDenied.add(request)
          pendingWrites.delete(request)
          await route.abort('blockedbyclient')
          return
        }
        const decision = sideEffectPolicy.authorize({
          url,
          method: request.method(),
          origin,
        })
        if (decision.kind === 'deny') {
          policyDenied.add(request)
          pendingWrites.delete(request)
          deniedWrites++
          await recordIntervention({
            kind: 'write-denied',
            url,
            method: request.method(),
          })
          await appendEvent(runId, 'write:denied', {
            reason: decision.reason,
            method: request.method(),
            url,
            intent: decision.intent.kind,
          })
          await route.abort('blockedbyclient')
          return
        }
        // Record which operation this write addresses, taken from the adapter's own intent rather
        // than from the URL shape: the response handler uses it to decide whether the fact it
        // produces belongs to the action that dispatched this request.
        //
        // Only a write this executor caused counts. `sideEffectPending` is true exactly between
        // dispatching a click and that click's writes settling, so it separates "the action did
        // this" from "the page did this on its own while the action was in flight" - a page-side
        // background sync is a real business request, but it is not this action's response.
        {
          if (decision.intent.kind === 'retry') {
            writeOperations.set(request, decision.intent.operationPath)
            dispatchedOperations?.add(decision.intent.operationPath)
          } else if (decision.intent.kind === 'create') {
            // A create names no entity until its own response arrives, so the commit credits it.
            writeCreates.add(request)
          }
        }
      }
      if (
        isAllowedPageUrl(url, run.spec.entryUrl) &&
        (!request.isNavigationRequest() ||
          isAllowedNavigationUrl(url, run.spec.entryUrl) ||
          isAllowedBusinessDownload(
            { url, method: request.method(), origin: new URL(url).origin },
            businessRuntime,
            (id) => ownedOperations.has(id),
            (id) => latestFactForOperation(businessFacts, id),
          ))
      )
        await route.continue()
      else {
        policyDenied.add(request)
        pendingWrites.delete(request)
        await recordIntervention({
          kind: 'access-denied',
          url,
          method: request.method(),
        })
        await appendEvent(runId, 'access:denied', { reason: 'outside-environment' })
        await route.abort()
      }
    })
    worker.context.on('page', (p) => {
      if (p !== page)
        void recordIntervention({ kind: 'popup-denied', url: p.url() })
          .then(() => p.close())
          .catch(() => {})
    })
    await page.goto(run.spec.entryUrl, { waitUntil: 'domcontentloaded' })
    await observe()
    let activeVisionId: string | undefined
    let activeVisionHandle: ReturnType<RequestTracker['startRequest']> | null = null
    const vision = createVisionLocator(page, {
      signal,
      beforeModelCall: (deadlineAt) => {
        countModel()
        activeVisionId = randomUUID()
        activeVisionHandle = requestTracker.startRequest('vision', config.visionModel)
        void appendEvent(runId, 'model:request-started', {
          attemptId: activeVisionId,
          purpose: 'vision',
          model: config.visionModel,
          startedAt: Date.now(),
          deadlineAt,
        })
      },
      onUsage: (raw) => {
        if (!activeVisionHandle || signal.aborted) return
        const u = raw as { prompt_tokens?: number; completion_tokens?: number }
        if (u.prompt_tokens === undefined || u.completion_tokens === undefined)
          modelUsageAvailable = false
        else reportedModelCalls++
        usage.modelInputTokens += u.prompt_tokens ?? 0
        usage.modelOutputTokens += u.completion_tokens ?? 0
        const record = activeVisionHandle?.finish({
          inputTokens: u.prompt_tokens,
          outputTokens: u.completion_tokens,
        })
        activeVisionHandle = null
        void appendEvent(runId, 'model:request-finished', {
          attemptId: activeVisionId,
          source: 'vision',
          seq: record?.seq,
          model: config.visionModel,
          durationMs: record?.durationMs,
          inputTokens: u.prompt_tokens ?? null,
          outputTokens: u.completion_tokens ?? null,
        })
      },
    })
    async function measureTransition(
      input: {
        eventType: string
        fromState?: string
        toState?: string
        target: string
        selector: string
        elementRef?: string
        condition: 'element-visible' | 'element-actionable'
        durationMs: number
      },
      binding?: TransitionObservation['binding'],
      sample?: () => Promise<boolean | null>,
    ) {
      if (
        !integrity.epoch() &&
        input.durationMs > budget.totalTimeoutMs - Date.now() + startedAt - 250
      )
        throw new Error('Insufficient time to complete measurement')
      const window = integrity.epoch()
        ? { startedAtMs: Date.now(), samples: [] as { atMs: number; value: boolean | null }[] }
        : await sampleWindow({
            durationMs: input.durationMs,
            guard,
            sample: () =>
              sample ? sample() : sampleElementCondition(page, input.selector, input.condition),
          })
      const startedAtMs = window.startedAtMs
      const samples = window.samples.map((s) => ({ ...s, target: input.target }))
      const obs = await observe()
      const measurement = {
        elementRef: input.elementRef,
        evidenceIntegrity: integrity.snapshot(),
        evidenceStatus:
          integrity.epoch() || samples.some((s) => s.value === null) ? 'unknown' : 'complete',
        summary: integrity.epoch()
          ? interventionLimitation
          : samples.some((s) => s.value === null)
            ? 'Unknown samples mean the target was missing, ambiguous or replaced. They are not false and cannot support or refute a claim; rebind a current elementRef or report inconclusive.'
            : 'Read-only samples are complete for this target and window; interpret them against the hypothesis.',
        condition: input.condition,
        selector: input.selector,
        eventType: input.eventType,
        fromState: input.fromState,
        toState: input.toState,
        binding,
        startedAtMs,
        observedUntilMs: Date.now(),
        samples,
        evidenceRefs: [...obs.evidenceRefs],
      }
      const ref = await saveEvidence(
        runId,
        'measurement',
        JSON.stringify(measurement),
        evidenceMetadata(),
      )
      measurement.evidenceRefs.push(ref)
      transitions.push(measurement)
      await appendEvent(runId, 'transition:observed', measurement, {
        stepId,
        evidenceRefs: measurement.evidenceRefs,
      })
      await checks()
      measurementFacts.add(
        JSON.stringify([
          input.eventType,
          input.target,
          input.condition,
          input.durationMs,
          binding?.operationId,
          binding?.elementRef,
          [...new Set(samples.map((s) => s.value))],
        ]),
      )
      return measurement
    }
    if (config.features?.atomicInvestigation)
      temporalInvestigator = createTemporalInvestigator({
        guard,
        epoch: () =>
          JSON.stringify([usage.actions, businessFacts.length, page.url(), integrity.epoch()]),
        version: async () => {
          const version = await readObservationVersion(page)
          return version.reusable ? version.key : undefined
        },
        bind: async (ref) => {
          const detail = elementStore.getDetail(ref)
          if (!detail.found || !detail.fresh || page.url() !== latest!.snapshot.url)
            throw Error('stale-or-unknown-element-ref; observe and rebind')
          const locator = page.locator(detail.element.selector)
          if ((await locator.count()) !== 1) throw Error('ambiguous-element; observe and rebind')
          const handle = await locator.elementHandle()
          if (!handle) throw Error('missing-element; observe and rebind')
          try {
            const identity = await handle.evaluate((el) => ({
              connected: el.isConnected,
              tag: el.tagName.toLowerCase(),
              text: (el.textContent ?? '').trim().slice(0, 700),
            }))
            if (
              !identity.connected ||
              identity.tag !== detail.element.tag ||
              identity.text !== detail.element.text
            )
              throw Error('element-changed; observe and rebind')
            const version = await readObservationVersion(page)
            return {
              handle,
              selector: detail.element.selector,
              version: version.reusable ? version.key : undefined,
            }
          } catch (error) {
            await handle.dispose()
            throw error
          }
        },
        record: async (input) => {
          if (
            input.trigger === 'retryable-failure' &&
            !retryTrigger(await getEvents(runId), latest!.snapshot.text)
          )
            throw Error('investigation-trigger-not-observed')
          if (
            input.trigger !== 'always' &&
            !taskState
              .snapshot()
              .conditions.some(
                (c) => c.trigger === input.trigger && c.applicability === 'triggered',
              )
          )
            throw Error(
              'investigation-trigger-not-observed; requirements are not evidence of applicability',
            )
          const h = await recordHypothesis({
            runId,
            phenomenon: `${input.target} does not become ${input.condition} during the ${input.durationMs}ms measurement window.`,
            basis: input.basis,
            verificationPlan: JSON.stringify({
              contract: 'bounded-agent-assertion-1',
              originalAgentQuestion: input.phenomenon,
              condition: input.condition,
              durationMs: input.durationMs,
              target: input.target,
              windowOrigin: 'measurement-start',
              applicabilityAuthor: 'agent',
              freshWindowReason: input.freshWindowReason,
            }),
            status: 'open',
            evidenceRefs: [...new Set([...latest!.evidenceRefs, ...(input.evidenceRefs ?? [])])],
          })
          knownHypothesisIds.add(h.id)
          taskState.recordHypothesis(h.id, h.phenomenon, input.trigger)
          const transition = phaseTracker.enterVerifying('bounded investigation declared')
          if (transition.changed)
            await appendEvent(runId, 'run:phase-changed', {
              from: transition.previous,
              to: transition.current,
              reason: transition.reason,
            })
          await appendEvent(
            runId,
            'investigation:declared',
            { hypothesisId: h.id, ...input },
            { stepId, evidenceRefs: latest!.evidenceRefs },
          )
          return h.id
        },
        measure: (input, bound) =>
          measureTransition(
            {
              eventType: input.trigger,
              target: input.target,
              selector: bound.selector,
              elementRef: input.elementRef,
              condition: input.condition,
              durationMs: input.durationMs,
            },
            undefined,
            () => sampleBoundElementCondition(bound.handle, input.condition),
          ),
        complete: async (input, result, actual) => {
          let findingId: string | undefined
          if (result.verdict === 'fail') {
            const finding = await submitFinding({
              runId,
              source: 'agent',
              ruleId: null,
              ruleRevision: null,
              hypothesisId: result.hypothesisId,
              validationStatus: 'supported',
              severity: input.severity,
              title: `${input.target}: ${input.condition} unavailable during measured window`,
              expected: `Agent-declared expectation: ${input.target} becomes ${input.condition} within the ${input.durationMs}ms measurement window. Basis: ${input.basis}`,
              actual,
              stepId,
              evidenceRefs: [...result.evidenceRefs],
            })
            findingId = finding.id
            findingFacts.add(JSON.stringify([finding.hypothesisId, finding.actual]))
            await appendEvent(
              runId,
              'finding:submitted',
              {
                findingId,
                hypothesisId: result.hypothesisId,
                contract: 'bounded-agent-assertion-1',
              },
              { stepId, evidenceRefs: [...result.evidenceRefs] },
            )
          }
          await updateHypothesis(result.hypothesisId, result.validationStatus, [
            ...result.evidenceRefs,
          ])
          taskState.resolveHypothesis(result.hypothesisId, result.validationStatus)
          const saved = { ...result, findingId }
          completedInvestigations.push(saved)
          await appendEvent(runId, 'investigation:completed', saved, {
            stepId,
            evidenceRefs: [...result.evidenceRefs],
          })
          return findingId
        },
        reused: async (result) => {
          await appendEvent(
            runId,
            'investigation:reused',
            { ...result },
            {
              stepId,
              evidenceRefs: [...result.evidenceRefs],
            },
          )
        },
      })
    const currentRuleContext = async (): Promise<RuleContext> => {
      const events = await getEvents(runId)
      return {
        runId,
        currentUrl: latest!.snapshot.url,
        pageTitle: latest!.snapshot.title,
        timestamp: latest!.snapshot.observedAt,
        events,
        feedbackWarningMs: businessContract.feedbackWarningMs,
        observedTriggers: (function () {
          const t = retryTrigger(events, latest!.snapshot.text)
          return t ? [t.eventType] : []
        })(),
        snapshot: { ...latest!.snapshot, transitionObservations: transitions } as PageSnapshot,
      }
    }
    const pendingKnownRules = async () => {
      if (!config.features?.ruleRouting) return 0
      const trigger = retryTrigger(await getEvents(runId), latest!.snapshot.text)
      if (!trigger) return 0
      return getEnabledRules().filter(
        (r) =>
          r.declaration?.trigger.eventType === trigger.eventType &&
          !ruleCheckResults.some(
            (c) =>
              c.ruleId === r.id && c.operationId === trigger.operationId && c.verdict !== 'unknown',
          ),
      ).length
    }
    // A completed learned retry check is as real as an automatic failure. Preserve its exact
    // trigger and element identity; an old failed attempt or a now-operable control cannot
    // authorize the narrow reviewer. Other controls remain visible to its semantic judgment.
    const measuredRetryBlocker = async () => {
      const trigger = retryTrigger(await getEvents(runId), latest?.snapshot.text ?? '')
      if (!trigger) return undefined
      for (const cached of boundCache) {
        const result = cached.result
        const rule = getEnabledRules().find((r) => r.id === result.ruleId)
        if (
          cached.triggerRef !== trigger.eventRef ||
          result.operationId !== trigger.operationId ||
          result.verdict !== 'fail' ||
          !result.findingId ||
          cached.lastValue !== false ||
          rule?.declaration?.trigger.eventType !== 'retryable-failure' ||
          rule.declaration.expectation.condition !== 'element-actionable'
        )
          continue
        try {
          const previous = JSON.parse(cached.fingerprint) as { tag: string; text: string }
          const identity = await cached.handle.evaluate((el) => ({
            connected: el.isConnected,
            tag: el.tagName.toLowerCase(),
            text: (el.textContent ?? '').trim().slice(0, 700),
          }))
          if (
            identity.connected &&
            identity.tag === previous.tag &&
            identity.text === previous.text &&
            (await sampleBoundElementCondition(cached.handle, 'element-actionable')) === false
          )
            return { ...result, triggerRef: cached.triggerRef }
        } catch {
          // Detached or otherwise unmeasurable controls require full Agent exploration.
        }
      }
      return undefined
    }
    const inspectionSummary = () => ({
      snapshotId: latestSlim?.snapshotId,
      observationReused,
      evidenceIntegrity: integrity.snapshot(),
      automaticChecks: latestChecks?.results.map(({ ruleId, verdict, actual, evidenceRefs }) => ({
        ruleId,
        verdict,
        actual,
        evidenceRefs,
      })),
      completedRuleChecks: ruleCheckResults.slice(-12),
      applicableGaps: completionGaps(),
      finishAdvice: {
        businessResult,
        blocked: businessResult === 'unknown' || completionGaps().length > 0,
        note: 'Automatic checks are already saved. Once scope is covered, call run_finish; do not repeat observe/checks just to confirm these results. Novel issues still require investigation.',
      },
    })
    async function performAction(input: z.infer<typeof actionInput>) {
      guard()
      if (phaseTracker.phase === 'finalizing')
        return {
          error: 'page_act blocked: system is in finalizing phase. Call run_finish instead.',
          action: input,
        }
      if (sideEffectPending) throw new Error('reconciliation-required')
      if (usage.actions >= budget.maxActions) throw new Error('budget-exhausted')
      stepId = `action-${usage.actions + 1}`
      await observe(true)
      let resolvedLocator: import('playwright').Locator | undefined
      let targetDesc = ''
      if (input.role && input.name) {
        resolvedLocator = page.getByRole(input.role as Parameters<typeof page.getByRole>[0], {
          name: input.name,
          exact: true,
        })
        if (input.nth !== undefined) resolvedLocator = resolvedLocator.nth(input.nth)
        else {
          const count = await resolvedLocator.count()
          if (count !== 1)
            return {
              error: `Expected one exact role/name match, found ${count}; specify nth only after identifying the intended target.`,
              action: input,
            }
        }
        targetDesc = `${input.role}[${input.name}]${input.nth !== undefined ? `[${input.nth}]` : ''}`
      } else if (input.selector) {
        resolvedLocator = page.locator(input.selector)
        targetDesc = input.selector
      } else if (input.visualDescription) {
        const location = await vision.aiLocate(input.visualDescription).catch(async (error) => {
          const record = activeVisionHandle?.finish({ error: String(error) })
          activeVisionHandle = null
          modelUsageAvailable = false
          if (record)
            await appendEvent(runId, 'model:request-finished', {
              ...record,
              attemptId: activeVisionId,
              source: 'vision',
            })
          throw error
        })
        guard()
        const selector = await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y)
            if (!el) return ''
            const parts: string[] = []
            for (
              let n: Element | null = el;
              n && n !== document.documentElement;
              n = n.parentElement
            ) {
              const s = Array.from(n.parentElement?.children ?? []).filter(
                (e) => e.tagName === n!.tagName,
              )
              parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${s.indexOf(n) + 1})`)
            }
            return 'html > ' + parts.join(' > ')
          },
          { x: location.center[0], y: location.center[1] },
        )
        if (selector) resolvedLocator = page.locator(selector)
        targetDesc = `vision:${input.visualDescription}`
      }
      guard()
      const actionId = randomUUID()
      let dispatchTime = Date.now()
      const beforeText = await page.locator('body').innerText()
      mutationFailed = false
      const deniedBefore = deniedWrites
      const writesBefore = networkWrites
      // This action's own dispatched operations, collected while it is in flight.
      const actionOperations = new Set<string>()
      dispatchedOperations = actionOperations
      await page.evaluate(`
          if(window.__sentinelTiming&&window.__sentinelTiming.observer)window.__sentinelTiming.observer.disconnect();
          var timing={dispatchAt:Date.now(),samples:[],observer:null};
          document.addEventListener('pointerdown',function(){timing.dispatchAt=Date.now()},{once:true,capture:true});
          timing.observer=new MutationObserver(function(){var b=Date.now(),t=document.body.innerText;timing.samples.push({text:t,at:b,uncertaintyMs:Math.max(1,Date.now()-b)});if(timing.samples.length>100)timing.samples.shift()});
          timing.observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true});
          window.__sentinelTiming=timing;
        `)
      usage.actions++
      await appendEvent(
        runId,
        'action:executing',
        { type: input.type, target: targetDesc, dispatchTime },
        { stepId, actionId, evidenceRefs: latest!.evidenceRefs },
      )
      try {
        guard()
        if (input.type === 'click' || input.type === 'probe') {
          if (!resolvedLocator)
            throw new Error('target required: provide role+name, selector, or visualDescription')
          await resolvedLocator.click({
            trial: true,
            timeout: Math.min(3000, config.budget.toolTimeoutMs / 3),
          })
          guard()
          if (input.type === 'click') {
            sideEffectPending = true
            dispatchTime = Date.now()
            await resolvedLocator.click()
          }
        } else if (input.type === 'fill') {
          if (!resolvedLocator) throw new Error('target required')
          await resolvedLocator.fill(input.value ?? '')
        } else if (input.type === 'navigate') {
          if (!input.url || !isAllowedNavigationUrl(input.url, run!.spec.entryUrl))
            throw new Error('navigation denied')
          await page.goto(input.url, { waitUntil: 'domcontentloaded' })
        } else await page.mouse.wheel(0, input.scrollY ?? 500)
        const responseDeadline = Date.now() + config.budget.toolTimeoutMs
        while (pendingWrites.size) {
          guard()
          if (Date.now() > responseDeadline) throw new Error('reconciliation-required')
          await new Promise((r) => setTimeout(r, 50))
        }
        await drainResponses()
        guard()
        if (mutationFailed) throw new Error('reconciliation-required')
        sideEffectPending = false
        if (deniedWrites > deniedBefore)
          throw new Error(
            'write-denied: active read-only boundary; return control without replaying this action',
          )
        // Only a fact for an operation this action dispatched. A background status poll for another
        // job can land mid-action; treating it as this action's response would attribute an
        // unrelated outcome to it and make the executor wait for feedback the page never shows.
        const response = [...actionOperations]
          .map((operationId) => latestFactForOperation(businessFacts, operationId))
          .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact))
          .sort((a, b) => b.version - a.version || b.attempt - a.attempt)[0]
        dispatchedOperations = null
        let finalFeedbackVisible = true
        if (response) {
          // The same visible correlation the adapter will apply when verifying the outcome: the
          // operation's identity and its stated notice, read from normalized facts rather than
          // any business-specific field.
          await page
            .waitForFunction(
              ({ operationId, notice }) => {
                const text = document.body.innerText.replace(/\s+/g, ' ')
                return (
                  text.includes(operationId) &&
                  (!notice || text.includes(notice.replace(/\s+/g, ' ')))
                )
              },
              { operationId: response.operationId, notice: response.notice },
              {
                timeout: Math.max(
                  1,
                  config.budget.toolTimeoutMs - (Date.now() - dispatchTime) - 250,
                ),
              },
            )
            .catch(() => {
              finalFeedbackVisible = false
            })
        }
        const timing = finalFeedbackVisible
          ? await page.evaluate((previousText) => {
              const state = (
                window as {
                  __sentinelTiming?: {
                    observer: MutationObserver
                    dispatchAt: number
                    samples: { text: string; at: number; uncertaintyMs: number }[]
                  }
                }
              ).__sentinelTiming
              if (!state) return null
              state.observer.disconnect()
              const current = document.body.innerText
              const match = state.samples.find(
                (s) => s.text === current && s.at >= state.dispatchAt,
              )
              if (current === previousText || !match) return null
              return {
                durationMs: match.at - state.dispatchAt,
                uncertaintyMs: match.uncertaintyMs,
                dispatchAt: state.dispatchAt,
                feedbackAt: match.at,
                method: 'browser-mutation-feedback',
              }
            }, beforeText)
          : null
        if (timing) {
          const feedback = await observePage(page, runId, evidenceMetadata)
          await appendEvent(
            runId,
            'response:observed',
            { actionId, ...timing, evidenceRefs: feedback.evidenceRefs },
            { stepId, actionId, evidenceRefs: feedback.evidenceRefs },
          )
        } else
          await appendEvent(
            runId,
            'response:unresolved',
            { actionId, reason: 'No observable feedback boundary; timing unavailable' },
            { stepId, actionId },
          )
        await appendEvent(
          runId,
          'action:completed',
          { type: input.type, target: targetDesc, networkWrites: networkWrites - writesBefore },
          { stepId, actionId },
        )
      } catch (error) {
        await appendEvent(
          runId,
          'action:failed',
          { error: String(error), sideEffectPending },
          { stepId, actionId },
        )
        if (sideEffectPending) {
          active.abortController.abort(new Error('reconciliation-required'))
          throw new Error('reconciliation-required')
        }
        guard()
        staleDetector.recordAction()
        await observe()
        return {
          error: String(error),
          evidenceIntegrity: integrity.snapshot(),
          ...(integrity.epoch() ? { limitation: interventionLimitation } : {}),
          action: input,
          status: 'failed',
          elements: referenceIndex(),
          url: latest!.snapshot.url,
          a11yTree: latestA11y!,
          pageText: latest!.snapshot.text.replace(/\s+/g, ' ').slice(0, 500),
          evidenceRefs: latest!.evidenceRefs,
        }
      }
      staleDetector.recordAction()
      await persistUsage()
      await observe()
      return {
        action: input,
        status: 'completed',
        inspection: inspectionSummary(),
        elements: referenceIndex(),
        url: latest!.snapshot.url,
        a11yTree: latestA11y!,
        pageText: latest!.snapshot.text.replace(/\s+/g, ' ').slice(0, 500),
        evidenceRefs: latest!.evidenceRefs,
      }
    }
    // Reuse is scoped to this run's own contract identity, so a segment evidenced under a
    // different profile, revision, adapter or origin is never replayed here.
    const journeys = config.features?.journeys
      ? await loadJourneys(run.spec.environmentId, runId, {
          profileId: businessContract.profileId,
          contractHash: businessContract.hash,
          adapterId: businessContract.adapter.id,
          adapterRevision: businessContract.adapter.revision,
          // The identity origin is the contract's persisted origin, on both sides of the comparison:
          // a source run's stored contract and this run's own contract must agree. A run with no
          // persisted contract is legacy and never contributes, so this is not a way to reuse
          // evidence across businesses.
          origin: businessContract.environment.publicOrigin,
        })
      : []
    const availableJourneys = () =>
      journeys.filter(
        (j) =>
          conditionMatches(j.steps[0]!.before, latest!.snapshot as PageSnapshot) &&
          latest!.snapshot.elements.filter(
            (e) =>
              e.visible &&
              e.enabled &&
              (e.attributes.role ?? (e.tag === 'a' ? 'link' : e.tag)) === j.steps[0]!.action.role &&
              (e.attributes['aria-label'] ?? e.text).replace(/\s+/g, ' ').trim() ===
                j.steps[0]!.action.name,
          ).length === 1,
      )
    const finishInspection = (
      request: z.infer<typeof shortFinishInput> | z.infer<typeof legacyFinishInput>,
      review?: { version: ObservationVersion; attemptId: string },
    ) =>
      serial(
        'run_finish',
        async () => {
          // Explicitly validate even for callers outside the SDK tool dispatcher.
          const parsed = config.features?.shortFinish
            ? shortFinishInput.parse(request)
            : legacyFinishInput.parse(request)
          await appendEvent(runId, 'finish:requested', parsed)
          await observe()
          const pendingRules = await pendingKnownRules()
          const gaps = [
            ...completionGaps(),
            ...(pendingRules
              ? [`known-rules:${pendingRules} applicable checks pending; use rules_search`]
              : []),
          ]
          if (review) {
            const currentVersion = await readObservationVersion(page)
            const current = await getFindings(runId)
            const eligible = blockerEvidenceEligible({
              businessResult,
              integrity: integrity.snapshot().status,
              gaps,
              pendingRules,
              pendingAnalyses: 0,
              supportedFinding: current.some((f) => f.validationStatus === 'supported'),
              currentFailure: latestChecks?.results.some((r) => r.verdict === 'fail') ?? false,
              recoveryOpportunity: await hasRecoveryOpportunity(page),
              measuredRetryBlocker: !!(await measuredRetryBlocker()),
              phase: phaseTracker.phase,
            })
            if (!eligible || !sameObservationVersion(review.version, currentVersion)) {
              const reply = { accepted: false, error: 'completion-review-state-changed' }
              await appendEvent(runId, 'finish:rejected', reply)
              return reply
            }
          }
          if (businessResult === 'unknown' && taskState.recordBlockedScope(true)) {
            for (const gap of completionGaps()) if (!gaps.includes(gap)) gaps.push(gap)
            await appendEvent(runId, 'exploration:coverage-updated', {
              source: 'executor',
              reason: 'blocked-before-business-outcome',
              task: taskState.snapshot(),
            })
          }
          const input =
            'reason' in parsed
              ? resolveShortFinish(
                  integrity.epoch() ||
                    (businessResult === 'unknown' && parsed.reason === 'scope-covered')
                    ? { reason: 'unverified-scope' }
                    : parsed,
                  {
                    businessResult,
                    gaps,
                  },
                )
              : parsed
          const missingOutcome =
            input.businessResult !== 'unknown' && input.businessResult !== businessResult
          const unsupportedBlock =
            input.blocked &&
            input.businessResult !== 'unknown' &&
            businessResult !== 'unknown' &&
            gaps.length === 0
          if (
            missingOutcome ||
            unsupportedBlock ||
            (!input.blocked && input.businessResult !== 'unknown' && gaps.length > 0)
          ) {
            const result = {
              accepted: false,
              error: missingOutcome
                ? 'outcome-not-supported'
                : unsupportedBlock
                  ? 'no-applicable-blocker'
                  : 'inspection-incomplete',
              finishAdvice: {
                businessResult,
                blocked: businessResult === 'unknown' || gaps.length > 0,
                // The newest normalized fact, not a business-specific response shape: the reporter
                // of an outcome is the same object for every business.
                response: businessFacts.at(-1) ?? null,
                note: finishNote(),
              },
              missingFacts: missingOutcome ? missingOutcomeFacts() : gaps,
            }
            await appendEvent(runId, 'finish:rejected', result)
            return result
          }
          if (pendingRules)
            taskState.setBranches([
              ...taskState
                .snapshot()
                .unexploredBranches.map(({ description, trigger }) => ({ description, trigger })),
              {
                description: `${pendingRules} applicable learned rule checks unverified`,
                trigger: 'retryable-failure',
              },
            ])
          guard()
          const transition = phaseTracker.enterFinalizing('agent-ready')
          if (transition.changed)
            await appendEvent(runId, 'run:phase-changed', {
              from: transition.previous,
              to: transition.current,
              reason: transition.reason,
            })
          if (input.businessResult !== 'unknown') businessResult = input.businessResult
          stopReason =
            input.blocked || input.businessResult === 'unknown' ? 'blocked' : 'goal-reached'
          guard()
          finished = true
          await appendEvent(runId, 'finish:accepted', {
            ...input,
            task: taskState.snapshot(),
            verifiedOperations: [...verifiedByOperation.entries()].map(([operationId, v]) => ({
              operationId,
              businessResult: v.result,
            })),
          })
          await appendEvent(runId, 'agent:done', input, {
            stepId,
            evidenceRefs: [
              ...new Set([
                ...latest!.evidenceRefs,
                ...[...verifiedByOperation.values()].flatMap((v) => v.evidenceRefs),
              ]),
            ],
          })
          return { accepted: true }
        },
        review?.attemptId,
      )
    const tools = {
      ...(temporalInvestigator
        ? {
            investigation_check: createTool({
              id: 'investigation.check',
              description:
                'Test a grounded novel expectation that a current target becomes visible or pointer-actionable within a declared continuous measurement window. Registers hypothesis, binds the node, measures, evaluates the declared predicate and saves a bounded finding or refutation in one call. It does not prove requirement applicability, click behavior, pixel covering or any deadline before measurement starts. Select element-actionable for operability. Existing learned rules still use rule_check. Identical unchanged investigations reuse their historical result; freshWindowReason requests a new window for a specific remaining question. After completion do not duplicate the finding or measurement; continue remaining scope or run_finish.',
              inputSchema: temporalInvestigationInput,
              execute: (input) =>
                serial('investigation_check', async () => {
                  const refs = input.evidenceRefs ?? []
                  const owned = await getDbClient().execute({
                    sql: 'SELECT id FROM artifacts WHERE run_id=?',
                    args: [runId],
                  })
                  if (refs.some((id) => !owned.rows.some((a) => a.id === id)))
                    throw Error('invalid evidence reference')
                  return temporalInvestigator!.run(input)
                }),
            }),
          }
        : {}),
      journey_run: createTool({
        id: 'journey.run',
        description: journeyRunDescription(),
        inputSchema: journeyInput,
        execute: (input) =>
          serial('journey_run', async () => {
            const journey = journeys.find(
              (j) => j.id === input.journeyId && j.revision === input.revision,
            )
            if (!journey) return { error: 'evidenced journey unavailable' }
            if (sideEffectPending || pendingWrites.size)
              return { error: 'pending write; cannot enter a read-only segment' }
            await appendEvent(runId, 'journey:started', {
              ...input,
              sourceRunId: journey.sourceRunId,
              contract: journey,
            })
            sideEffectPolicy.setReadOnly(true)
            try {
              const result = await runJourney(journey, {
                guard,
                snapshot: () => latest!.snapshot as PageSnapshot,
                observe: () => observe(true),
                blocked: () =>
                  businessCreated ||
                  sideEffectPending ||
                  latest!.snapshot.elements.some(
                    (e) =>
                      e.visible &&
                      e.enabled !== false &&
                      e.hitSamples?.some((s) => s.relation === 'unrelated'),
                  ) ||
                  !!latestChecks?.results.some((r) => r.verdict === 'fail'),
                unique: async (step) =>
                  (await page
                    .getByRole(step.action.role, { name: step.action.name, exact: true })
                    .count()) === 1,
                act: performAction,
              })
              await appendEvent(runId, 'journey:finished', result)
              return {
                ...result,
                inspection: inspectionSummary(),
                url: latest!.snapshot.url,
                a11yTree: latestA11y,
                elements: referenceIndex(),
                evidenceRefs: latest!.evidenceRefs,
              }
            } finally {
              // Keep the barrier for delayed requests until a new explicit page_act.
              sideEffectPolicy.setReadOnly(true)
            }
          }),
      }),
      rules_search: createTool({
        id: 'rules.search',
        description:
          'Retrieve a bounded page of enabled rules. Use query="" for applicable/unknown candidates, or a name/id to search the whole catalog. offset follows nextOffset. Missing trigger facts remain unknown, never assumed irrelevant.',
        inputSchema: ruleSearchInput,
        execute: (input) =>
          serial('rules_search', async () =>
            ruleCatalog(getEnabledRules(), await currentRuleContext(), input.query, input.offset),
          ),
      }),
      rule_details: createTool({
        id: 'rule.details',
        description:
          'Read the complete enabled rule declaration and its execution contract by ruleId; automatic rules are not rule_check targets.',
        inputSchema: ruleDetailsInput,
        execute: (input) =>
          serial('rule_details', async () => {
            const rule = getRule(input.ruleId)
            if (!rule?.enabled) return { error: 'enabled rule not found' }
            return {
              id: rule.id,
              revision: rule.revision,
              description: rule.description,
              routing: rule.routing,
              declaration: rule.declaration,
            }
          }),
      }),
      history_read: createTool({
        id: 'history.read',
        description:
          'Retrieve earlier action arguments, outcomes, hypothesis IDs and evidence. History is indexed from 0; use when recent history was omitted or you need an older result. Does not interact with the page.',
        inputSchema: historyReadInput,
        execute: (input) =>
          serial('history_read', async () => {
            const result = boundedHistoryPage(history, input.start, input.count ?? 1)
            for (const e of result.entries)
              for (const t of e.tools) {
                if (
                  inspectedResultRefs.size < 3 &&
                  !['history_read', 'tool_result_read'].includes(t.tool)
                )
                  inspectedResultRefs.add(
                    JSON.stringify({
                      ...t,
                      resultRef: undefined,
                      evidenceRefs: undefined,
                      id: undefined,
                    }),
                  )
              }
            return result
          }),
      }),
      tool_result_read: createTool({
        id: 'tool.result.read',
        description:
          'Read an original tool result by resultRef from latestToolResults/history. Returns a bounded JSON fragment and nextOffset; use only when the summary lacks needed facts.',
        inputSchema: toolResultReadInput,
        execute: (input) =>
          serial('tool_result_read', async () => {
            const result = readToolResult(history, input.resultRef, input.offset ?? 0)
            if (!('error' in result) && inspectedResultRefs.size < 3)
              inspectedResultRefs.add(`${input.resultRef}:${input.offset}`)
            return result
          }),
      }),
      page_observe: createTool({
        id: 'page.observe',
        description:
          'Observe the current page via accessibility tree — shows interactive elements (buttons, links, inputs) with roles and names. Rules are checked automatically. Returns no-new-facts if page is unchanged. Use element_details for CSS selectors or hit-test data when needed.',
        inputSchema: observeInput,
        execute: () =>
          serial('page_observe', async () => {
            await observe()
            const url = latest!.snapshot.url,
              title = latest!.snapshot.title
            const freshness = staleDetector.checkA11y(url, latestA11y!, latestSlim!)
            if (!freshness.fresh && freshness.compact) {
              await appendEvent(
                runId,
                'observation:stale',
                { staleCount: freshness.staleCount, reused: true, url },
                { stepId },
              )
              return {
                noNewFacts: true,
                staleCount: freshness.staleCount,
                hint: freshness.hint,
                mustAct:
                  'No changed facts. Continue a justified bounded investigation, or report the remaining scope and finish; do not repeat observations without a purpose.',
                url,
                title,
                elements: referenceIndex(),
                evidenceRefs: latest!.evidenceRefs,
              }
            }
            const pageText = latest!.snapshot.text.replace(/\s+/g, ' ').slice(0, 500)
            const result: { [k: string]: unknown } = {
              url,
              title,
              a11yTree: latestA11y!,
              pageText,
              elements: referenceIndex(),
              evidenceRefs: latest!.evidenceRefs,
            }
            if (!freshness.fresh && freshness.hint) {
              await appendEvent(
                runId,
                'observation:stale',
                {
                  staleCount: (freshness as { staleCount: number }).staleCount,
                  reused: false,
                  url,
                },
                { stepId },
              )
              result.staleWarning = freshness.hint
            }
            return result
          }),
      }),
      checks_run: createTool({
        id: 'checks.run',
        description:
          'Run known rules on the latest observed state; an empty registry is not a pass.',
        inputSchema: checksInput,
        execute: () => serial('checks_run', checks),
      }),
      element_details: createTool({
        id: 'element.details',
        description:
          'Expand full hit-test samples and attributes for up to 5 element refs from observations. Use when hit summary shows blocked points or you need exact hit-test data for evidence.',
        inputSchema: elementDetailsInput,
        execute: (input) =>
          serial('element_details', async () => {
            const results = input.refs.map((ref) => {
              const detail = elementStore.getDetail(ref)
              if (!detail.found) return { ref, error: detail.reason }
              if (!detail.fresh)
                return {
                  ref,
                  stale: true,
                  snapshotId: detail.snapshotId,
                  hint: 'Re-observe for current state',
                }
              return {
                ref,
                selector: detail.element.selector,
                hitSamples: detail.element.hitSamples,
                text: detail.element.text,
                attributes: detail.element.attributes,
              }
            })
            await appendEvent(
              runId,
              'element:details-requested',
              {
                refs: input.refs,
                results: results.map((r) => ({
                  ref: r.ref,
                  found: !('error' in r),
                  fresh: !('stale' in r),
                })),
              },
              { stepId },
            )
            return results
          }),
      }),
      page_act: createTool({
        id: 'page.act',
        description: pageActDescription(businessContract, config.features),
        inputSchema: actionInput,
        execute: (input) =>
          serial('page_act', () => {
            guard()
            sideEffectPolicy.setReadOnly(false)
            return performAction(input)
          }),
      }),
      hypotheses_record: createTool({
        id: 'hypotheses.record',
        description:
          'Register a falsifiable new issue before testing it. Requirements are not proof that a defect exists.',
        inputSchema: hypothesisInput,
        execute: (input) =>
          serial('hypotheses_record', async () => {
            const h = await recordHypothesis({
              ...input,
              runId,
              status: 'open',
              evidenceRefs: latest?.evidenceRefs ?? [],
            })
            knownHypothesisIds.add(h.id)
            taskState.recordHypothesis(h.id, input.phenomenon, input.trigger)
            const transition = phaseTracker.enterVerifying('hypothesis recorded')
            if (transition.changed)
              await appendEvent(runId, 'run:phase-changed', {
                from: transition.previous,
                to: transition.current,
                reason: transition.reason,
              })
            return { ...h, trigger: input.trigger }
          }),
      }),
      rule_check: createTool({
        id: 'rule.check',
        description:
          'Check an existing learned rule against a current elementRef. Select the element semantically and explain its relation to the failed operation. Use observedRuleTriggers.eventRef as triggerEvidenceRefs. Cite consulted public business resources in evidenceRefs. The server derives the semantic target, condition and full measurement window; do not invent these. Results and evidence are saved automatically; do not submit the same finding again. Use hypothesisIds: [] unless linking exactly one existing hypothesis for this investigation.',
        inputSchema: ruleCheckInput,
        execute: (raw) =>
          serial('rule_check', async () => {
            const parsed = ruleCheckInput.parse(raw)
            const input = { ...parsed, hypothesisId: parsed.hypothesisIds[0] }
            const owned = await getDbClient().execute({
              sql: 'SELECT id FROM artifacts WHERE run_id=?',
              args: [runId],
            })
            if (input.evidenceRefs?.some((id) => !owned.rows.some((r) => r.id === id)))
              throw Error('invalid evidence reference')
            const rule = getRule(input.ruleId)
            let contract: ReturnType<typeof resolveRuleContract>
            const detail = elementStore.getDetail(input.elementRef)
            try {
              contract = resolveRuleContract(
                rule,
                await getEvents(runId),
                latest!.snapshot.text,
                input.triggerEvidenceRefs,
              )
              if (!detail.found || !detail.fresh || page.url() !== latest!.snapshot.url)
                throw new Error('stale-or-unknown-element-ref; observe and rebind')
              if (input.hypothesisId) {
                const h = taskState.snapshot().hypotheses.find((h) => h.id === input.hypothesisId)
                if (
                  !h ||
                  h.trigger !== contract.trigger.eventType ||
                  ruleCheckResults.some((r) => r.hypothesisId === h.id)
                )
                  throw new Error(
                    'hypothesis must be owned, match the trigger and not already bound',
                  )
              }
            } catch (error) {
              const unresolved = {
                ruleId: input.ruleId,
                verdict: 'unknown',
                error: String(error),
                elementRef: input.elementRef,
              }
              await appendEvent(runId, 'rule:check-unresolved', unresolved)
              return unresolved
            }
            if (!detail.found) throw new Error('element disappeared')
            const locator = page.locator(detail.element.selector)
            if ((await locator.count()) !== 1)
              return {
                ruleId: input.ruleId,
                verdict: 'unknown',
                error: 'ambiguous-element; observe and rebind',
              }
            const handle = await locator.elementHandle()
            if (!handle)
              return {
                ruleId: input.ruleId,
                verdict: 'unknown',
                error: 'missing-element; observe and rebind',
              }
            let retained = false
            try {
              const identity = await handle.evaluate((el) => ({
                tag: el.tagName.toLowerCase(),
                text: (el.textContent ?? '').trim().slice(0, 700),
                connected: el.isConnected,
              }))
              if (
                !identity.connected ||
                identity.tag !== detail.element.tag ||
                identity.text !== detail.element.text
              )
                return {
                  ruleId: input.ruleId,
                  verdict: 'unknown',
                  error: 'element-changed; observe and rebind',
                }
              const d = contract.declaration
              const fingerprint = JSON.stringify(detail.element)
              if (!input.hypothesisId && !integrity.epoch()) {
                for (const cached of boundCache) {
                  if (
                    cached.result.ruleId === input.ruleId &&
                    cached.triggerRef === contract.trigger.eventRef &&
                    cached.fingerprint === fingerprint &&
                    cached.result.verdict !== 'unknown' &&
                    (await handle.evaluate((el, previous) => el === previous, cached.handle)) &&
                    cached.lastValue !== null &&
                    (await sampleBoundElementCondition(
                      handle,
                      d.expectation.condition as 'element-visible' | 'element-actionable',
                    )) === cached.lastValue
                  ) {
                    await appendEvent(runId, 'rule:check-reused', {
                      checkId: cached.result.checkId,
                      elementRef: input.elementRef,
                    })
                    return {
                      ...cached.result,
                      reused: true,
                      summary:
                        'Same operation and unchanged bound element already checked. Reuse the saved result and continue or run_finish.',
                    }
                  }
                }
              }
              const binding = {
                id: `binding-${randomUUID()}`,
                ruleId: rule!.id,
                ruleRevision: rule!.revision,
                operationId: contract.trigger.operationId,
                elementRef: input.elementRef,
                snapshotId: detail.snapshotId,
                triggerEvidenceRefs: input.triggerEvidenceRefs,
                reason: input.bindingReason,
              }
              await appendEvent(runId, 'rule:bound', {
                ...binding,
                selector: detail.element.selector,
                hypothesisId: input.hypothesisId,
              })
              const measurement = await measureTransition(
                {
                  eventType: contract.trigger.eventType,
                  target: d.expectation.target,
                  selector: detail.element.selector,
                  condition: d.expectation.condition as 'element-visible' | 'element-actionable',
                  durationMs: d.expectation.timeoutMs,
                },
                binding,
                () =>
                  sampleBoundElementCondition(
                    handle,
                    d.expectation.condition as 'element-visible' | 'element-actionable',
                  ),
              )
              measurement.evidenceRefs = [
                ...new Set([...measurement.evidenceRefs, ...(input.evidenceRefs ?? [])]),
              ]
              const verdict = integrity.epoch() ? 'unknown' : evaluateTransition(d, measurement)
              let findingId: string | undefined
              if (verdict === 'fail') {
                const f = await submitFinding({
                  runId,
                  source: 'rule',
                  ruleId: rule!.id,
                  ruleRevision: rule!.revision,
                  hypothesisId: input.hypothesisId ?? null,
                  validationStatus: 'supported',
                  severity: d.severity,
                  title: d.name,
                  expected: d.description,
                  actual: `${binding.operationId}: ${d.expectation.target} unavailable throughout ${d.expectation.timeoutMs}ms`,
                  stepId,
                  evidenceRefs: measurement.evidenceRefs,
                })
                findingId = f.id
                findingFacts.add(
                  JSON.stringify([f.ruleId, binding.operationId, input.elementRef, f.actual]),
                )
                await appendEvent(
                  runId,
                  'finding:submitted',
                  { findingId, bindingId: binding.id, hypothesisId: input.hypothesisId },
                  { stepId, evidenceRefs: measurement.evidenceRefs },
                )
              }
              if (input.hypothesisId) {
                const status =
                  verdict === 'fail' ? 'supported' : verdict === 'pass' ? 'refuted' : 'inconclusive'
                await updateHypothesis(input.hypothesisId, status, measurement.evidenceRefs)
                taskState.resolveHypothesis(input.hypothesisId, status)
              }
              const result = {
                checkId: `check-${randomUUID()}`,
                ruleId: rule!.id,
                bindingId: binding.id,
                operationId: binding.operationId,
                elementRef: input.elementRef,
                verdict,
                nextStep: completedCheckNextStep(verdict),
                findingId,
                evidenceRefs: measurement.evidenceRefs,
                hypothesisId: input.hypothesisId,
              }
              ruleCheckResults.push(result)
              boundCache.push({
                handle,
                fingerprint,
                triggerRef: contract.trigger.eventRef,
                lastValue: measurement.samples.at(-1)?.value ?? null,
                result,
              })
              retained = true
              await appendEvent(runId, 'rule:check-completed', result, {
                stepId,
                evidenceRefs: measurement.evidenceRefs,
              })
              return result
            } finally {
              if (!retained) await handle.dispose()
            }
          }),
      }),
      transition_observe: createTool({
        id: 'transition.observe',
        description:
          'Measure an owned unresolved hypothesis over a bounded time window. Register a grounded novel hypothesis first and supply its ID. Existing learned rules use rule_check. Measure target visibility or pointer actionability over a bounded time window. Actionability samples require an enabled, visible target with an unobstructed viewport hit point; they do not dispatch a click or prove the click handler works. This gathers facts; it does not decide whether there is a defect. Prefer a current elementRef from observations; the server resolves and retains its node, so do not copy long CSS paths. Use exactly one of elementRef or legacy selector. Null means unknown, never false. Use after observing the relevant feedback.',
        inputSchema: transitionInput,
        execute: (input) =>
          serial('transition_observe', async () => {
            const hypothesis = taskState
              .snapshot()
              .hypotheses.find((h) => h.id === input.hypothesisId)
            if (
              !hypothesis ||
              !['open', 'inconclusive'].includes(hypothesis.status) ||
              hypothesis.applicability === 'not-triggered'
            )
              throw Error(
                'measurement-requires-unresolved-hypothesis: use rule_check for known rules, or record a grounded novel hypothesis first',
              )
            if (!!input.elementRef === !!input.selector)
              throw Error('Use exactly one current elementRef or legacy selector')
            const condition = input.condition ?? 'element-actionable'
            if (!input.elementRef)
              return measureTransition({ ...input, selector: input.selector!, condition })
            const detail = elementStore.getDetail(input.elementRef)
            if (!detail.found || !detail.fresh || page.url() !== latest!.snapshot.url)
              throw Error('stale-or-unknown-element-ref; observe and rebind')
            const locator = page.locator(detail.element.selector)
            if ((await locator.count()) !== 1) throw Error('ambiguous-element; observe and rebind')
            const handle = await locator.elementHandle()
            if (!handle) throw Error('missing-element; observe and rebind')
            try {
              const identity = await handle.evaluate((el) => ({
                tag: el.tagName.toLowerCase(),
                text: (el.textContent ?? '').trim().slice(0, 700),
                connected: el.isConnected,
              }))
              if (
                !identity.connected ||
                identity.tag !== detail.element.tag ||
                identity.text !== detail.element.text
              )
                throw Error('element-changed; observe and rebind')
              return await measureTransition(
                { ...input, selector: detail.element.selector, condition },
                undefined,
                () => sampleBoundElementCondition(handle, condition),
              )
            } finally {
              await handle.dispose()
            }
          }),
      }),
      findings_submit: createTool({
        id: 'findings.submit',
        description:
          'Submit an exploration finding with a registered hypothesis, actual observations and evidence IDs. Supported claims require owned screenshot and measurement/snapshot evidence. Visual occlusion candidates cannot currently be verified by the available interaction measurements; submit inconclusive for them, preserving the evidence gap. Do not duplicate or reword them to bypass this boundary.',
        inputSchema: findingInput,
        execute: (input) =>
          serial('findings_submit', async () => {
            const db = getDbClient(),
              h = await db.execute({
                sql: 'SELECT id FROM hypotheses WHERE id=? AND run_id=?',
                args: [input.hypothesisId, runId],
              })
            if (!h.rows.length) throw new Error('hypothesis not owned by run')
            const owned = await db.execute({
              sql: 'SELECT id,type FROM artifacts WHERE run_id=?',
              args: [runId],
            })
            if (input.evidenceRefs.some((id) => !owned.rows.some((r) => r.id === id)))
              throw new Error('invalid evidence reference')
            if (
              ['supported', 'refuted'].includes(input.validationStatus) &&
              transitions.some(
                (m) =>
                  m.samples.some((s) => s.value === null) &&
                  input.evidenceRefs.some(
                    (id) =>
                      m.evidenceRefs.includes(id) &&
                      owned.rows.some((a) => a.id === id && a.type === 'measurement'),
                  ),
              )
            )
              throw Error(
                'unknown-measurement: missing, ambiguous or replaced targets cannot support/refute a claim; rebind and measure or report inconclusive',
              )
            const linked = ruleCheckResults.find((r) => r.hypothesisId === input.hypothesisId)
            if (linked && linked.verdict !== 'unknown') {
              const expectedStatus = linked.verdict === 'fail' ? 'supported' : 'refuted'
              if (
                input.validationStatus !== expectedStatus ||
                !input.evidenceRefs.some(
                  (id) =>
                    linked.evidenceRefs.includes(id) &&
                    owned.rows.some((r) => r.id === id && r.type === 'measurement'),
                )
              )
                throw new Error(
                  'bound hypothesis already resolved; use its measurement or create a separate investigation',
                )
              await appendEvent(runId, 'finding:reused', {
                checkId: linked.checkId,
                findingId: linked.findingId,
                hypothesisId: input.hypothesisId,
              })
              return { ...linked, reused: true, validationStatus: expectedStatus }
            }
            if (
              input.validationStatus === 'supported' &&
              (!input.evidenceRefs.some((id) =>
                owned.rows.some((r) => r.id === id && r.type === 'screenshot'),
              ) ||
                !input.evidenceRefs.some((id) =>
                  owned.rows.some(
                    (r) => r.id === id && ['snapshot', 'measurement'].includes(String(r.type)),
                  ),
                ))
            )
              throw new Error('supported requires screenshot and observation/measurement')
            const f = await submitFinding({
              ...input,
              runId,
              source: 'agent',
              ruleId: null,
              ruleRevision: null,
              stepId,
            })
            await updateHypothesis(
              input.hypothesisId,
              input.validationStatus === 'candidate' ? 'open' : input.validationStatus,
              input.evidenceRefs,
            )
            taskState.resolveHypothesis(input.hypothesisId, input.validationStatus)
            findingFacts.add(JSON.stringify([input.title, input.actual, input.validationStatus]))
            await appendEvent(
              runId,
              'finding:submitted',
              { findingId: f.id, hypothesisId: f.hypothesisId },
              { stepId, evidenceRefs: [...f.evidenceRefs] },
            )
            return f
          }),
      }),
      exploration_update: createTool({
        id: 'exploration.update',
        description:
          'Record reached states and unfinished branches. Give every branch its actual trigger; use always only for an unconditional obligation. The server derives whether a condition triggered. Untriggered branches are reported separately and do not block completion. Send an empty list to clear previously recorded branches after checking them.',
        inputSchema: explorationInput,
        execute: (input) =>
          serial('exploration_update', async () => {
            notes.push(input)
            taskState.setBranches(input.unexploredBranches)
            await appendEvent(runId, 'exploration:state-reached', { state: input.state })
            await appendEvent(runId, 'exploration:coverage-updated', { task: taskState.snapshot() })
            return {
              state: input.state,
              task: taskState.snapshot(),
              missingFacts: completionGaps(),
            }
          }),
      }),
      run_finish: createTool({
        id: 'run.finish',
        description:
          'Stop with an observed business outcome or blocked path. Completion never removes earlier findings. Unknown outcomes cannot count as successful completion.',
        inputSchema: config.features?.shortFinish ? shortFinishInput : legacyFinishInput,
        execute: (request) => finishInspection(request),
      }),
    }
    // The inspected business's own requirements, from its frozen contract, so an export run is not
    // briefed with the shopping requirements and vice versa.
    const policy = inspectionPolicy(run.spec.goal, config.features, businessContract)
    const reviewedStates = new Set<string>()
    const refreshedReviewVersions = new Set<string>()
    const agent = new Agent({
      id: 'ui-explorer',
      name: 'UI explorer',
      model: agentModel,
      maxRetries: 0,
      tools,
      instructions: policy,
    })
    while (!finished) {
      const finCheck = phaseTracker.shouldFinalize({
        elapsedMs: Date.now() - startedAt,
        modelCallsUsed: usage.modelCalls,
        noProgressStreak: noToolStreak,
      })
      if (finCheck.should) {
        const transition = phaseTracker.enterFinalizing(finCheck.reason)
        if (transition.changed) {
          await appendEvent(runId, 'run:phase-changed', {
            from: transition.previous,
            to: transition.current,
            reason: transition.reason,
            budgetRemaining: {
              actions: budget.maxActions - usage.actions,
              modelCalls: budget.maxModelCalls - usage.modelCalls,
              timeMs: budget.totalTimeoutMs - (Date.now() - startedAt),
            },
          })
        }
      }
      guard()
      if (usage.modelCalls >= budget.maxModelCalls) throw new Error('budget-exhausted')
      if (phaseTracker.finalizingBudgetExhausted()) {
        stopReason =
          phaseTracker.getState().reason === 'no-progress' ? 'no-progress' : 'finish-incomplete'
        await appendEvent(runId, 'execution:partial', {
          reason: stopReason,
          task: taskState.snapshot(),
          businessResult,
        })
        break
      }
      const memory = decisionMemory(history)
      const recentHistory = memory.history
      const phaseState = phaseTracker.getState()
      const catalog = config.features?.ruleRouting
        ? ruleCatalog(getEnabledRules(), await currentRuleContext())
        : undefined
      const pendingRules = await pendingKnownRules()
      const retryBlocker = config.features?.blockerReview ? await measuredRetryBlocker() : undefined
      const activeTools = Object.keys(tools).filter((name) => {
        if (name === 'investigation_check') return phaseTracker.phase !== 'finalizing'
        if (name === 'transition_observe') return taskState.hasOpenHypotheses()
        if (name === 'findings_submit') return knownHypothesisIds.size > 0
        return true
      })
      const agentInput = {
        activeTools,
        goal: run.spec.goal,
        availableJourneys: availableJourneys()
          .slice(0, 3)
          .map((j) => ({
            id: j.id,
            revision: j.revision,
            steps: j.steps.map((s) => s.action.name),
            writePolicy: j.writePolicy,
          })),
        phase: phaseState.phase,
        ...(phaseState.phase === 'finalizing'
          ? {
              finalizationDirective: `Finalize within ${phaseState.finalizingMaxCalls - phaseState.finalizingCallsUsed} model requests, including retries. Resolve existing investigations with evidence if possible, report any unverified scope honestly, then run_finish. Do not invent findings or start new business actions.`,
            }
          : {}),
        inspection: inspectionSummary(),
        ruleCatalog: catalog ? { ...catalog, entries: undefined } : undefined,
        pendingKnownRuleChecks: pendingRules,
        knownRules: catalog
          ? catalog.entries
          : getEnabledRules().map((r) => ({
              id: r.id,
              name: r.name,
              description: r.description,
              declaration: r.declaration,
              execution: r.declaration
                ? 'rule_check: select current element and event'
                : 'automatic: already evaluated with observations; not a rule_check target',
            })),
        observedRuleTriggers: [
          retryTrigger(await getEvents(runId), latest?.snapshot.text ?? ''),
        ].filter(Boolean),
        completedRuleChecks: ruleCheckResults.slice(-12),
        ...(retryBlocker ? { measuredRetryBlocker: retryBlocker } : {}),
        ...(config.features?.atomicInvestigation
          ? { completedInvestigations: completedInvestigations.slice(-12) }
          : {}),
        observation: {
          url: latest?.snapshot.url,
          title: latest?.snapshot.title,
          a11yTree: latestA11y,
          elements: referenceIndex(),
          pageText: latest?.snapshot.text.replace(/\s+/g, ' ').slice(0, 500),
        },
        evidenceRefs: latest?.evidenceRefs ?? [],
        activeHypotheses: taskState
          .snapshot()
          .hypotheses.filter(
            (h) =>
              ['open', 'inconclusive'].includes(h.status) && h.applicability !== 'not-triggered',
          )
          .map((h) => h.id),
        submittedFindings: findingMemory(await getFindings(runId)),
        latestToolResults: memory.latestToolResults,
        history: recentHistory,
        historyWindow: {
          total: history.length,
          start: recentHistory[0]?.index ?? Math.max(0, history.length - 1),
          omitted: Math.max(0, history.length - recentHistory.length - 1),
        },
        notes: notes.slice(-10),
        task: taskState.snapshot(),
        evidenceIntegrity: integrity.snapshot(),
        finishReadiness: {
          businessResult,
          applicableGaps: completionGaps(),
          note: 'A saved pass or fail resolves that check. A failed operation does not require further investigation merely because businessResult is unknown. If an evidenced blocker prevents safe recovery, call run_finish with observed-blocker; unknown is then an honest business result. If scope is covered, call run_finish with scope-covered. A processing operation or unresolved evidence still requires waiting, investigation or an explicit unverified-scope report.',
        },
        businessOutcomeObserved: {
          businessResult,
          // Verified operations are reported by their own identity and result. The executor has no
          // business-specific field to expose here: an order id would be shopping vocabulary that
          // means nothing to another business.
          verifiedOperations: [...verifiedByOperation.entries()].map(([operationId, v]) => ({
            operationId,
            businessResult: v.result,
          })),
          response: businessFacts.at(-1) ?? null,
          writePolicy: {
            maxCreates: businessContract.effects.maxCreates,
            maxRetriesPerOperation: businessContract.effects.maxRetriesPerOperation,
            createsSpent: sideEffectPolicy.snapshot().createsReserved,
            retriesSpent: sideEffectPolicy.snapshot().retriesReserved,
            createsRemaining: Math.max(
              0,
              businessContract.effects.maxCreates - sideEffectPolicy.snapshot().createsReserved,
            ),
            recoveryPolicy:
              'Create and retry have separate budgets. A retry of the current owned operation is permitted only by its latest business facts and remaining retry allowance. Use an operable UI control; never force a disabled control or replay an uncertain write.',
          },
          hint: 'Business outcome is not inspection completion. Resolve in-scope investigations without repeating the business write.',
        },
        // Public business documents this run retained as evidence. A claim about one of these - a
        // recovery control that cannot be operated although the backend permits the retry, say -
        // must cite the resource itself, not only the screen it produced. The published body is
        // included so the resource is *consultable*: a ref an agent is told to cite but cannot read
        // is not evidence it can reason from, and the E2 run's basis quoted the job payload's
        // `prerequisitesMet` while the resource said the opposite. Bounded, because it is business
        // JSON the run did not author.
        retainedResources: retainedResources.map((r) => ({
          kind: r.kind,
          operationId: r.operationId,
          evidenceRefs: r.evidenceRefs,
          value: boundedResource(r.value),
        })),
        ...(retainedResources.length
          ? {
              retainedResourceGuidance: retainedResourceGuidance(
                retainedResources.map((r) => r.kind),
              ).trim(),
            }
          : {}),
        budgetRemaining: {
          actions: budget.maxActions - usage.actions,
          modelCalls: budget.maxModelCalls - usage.modelCalls,
          timeMs: budget.totalTimeoutMs - (Date.now() - startedAt),
        },
        ...(noToolStreak >= 3 && phaseState.phase !== 'finalizing'
          ? {
              noProgressWarning: `${noToolStreak} consecutive responses with no meaningful progress. Gather relevant new facts, resolve existing investigations with evidence, or run_finish if the scope is covered. Repeated observations and failed tools do not count as progress; continued lack of progress triggers finalization.`,
            }
          : {}),
      }
      if (
        config.features?.blockerReview &&
        config.features?.shortFinish &&
        reviewedStates.size < 3 &&
        budget.maxModelCalls - usage.modelCalls >= 3 &&
        budget.totalTimeoutMs - (Date.now() - startedAt) > 20000 &&
        !sideEffectPending &&
        blockerEvidenceEligible({
          businessResult,
          integrity: integrity.snapshot().status,
          gaps: completionGaps(),
          pendingRules,
          pendingAnalyses: 0,
          supportedFinding: agentInput.submittedFindings.items.some(
            (f) => f.validationStatus === 'supported',
          ),
          currentFailure: latestChecks?.results.some((r) => r.verdict === 'fail') ?? false,
          recoveryOpportunity: await hasRecoveryOpportunity(page),
          measuredRetryBlocker: !!retryBlocker,
          phase: phaseTracker.phase,
        })
      ) {
        const version = await readObservationVersion(page)
        const reviewKey = createHash('sha256')
          .update(
            JSON.stringify([
              version.key,
              taskState.snapshot(),
              integrity.snapshot(),
              businessFacts,
              ruleCheckResults,
              [...findingFacts],
              [...measurementFacts],
            ]),
          )
          .digest('hex')
        const body = blockerReviewBody(policy, agentInput)
        await appendEvent(runId, 'completion-review:eligibility', {
          factVersion: reviewKey,
          fitsContext: !!body,
          observationVersion,
          currentVersion: version,
          alreadyReviewed: reviewedStates.has(reviewKey),
        })
        // Observation and annotation can span document/focus changes. Refresh once rather than
        // treating a stale snapshot as current or asking a model to decide from it.
        if (
          body &&
          version.reusable &&
          !sameObservationVersion(observationVersion, version) &&
          refreshedReviewVersions.size < 2 &&
          !refreshedReviewVersions.has(version.key)
        ) {
          refreshedReviewVersions.add(version.key)
          await observe()
          continue
        }
        if (
          body &&
          sameObservationVersion(observationVersion, version) &&
          !reviewedStates.has(reviewKey)
        ) {
          reviewedStates.add(reviewKey)
          guard()
          countModel()
          const attemptId = randomUUID()
          const handle = requestTracker.startRequest('agent', config.completionReview.model)
          await appendEvent(runId, 'model:request-started', {
            attemptId,
            purpose: 'agent',
            role: 'completion-review',
            model: config.completionReview.model,
            factVersion: reviewKey,
            inputHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
          })
          await persistUsage()
          let proposal: Awaited<ReturnType<typeof requestBlockerReview>> | undefined
          let reviewError: string | undefined
          try {
            proposal = await requestBlockerReview(
              body,
              signal,
              budget.totalTimeoutMs - (Date.now() - startedAt),
            )
          } catch (error) {
            reviewError = String(error).split(config.completionReview.apiKey).join('[redacted]')
          }
          const tokens = proposal?.usage
          if (tokens) {
            reportedModelCalls++
            usage.modelInputTokens += tokens.input_tokens
            usage.modelOutputTokens += tokens.output_tokens
          } else modelUsageAvailable = false
          const reviewRecord = handle.finish({
            inputTokens: tokens?.input_tokens,
            outputTokens: tokens?.output_tokens,
            error: reviewError,
          })
          await appendEvent(runId, 'model:request-finished', {
            ...reviewRecord,
            attemptId,
            role: 'completion-review',
            responseId: proposal?.id,
            actualModel: proposal?.model,
            answer: proposal?.answers.completion,
            usage: tokens ?? 'unknown',
          })
          await persistUsage()
          guard()
          // Only the evidenced-blocker branch is authorized. Other choices preserve full exploration.
          if (proposal?.answers.completion.choice === 'observed-blocker') {
            attemptTools = 0
            attemptReads = 0
            const reply = await finishInspection(
              { reason: 'observed-blocker' },
              { version, attemptId },
            )
            await appendEvent(runId, 'completion-review:commit', {
              attemptId,
              factVersion: reviewKey,
              ...reply,
            })
            if ('accepted' in reply && reply.accepted) {
              const toolResults = [{ toolName: 'run_finish', result: reply }]
              const classification = classifyResponse({ text: '', toolResults })
              classifications.push(classification)
              await appendEvent(runId, 'agent:response', {
                text: '',
                toolResults,
                role: 'completion-review',
                requestSeq: reviewRecord.seq,
                durationMs: reviewRecord.durationMs,
                tokenUsage: {
                  inputTokens: tokens?.input_tokens,
                  outputTokens: tokens?.output_tokens,
                },
                classification: classification.category,
                classificationBasis: classification.basis,
              })
              break
            }
            // A fresh finish check may have revealed changed facts or new analysis; rebuild the input.
            continue
          }
          await appendEvent(runId, 'completion-review:deferred', {
            attemptId,
            factVersion: reviewKey,
            choice: proposal?.answers.completion.choice,
            error: reviewError,
          })
          // The reviewer is not another exploration step and does not increment no-progress streaks.
          // Rebuild after the network wait so the full Agent receives current page facts.
          await observe()
          continue
        }
      }
      const inputComposition = analyzeInputComposition(agentInput)
      let lastRecord: ReturnType<ReturnType<RequestTracker['startRequest']>['finish']> | undefined
      const handles = new Map<string, ReturnType<RequestTracker['startRequest']>>()
      const result = await executeModelRequest(
        agent,
        JSON.stringify(agentInput),
        {
          activeTools,
          requireTool: true,
          runSignal: signal,
          timeRemainingMs: budget.totalTimeoutMs - (Date.now() - startedAt),
          attemptBudget: Math.min(
            budget.maxModelCalls - usage.modelCalls,
            phaseState.phase === 'finalizing'
              ? phaseState.finalizingMaxCalls - phaseState.finalizingCallsUsed
              : Infinity,
          ),
          canRetry: () => !sideEffectPending && !phaseTracker.finalizingBudgetExhausted(),
        },
        {
          onStart: async (attempt) => {
            countModel()
            attemptTools = 0
            attemptReads = 0
            phaseTracker.countFinalizingCall()
            handles.set(attempt.attemptId, requestTracker.startRequest('agent', config.agentModel))
            await appendEvent(runId, 'model:request-started', {
              ...attempt,
              purpose: 'agent',
              model: config.agentModel,
            })
            await persistUsage()
          },
          onFinish: async (attempt) => {
            const u = attempt.usage
            if (!u || u.inputTokens === undefined || u.outputTokens === undefined)
              modelUsageAvailable = false
            else reportedModelCalls++
            usage.modelInputTokens += u?.inputTokens ?? 0
            usage.modelOutputTokens += u?.outputTokens ?? 0
            const record = handles.get(attempt.attemptId)!.finish({
              inputTokens: u?.inputTokens,
              outputTokens: u?.outputTokens,
              error: attempt.error,
              durationMs: attempt.modelDurationMs,
            })
            lastRecord = record
            await appendEvent(runId, 'model:request-finished', {
              ...attempt,
              ...record,
              status: attempt.status,
              decisionDurationMs: attempt.durationMs,
              purpose: 'agent',
              usage: u ?? 'unknown',
            })
          },
        },
      )
      const record = lastRecord!
      const u = result.usage
      const classification = classifyResponse({
        text: result.text,
        toolResults: result.toolResults as unknown as readonly Record<string, unknown>[],
      })
      classifications.push(classification)
      const progressFacts: ProgressFacts = {
        pageUrl: latest?.snapshot.url,
        pageFingerprint: JSON.stringify({
          url: latest?.snapshot.url,
          text: latest?.snapshot.text,
          a11y: latestA11y,
          elements: latestSlim?.elements.map((e) => [
            e.selector,
            e.text,
            e.enabled,
            e.visible,
            e.bounds,
            e.hit.blocked,
          ]),
        }),
        hypothesisFacts: taskState.facts(),
        findingFacts: [...findingFacts],
        measurementFacts: [...measurementFacts],
        retrievedFacts: [...inspectedResultRefs],
      }
      const progressCheck = progressDetector.check(progressFacts)
      noToolStreak = progressCheck.isProgress ? 0 : noToolStreak + 1
      if (!progressCheck.isProgress) noProgressDecisions++
      if (noToolStreak === 3) {
        await appendEvent(runId, 'run:no-progress', {
          streak: noToolStreak,
          basis: progressCheck.basis,
          phase: phaseTracker.phase,
        })
      }
      history.push({
        text: result.text ?? '',
        toolResults: JSON.stringify(result.toolResults ?? []),
      })
      await appendEvent(runId, 'agent:response', {
        text: result.text,
        toolResults: result.toolResults,
        tokenUsage: u ?? 'unavailable',
        requestSeq: record.seq,
        durationMs: record.durationMs,
        classification: classification.category,
        classificationBasis: classification.basis,
        inputComposition: {
          totalBytes: inputComposition.totalBytes,
          parts: inputComposition.parts,
          observationBreakdown: inputComposition.observationBreakdown,
        },
      })
      await persistUsage()
      guard()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    stopReason =
      sideEffectPending || message === 'reconciliation-required'
        ? 'reconciliation-required'
        : timedOut || message.includes('budget-exhausted')
          ? 'budget-exhausted'
          : signal.aborted && signal.reason?.message === 'cancelled'
            ? 'cancelled'
            : message === 'model-request-timeout'
              ? 'model-request-timeout'
              : 'execution-error'
    await appendEvent(runId, 'execution:stopped', {
      reason: stopReason,
      error: message,
      sideEffectPending,
      task: taskState.snapshot(),
    })
  } finally {
    clearTimeout(timer)
    // Invalidate all in-flight tools before persisting the terminal report.
    if (!signal.aborted) active.abortController.abort(new Error('run-ended'))
    await closeResponses()
    await temporalInvestigator?.close()
    if (worker) await worker.close().catch(() => {})
    if (stopReason === 'reconciliation-required') queue.requireReconciliation()
    const finalReason = stopReason as StopReason
    const status =
      finalReason === 'goal-reached'
        ? 'completed'
        : finalReason === 'blocked'
          ? 'blocked'
          : finalReason === 'cancelled'
            ? 'cancelled'
            : finalReason === 'budget-exhausted'
              ? 'timed-out'
              : finalReason === 'reconciliation-required'
                ? 'interrupted'
                : finalReason === 'no-progress' || finalReason === 'finish-incomplete'
                  ? 'blocked'
                  : 'execution-error'
    usage.elapsedMs = Date.now() - startedAt
    await updateRunStatus(runId, status, { businessResult, stopReason, usage: reportedUsage() })
    await appendEvent(runId, 'run:completed', {
      status,
      businessResult,
      stopReason,
      usage,
      tokenUsage:
        modelUsageAvailable && reportedModelCalls === usage.modelCalls
          ? 'available'
          : 'unavailable',
    })
    requestTracker.finishPending('Run ended before request completion')
    const requestSummary = requestTracker.summarize()
    const progressSummary = summarizeProgress(classifications)
    await appendEvent(runId, 'execution:profile', profile.finish(requestSummary.records))
    const lastEvent = await appendEvent(runId, 'run:statistics', {
      requests: {
        total: requestSummary.totalRequests,
        agent: requestSummary.agentRequests,
        vision: requestSummary.visionRequests,
        success: requestSummary.successCount,
        error: requestSummary.errorCount,
        totalInputTokens: requestSummary.totalInputTokens,
        totalOutputTokens: requestSummary.totalOutputTokens,
        totalDurationMs: requestSummary.totalDurationMs,
        avgInputTokensPerCall: requestSummary.avgInputTokensPerCall,
      },
      progress: { ...progressSummary, noProgressDecisions },
      observations: { total: observeCount, ...staleDetector.getStats() },
      perRequest: requestSummary.records.map((r) => ({
        seq: r.seq,
        purpose: r.purpose,
        model: r.model,
        durationMs: r.durationMs,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        status: r.status,
        ...(r.error ? { error: r.error } : {}),
      })),
      perResponse: classifications.map((c, i) => ({
        seq: i + 1,
        category: c.category,
        basis: c.basis,
        toolsCalled: c.toolsCalled,
      })),
    })
    try {
      await verifyCompletionCommit({ runId, status, businessResult, stopReason, lastEvent })
    } catch (error) {
      queue.requireReconciliation()
      // No model retry or business replay follows an uncertain commit.
      await updateRunStatus(runId, 'interrupted', { stopReason: 'reconciliation-required' })
      await appendEvent(runId, 'run:storage-inconsistent', {
        error: String(error),
        replayAllowed: false,
      })
      throw error
    } finally {
      removeActiveRun(runId)
    }
  }
}

export function abortable<T>(signal: AbortSignal, operation: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('cancelled'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

const HISTORY_TOOL_BUDGET = 8000

/**
 * Bound a retained business resource before putting it in the agent's context.
 *
 * The resource is the business's own document, so it is passed through as-is - the point is that the
 * agent reads the source rather than an executor summary of it. It is still bounded and truncated
 * with an explicit marker, because a business that publishes a large body must not be able to spend
 * the run's context on one response. Omission is disclosed rather than silent, so the agent can see
 * that it is reading part of the document instead of inferring that it saw all of it.
 */
const RESOURCE_BUDGET = 4000
function boundedResource(value: unknown): unknown {
  const serialized = JSON.stringify(value)
  if (serialized === undefined) return null
  if (serialized.length <= RESOURCE_BUDGET) return value
  return {
    truncated: true,
    bytes: serialized.length,
    preview: serialized.slice(0, RESOURCE_BUDGET),
  }
}

export function compactToolResults(toolResults: unknown): string {
  const full = JSON.stringify(toolResults)
  if (full.length <= HISTORY_TOOL_BUDGET) return full
  const items = Array.isArray(toolResults) ? toolResults : []
  const summaries = items.map((tr) => extractToolSummary(tr as Record<string, unknown>))
  return JSON.stringify(summaries)
}
