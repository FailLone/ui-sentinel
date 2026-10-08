import { checkHash } from '../inspection/check-contract.ts'
import { createDefaultCheckRuntime, summary as checkSummary } from './default-check-runtime.ts'
import { admitOptionalScope } from './scope-admission.ts'
import { actionInputValidationError } from './action-input.ts'
import { publishInteractionFinding } from './interaction-finding.ts'
import { measureUiProbe } from './ui-probe.ts'
import { createRemainingObligationGuidance } from './remaining-obligation-guidance.ts'
import { createToolContractRepair } from './tool-contract-repair.ts'
import { uiActionRefusal } from './ui-action-boundary.ts'
import { createInteractionRecovery, recoveryDigest } from './interaction-recovery.ts'
import { createInteractionExploration } from './interaction-exploration.ts'
import { measureElement } from './investigation/measure.ts'
import {
  measureInteraction,
  assertInteractionExpectation,
  type InteractionVerification,
} from './interaction-verification.ts'
import { inspectInput, programInput, assertUiProgramBindings } from './investigation/program.ts'
import { inspectElements } from './investigation/measure.ts'
import { investigateProgram } from './investigation/service.ts'
import { createVisualFocusRuntime, VISUAL_FOCUS_VERSION } from './visual-focus-runtime.ts'
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
  readCompletionVersion,
  sameObservationVersion,
  type ObservationVersion,
} from './observation-version.ts'
import { ExecutionProfile, profileOperation } from './profiling.ts'
import { executionVersions } from './versions.ts'
import { focusProbeInput } from './focus-probe.ts'
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
import { readFile } from 'node:fs/promises'
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
  hypothesisClass,
  updateHypothesis,
  assertPromotableHypothesis,
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
import { resolveRunKind, businessResultAllowed } from '../inspection/run-kind.ts'
import { createNetworkPolicy } from '../inspection/network-policy.ts'
import { installUiNetworkSession } from './network/session.ts'
import { installRunNetworkBoundary } from './network/boundary.ts'
import { createInspectionHost } from './inspection-host.ts'
import { decideInspectionCompletion } from '../inspection/completion.ts'
import { verifyUiContractSnapshot } from '../inspection/contract.ts'
import { decideUiNavigation, normalizePageUrl } from '../inspection/navigation-scope.ts'
import { sameOrigin as sameOriginUrl } from '../inspection/url.ts'

/**
 * Whether a link's href would stay on this page's origin once the browser resolves it.
 *
 * A relative href has to be resolved against the document, not compared as text - `/detail` and
 * `https://elsewhere.example/` are not the same kind of answer - and an href a page cannot express as
 * a URL (a `javascript:` pseudo-protocol, a malformed value) is not an in-scope page.
 */
function sameOriginHref(pageUrl: string, href: string | undefined): boolean {
  if (!href) return false
  try {
    return sameOriginUrl(new URL(href, pageUrl).href, pageUrl)
  } catch {
    return false
  }
}
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
import { collectUiBlockers } from '../inspection/blocker-evidence.ts'
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
  recoveryPolicyDescription,
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
  const prepared = await queue.withRunLifecycle(runId, async () => {
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
    /**
     * Which kind of run this is, and the contract it is governed by (plan 3.1).
     *
     * This is the executor's single branch point. A `ui-scan` run has no adapter, so it is not a
     * business run with the profile filed off: it never resolves a legacy contract, never builds a
     * BusinessRuntime and never runs the side-effect policy. Reading the kind from the persisted spec
     * (rather than from a flag or the live registry) is what keeps a queued run's permissions frozen.
     */
    const runKind = resolveRunKind(run.spec)
    if (runKind.kind === 'invalid') {
      await appendEvent(runId, 'execution:stopped', {
        reason: 'execution-error',
        error: `invalid-run-kind:${runKind.reasonCode}`,
        message: runKind.message,
      })
      await updateRunStatus(runId, 'execution-error', { stopReason: 'execution-error' })
      await appendEvent(runId, 'run:completed', {
        status: 'execution-error',
        businessResult: 'unknown',
        stopReason: 'execution-error',
      })
      return
    }
    const uiScan = runKind.kind === 'ui-scan' ? runKind.contract : null
    let businessRuntime: BusinessRuntime | null = null
    if (runKind.kind === 'business')
      try {
        const contract = runKind.contract ?? legacyCompatibleContract(run.spec.entryUrl)
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
    const active = registerActiveRun(runId)
    return { run, legacyUnversioned, runKind, uiScan, businessRuntime, active }
  })
  if (!prepared) return
  const { run, legacyUnversioned, runKind, uiScan, businessRuntime, active } = prepared
  const signal = active.abortController.signal
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
  let businessResult: BusinessResult = uiScan ? 'not-applicable' : 'unknown',
    stopReason: StopReason = 'budget-exhausted'
  let worker: Awaited<ReturnType<typeof launchBrowser>> | undefined
  /** Installed before the first navigation; awaited by finish so no receipt lands after the claim. */
  let networkBoundary: Awaited<ReturnType<typeof installRunNetworkBoundary>> | undefined
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
  //
  // A UI run has no business contract at all. `null` rather than an empty object is deliberate: every
  // business-specific instruction reads it, so an invented contract would be a fabricated business.
  const businessContract = businessRuntime ? businessRuntime.contract : null
  /**
   * The inspection ledger, created before anything can observe.
   *
   * It is constructed for a UI run only, so a business run's memory is byte-for-byte what it was.
   */
  const inspection: ReturnType<typeof createInspectionHost> | null = uiScan
    ? createInspectionHost({
        runId,
        entryUrl: uiScan.entryUrl,
        goal: uiScan.goal,
        requiredChecks: uiScan.requiredChecks,
        samplingPolicy: uiScan.samplingPolicy,
        checkPolicy: uiScan.checkPolicy,
        currentSnapshotId: () => latestSlim?.snapshotId,
        currentUrl: () => latest?.snapshot.url ?? uiScan.entryUrl,
        currentObservationVersion: () => observationVersion?.key,
        appendEvent: (type, payload, extra) => appendEvent(runId, type, payload, extra),
      })
    : null
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
  const completionGaps = () => [
    ...taskState.completionGaps(),
    ...integrity.gaps(),
    ...(visualFocus?.gaps() ?? []),
  ]
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
  /** Element refs of the latest observation, positionally aligned with snapshot.elements. */
  let slimRefs: readonly string[] = []
  /** Typical pages already reached, so the contract's page budget is spent on new documents only. */
  const visitedPages: string[] = []
  /**
   * The element refs each snapshot offered, kept so an action can be tied to the document it was
   * resolved against. `slimRefs` is replaced on every observation, which is exactly the aliasing that
   * would let a post-navigation ref point at an element of a different page.
   */
  const snapshotRefs = new Map<string, readonly string[]>()
  /** The `framenavigated` listener an in-flight action installed, so it is always removed. */
  let actionNavigationListener: ((frame: unknown) => void) | null = null
  /**
   * The action currently in flight, from dispatch until its ledger entry is written.
   *
   * It exists so the *observed* result of an action - the address it landed on, the evidence it left -
   * is gathered from the browser and turned into scope without the caller having to thread a dozen
   * locals through the failure paths. An unsettled action is always settled before the next one starts.
   */
  const uiActionChecks = new Map<string, { itemId: string; target: string }>()
  const uiActionReceipt = (actionId: string) => {
    const check = uiActionChecks.get(actionId)
    const item = check && inspection?.snapshot().items.find((item) => item.itemId === check.itemId)
    return item && check
      ? {
          actionId,
          itemId: item.itemId,
          target: check.target,
          outcome: item.status,
          reasonCode: item.reasonCode,
          evidenceRefs: item.evidenceRefs,
        }
      : undefined
  }
  let checkRuntime: ReturnType<typeof createDefaultCheckRuntime> | null = null
  let preparedV2: any = null
  let programActionItems: string[] | null = null
  let programExploration:
    | import('./investigation/program.ts').InvestigationProgram['exploration']
    | null = null
  const candidateBindings = new Map<string, import('playwright').ElementHandle<Element>>()
  let activeAction: {
    actionId: string
    type: string
    ref: string
    target: string
    beforeUrl: string
    beforeRefs: readonly string[]
    snapshotPage: string
    navigated: boolean
    landedUrls: readonly string[]
    settled: boolean
    verify?: InteractionVerification
    actionError?: string
    exploration?: {
      before: Awaited<ReturnType<ReturnType<typeof createInteractionExploration>['capture']>>
      itemId: string
    }
    probe?: {
      outcome: 'actionable' | 'intercepted'
      itemId: string
      receiptRef: string
      evidenceRefs: string[]
    }
  } | null = null
  const interactionRecovery = createInteractionRecovery({
    page: () => worker!.page,
    actionVersion: () => usage.actions,
    clean: () => integrity.epoch() === 0,
    guard: () => guard(),
    hashEvidence: async (refs) => {
      const hashes: Record<string, string> = {}
      for (const ref of refs) {
        const rows = await getDbClient().execute({
          sql: 'SELECT file_path FROM artifacts WHERE id=? AND run_id=?',
          args: [ref, runId],
        })
        if (rows.rows.length !== 1) throw Error('recovery-evidence-not-owned')
        hashes[ref] = createHash('sha256')
          .update(await readFile(String(rows.rows[0]!.file_path)))
          .digest('hex')
      }
      return hashes
    },
  })
  const interactionExploration = createInteractionExploration({
    page: () => worker!.page,
    actionVersion: () => usage.actions,
    clean: () => integrity.epoch() === 0,
    guard: () => guard(),
    hashEvidence: async (refs) => {
      const hashes: Record<string, string> = {}
      for (const ref of refs) {
        const rows = await getDbClient().execute({
          sql: 'SELECT file_path FROM artifacts WHERE id=? AND run_id=?',
          args: [ref, runId],
        })
        if (rows.rows.length !== 1) throw Error('exploration-evidence-not-owned')
        hashes[ref] = createHash('sha256')
          .update(await readFile(String(rows.rows[0]!.file_path)))
          .digest('hex')
      }
      return hashes
    },
  })
  /** True after the first observation, which is the point the bounded scan may run from. */
  let visualScanEligible = false
  let visualFocus: ReturnType<typeof createVisualFocusRuntime> | undefined
  const completedInvestigations: InvestigationResult[] = []
  const investigationTriggers = new Map<string, NonNullable<ReturnType<typeof retryTrigger>>>()
  const investigationBlockers: {
    handle: import('playwright').ElementHandle<SVGElement | HTMLElement>
    fingerprint: string
    triggerRef: string
    result: InvestigationResult & { operationId: string }
  }[] = []
  let observeCount = 0
  let observationVersion: ObservationVersion | undefined
  let completionObservationVersion: ObservationVersion | undefined
  let deferCompletionReview = false
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
  let closeCoveredUiScope: () => Promise<boolean> = async () => false
  let closing = false
  const explicitScope = !!uiScan?.samplingPolicy || uiScan?.requiredChecks !== undefined
  async function refuseOptionalScope(target: string) {
    guard()
    const remaining = {
      actions: budget.maxActions - usage.actions,
      modelCalls: budget.maxModelCalls - usage.modelCalls,
      timeMs: Math.max(0, budget.totalTimeoutMs - (Date.now() - startedAt)),
    }
    // No trustworthy bound exists for an agent's new exploratory branch. Do not guess its cost.
    const decision = admitOptionalScope({
      remaining,
      closingReserve: {
        actions: 0,
        modelCalls: 2,
        timeMs: Math.min(60000, budget.totalTimeoutMs * 0.2),
      },
    })
    await inspection!.recordUnsupported(`optional-not-checked:${target}`, decision.reason)
    await appendEvent(runId, 'scope:admission-refused', {
      target,
      ...decision,
      source: 'live-executor-budget',
    })
    return {
      error: decision.reason,
      status: 'denied',
      dispatched: false,
      notChecked: target,
      remaining,
    }
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
      if (uiScan && (closing || finished))
        return { error: 'scope-closing', status: 'denied', dispatched: false } as T
      if (finished) throw new Error('run already finished')
      if (tool !== 'run_finish' && (await closeCoveredUiScope()))
        return { error: 'scope-closing', status: 'denied', dispatched: false } as T
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
      // this contract states rather than a remembered default. A UI run declares none: the plan is
      // explicit that a general site must not inherit a shopping threshold, so the rule reports its
      // measurement as unknown rather than inventing an SLA (plan 7).
      feedbackWarningMs: businessContract?.feedbackWarningMs,
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
    // An automatic rule's verdict is a *completed measurement* of the observed state, so it becomes
    // a ledger item in a UI run: a pass and a fail both finish the check, and only an unknown leaves
    // an unfinished obligation with the rule's own reason (plan 5.2, 6.2.3).
    if (inspection) {
      for (const r of result.results) {
        if (result.reused?.includes(r.ruleId)) continue
        await inspection.recordAutomaticCheck({
          ruleId: r.ruleId,
          revision: r.ruleRevision,
          verdict: r.verdict,
          evidenceRefs: [...new Set([...latest!.evidenceRefs, ...r.evidenceRefs])],
          // A rule that ran and found nothing to judge against this contract (a general site
          // declares no performance requirement) is recorded as a limit, not an obligation: the
          // executor does not turn it into a gap that would make `scope-covered` unreachable
          // (plan 5.2, 7). Any other `unknown` keeps holding completion open.
          ...(r.unchecked ? { unchecked: r.unchecked } : {}),
        })
      }
    }
    return result
  }
  /** Resolve the exact bound target only after a fresh observation and a measured postcondition. */
  async function settleActionLedger(): Promise<void> {
    const pending = activeAction
    if (!inspection || !pending || pending.settled) return
    pending.settled = true
    activeAction = null
    const observed = latest
    if (checkRuntime && preparedV2 && !pending.probe) {
      if (!pending.actionError && integrity.epoch() === 0 && !sideEffectPending) {
        const prepared = preparedV2
        preparedV2 = null
        const result = await checkRuntime.settle(prepared, pending.actionId)
        uiActionChecks.set(pending.actionId, { itemId: result.itemId, target: pending.target })
      }
      return
    }
    if (pending.probe) {
      // Positive actionability does not establish the control's effect. A conclusive
      // interception can fail only the original pending local check, never a new proxy.
      const probe = pending.probe
      if (
        probe.outcome === 'intercepted' &&
        integrity.epoch() === 0 &&
        inspection.snapshot().items.some((i) => i.itemId === probe.itemId && i.status === 'pending')
      ) {
        if (checkRuntime) {
          await checkRuntime.physicalFailure(
            probe.itemId,
            pending.actionId,
            probe.receiptRef,
            [...pending.beforeRefs, ...probe.evidenceRefs],
            (await getEvents(runId)).find(
              (e) => e.type === 'probe:measured' && e.actionId === pending.actionId,
            )!.id,
          )
          uiActionChecks.set(pending.actionId, { itemId: probe.itemId, target: pending.target })
          return
        }
        const resolved = await inspection.resolveInteraction({
          ref: pending.ref,
          snapshotId: pending.snapshotPage,
          target: pending.target,
          url: pending.beforeUrl,
          category: 'local-interaction',
          outcome: 'failed',
          reasonCode: 'probe-intercepted',
          detail: probe.receiptRef,
          evidenceRefs: [...pending.beforeRefs, ...probe.evidenceRefs],
        })
        if (resolved?.itemId !== probe.itemId) throw Error('probe-item-association-mismatch')
        uiActionChecks.set(pending.actionId, { itemId: resolved.itemId, target: pending.target })
      }
      return
    }
    // The address the browser reports, not the one the last snapshot happened to carry: this settles
    // as soon as the document has moved, which is *before* the observation that follows it.
    const landedAt = worker?.page.url() ?? pending.beforeUrl
    const fresh =
      !!observed && observed.evidenceRefs.some((ref) => !pending.beforeRefs.includes(ref))
    const measurement =
      fresh && !pending.actionError && pending.verify && integrity.epoch() === 0
        ? await measureInteraction(worker!.page, pending.verify, async () => [
            await saveEvidence(
              runId,
              'screenshot',
              await worker!.page.screenshot({ timeout: 3000 }),
              evidenceMetadata(),
              guard,
            ),
          ])
        : null
    const navigated =
      fresh &&
      !pending.actionError &&
      pending.navigated &&
      landedAt !== pending.beforeUrl &&
      integrity.epoch() === 0
    const outcome = measurement?.outcome ?? (navigated ? 'verified' : 'unverified')
    const reasonCode = pending.actionError
      ? 'action-failed'
      : (measurement?.reasonCode ??
        (navigated ? 'navigation-observed' : 'postcondition-not-verified'))
    const measurementRefs: string[] = []
    if (
      pending.exploration &&
      !pending.actionError &&
      fresh &&
      !navigated &&
      integrity.epoch() === 0 &&
      !sideEffectPending
    ) {
      const item = inspection.scope
        .snapshot()
        .items.find((i) => i.itemId === pending.exploration!.itemId)
      if (!item?.selected || item.status !== 'pending')
        throw Error('exploration-original-item-changed')
      const refs = [...new Set([...pending.beforeRefs, ...observed!.evidenceRefs])]
      const check = await interactionExploration.register(
        pending.exploration.before,
        { actionId: pending.actionId, itemId: item.itemId },
        refs,
      )
      const event = await appendEvent(
        runId,
        'interaction:explored',
        { ...check, effectTested: false },
        { actionId: pending.actionId, evidenceRefs: refs },
      )
      guard()
      inspection.scope.appendPendingEvidence(item.itemId, {
        reasonCode: 'exploration-effect-not-verified',
        evidenceRefs: refs,
        eventIds: [event.id],
        detail: `Evidence collection from original action ${pending.actionId}; no effect verdict`,
      })
      await inspection.flush()
      uiActionChecks.set(pending.actionId, { itemId: item.itemId, target: pending.target })
      return
    }
    if (measurement) {
      measurementRefs.push(...measurement.evidenceRefs)
      const ref = await saveEvidence(
        runId,
        'interaction-measurement',
        JSON.stringify({
          ...measurement,
          actionId: pending.actionId,
          target: pending.target,
          sourceSnapshot: pending.snapshotPage,
          url: landedAt,
        }),
        evidenceMetadata(),
        guard,
      )
      measurementRefs.push(ref)
      await appendEvent(
        runId,
        'interaction:measured',
        { target: pending.target, sourceSnapshot: pending.snapshotPage, outcome, reasonCode },
        {
          actionId: pending.actionId,
          evidenceRefs: [ref, ...measurement.evidenceRefs, ...observed!.evidenceRefs],
        },
      )
    }
    const resolved = await inspection.resolveInteraction({
      ref: pending.ref,
      target: pending.target,
      url: landedAt,
      evidenceRefs: [
        ...new Set([...(observed?.evidenceRefs ?? []), ...pending.beforeRefs, ...measurementRefs]),
      ],
      outcome,
      reasonCode,
      detail: measurement ? JSON.stringify(measurement) : (pending.actionError ?? reasonCode),
      category: pending.navigated ? 'navigation' : 'local-interaction',
      ...(pending.snapshotPage ? { snapshotId: pending.snapshotPage } : {}),
    })
    if (resolved)
      uiActionChecks.set(pending.actionId, { itemId: resolved.itemId, target: pending.target })
    if (resolved && programActionItems) programActionItems.push(resolved.itemId)
    if (resolved && measurement?.outcome === 'failed')
      await publishInteractionFinding({
        runId,
        actionId: pending.actionId,
        itemId: resolved.itemId,
        receiptRef: measurementRefs.at(-1)!,
        evidenceRefs: resolved.evidenceRefs,
        measurement,
        metadata: evidenceMetadata(),
        guard,
      })

    if (
      resolved &&
      measurement?.outcome === 'unverified' &&
      pending.verify &&
      !pending.navigated &&
      !pending.actionError &&
      integrity.epoch() === 0
    ) {
      const source = await interactionRecovery.register(
        { actionId: pending.actionId, itemId: resolved.itemId, input: pending.verify },
        resolved.evidenceRefs,
      )
      guard()
      await appendEvent(
        runId,
        'interaction:verification-opened',
        { ...source, sourceHash: recoveryDigest(source) },
        { actionId: pending.actionId, evidenceRefs: [...resolved.evidenceRefs] },
      )
    }
    // The document being left is finished, and this happens *after* the action's own item was
    // resolved: a navigation fulfils the candidate it was aimed at, so closing that candidate as
    // abandoned would turn the run's own successful move into an unfinished check. Its stale
    // candidate refs stop being offered; the items it left unresolved stay as obligations.
    if (normalizePageUrl(landedAt) !== normalizePageUrl(pending.beforeUrl)) {
      await inspection.leavePage(pending.snapshotPage)
      if (!visitedPages.some((v) => normalizePageUrl(v) === normalizePageUrl(pending.beforeUrl)))
        visitedPages.push(pending.beforeUrl)
    }
    // Every address the action actually landed on, including a same-document fragment change that
    // left the document untouched. An address the run was already at is not a move.
    const landed = [...new Set([...pending.landedUrls, landedAt])].filter(
      (url) => url !== pending.beforeUrl,
    )
    if (resolved?.category !== 'navigation')
      for (const url of landed)
        await inspection.recordNavigation({
          url,
          from: pending.beforeUrl,
          evidenceRefs: [...(observed?.evidenceRefs ?? [])],
          outcome: fresh && integrity.epoch() === 0 ? 'verified' : 'unverified',
          reasonCode:
            fresh && integrity.epoch() === 0 ? 'navigation-observed' : 'postcondition-not-verified',
          detail: `the run landed at ${url}`,
        })
  }

  const observe = (allowReuse = false) =>
    profileOperation('observation', async () => {
      // Post-action evidence must exist before its ledger obligation can be concluded.
      const result = await performObservation(allowReuse)
      await settleActionLedger()
      return result
    })
  async function performObservation(allowReuse: boolean) {
    guard()
    await drainResponses()
    observationReused = false
    const optimized = config.features?.observation === true
    let before = optimized ? await readObservationVersion(worker!.page) : undefined
    const beforeReview = config.features?.blockerReview
      ? await readCompletionVersion(worker!.page)
      : undefined
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
    const afterReview = beforeReview ? await readCompletionVersion(worker!.page) : undefined
    completionObservationVersion =
      beforeReview && afterReview && sameObservationVersion(beforeReview, afterReview)
        ? afterReview
        : undefined
    await drainResponses()
    observedBusinessCount = businessFacts.length
    observedIntegrityEpoch = integrity.epoch()
    const snapshotId = `s${observeCount}`
    latestSlim = elementStore.registerSnapshot(
      snapshotId,
      latest.snapshot,
      latest.snapshot.screenshotPath,
    )
    // The refs are positional with snapshot.elements, which is how the binding layer resolves a rect
    // back to a real element ref without asking the model.
    slimRefs = latestSlim.elements.map((element) => element.ref)
    snapshotRefs.set(snapshotId, slimRefs)
    visualScanEligible = true
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
    // The entry observation and the candidates this observation actually offered. The candidate
    // list is what turns "nothing to interact with" into a fact rather than a claim: the agent
    // selects from these items, and a page that offered an interaction keeps the sampling
    // obligation until one is selected (plan 5.2).
    if (inspection) await recordUiObservation()
    await checks()
    if (!cleanEvidenceIntegrity(latest.snapshot.evidenceIntegrity)) return latest
    const overlay = latest.snapshot.elements.some((e) =>
      e.hitSamples?.some((s) => s.relation === 'unrelated'),
    )
    const pageText = latest.snapshot.text.replace(/\s+/g, ' ')
    // The newest fact per operation, correlated against the page the adapter owns. Another
    // operation's success, a lone success label or a response with no visible notice cannot
    // confirm this operation.
    const operations = businessRuntime ? [...new Set(businessFacts.map((f) => f.operationId))] : []
    for (const operationId of operations) {
      if (!businessRuntime || !businessContract) break
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
    if (retained !== businessResult && businessContract) {
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
  /**
   * Record this observation in the UI ledger, and enumerate what it offered.
   *
   * The candidate list is deliberately mechanical: an element is offered when the page actually
   * presents it as an operable control the run could legitimately act on - visible, enabled, and
   * not an input the page's own markup marks as unsafe. That keeps the enumeration a fact about
   * the DOM rather than a model's recollection of it, which is what lets a later "there was
   * nothing to interact with" be checked instead of believed.
   *
   * A control an overlay covers is *still offered*: pointer interception is exactly the defect the
   * overlay rule exists to find, so removing it here would delete the evidence for it.
   */
  async function recordUiObservation(): Promise<void> {
    if (!inspection || !latest || !latestSlim) return
    const interactionTags = ['button', 'a', 'input', 'select', 'textarea', 'summary']
    const pageUrl = latest.snapshot.url
    const offered = latestSlim.elements
      .filter(
        (element) =>
          interactionTags.includes(element.tag) &&
          element.visible &&
          element.enabled &&
          !latest!.snapshot.elements.find((e) => e.selector === element.selector)
            ?.interactionExcludedReason &&
          (element.tag !== 'a' ||
            (sameOriginHref(pageUrl, element.attributes.href) &&
              networkBoundary?.navigation?.check(new URL(element.attributes.href!, pageUrl).href)
                .allow)),
      )
      .map((element) => ({
        ref: element.ref,
        samplingKey: JSON.stringify([
          pageUrl,
          element.selector,
          element.tag,
          element.text,
          element.attributes.type,
          element.attributes.name,
          element.attributes.role,
          element.attributes['aria-label'],
          element.attributes.href,
        ]),
        description: `${element.tag}${element.attributes.type ? `[${element.attributes.type}]` : ''} "${element.text.replace(/\s+/g, ' ').trim().slice(0, 60)}"`,
        category: (element.tag === 'a' ? 'navigation' : 'local-interaction') as
          | 'navigation'
          | 'local-interaction',
      }))
    const previousCandidates = [...inspection.selectedCandidates(), ...inspection.candidateItems()]
    const continuedItems = new Map<string, string>()
    for (const candidate of offered) {
      const detail = elementStore.getDetail(candidate.ref)
      if (!detail.found) continue
      const handle = await worker!.page
        .locator(detail.element.selector)
        .elementHandle()
        .catch(() => null)
      if (handle) {
        for (const previous of previousCandidates) {
          const bound = candidateBindings.get(previous.ref)
          if (
            previous.category === candidate.category &&
            bound &&
            (await bound
              .evaluate((node, current) => node.isConnected && node === current, handle)
              .catch(() => false))
          ) {
            continuedItems.set(candidate.ref, previous.itemId)
            break
          }
        }
        candidateBindings.set(candidate.ref, handle as import('playwright').ElementHandle<Element>)
      }
    }
    const requiredIds = new Map<string, string[]>()
    if (explicitScope && pageUrl === uiScan!.entryUrl) {
      for (const check of uiScan!.requiredChecks ?? []) {
        const target = worker!.page.locator(check.selector)
        if ((await target.count().catch(() => 0)) !== 1) continue
        const actual = await target.elementHandle().catch(() => null)
        if (!actual) continue
        for (const candidate of offered) {
          if ((candidate.category === 'navigation') !== (check.action === 'link')) continue
          const binding = candidateBindings.get(candidate.ref)
          if (
            binding &&
            (await binding
              .evaluate((node, other) => node.isConnected && node === other, actual)
              .catch(() => false))
          )
            requiredIds.set(candidate.ref, [...(requiredIds.get(candidate.ref) ?? []), check.id])
        }
        await actual.dispose()
      }
    }
    const categories = [...new Set(offered.map((o) => o.category))]
    await inspection.recordObservation({
      url: pageUrl,
      clean: cleanEvidenceIntegrity(latest.snapshot.evidenceIntegrity) && integrity.epoch() === 0,
      // Both refs, so a covered claim cites a readable snapshot and a screenshot rather than the
      // fact that a page happened to load (plan 6.2.1).
      evidenceRefs: [...latest.evidenceRefs],
      candidateDetail: offered.length
        ? `${offered.length} operable control(s) offered by the observation`
        : 'the observation offered no operable control within this run’s scope',
      candidateCategories: categories,
      candidateItems: offered.map((candidate) => ({
        ...candidate,
        continuedItemId: continuedItems.get(candidate.ref),
        requiredCheckIds: requiredIds.get(candidate.ref),
      })),
    })
    if (checkRuntime)
      await checkRuntime.reviewSelected(
        inspection!
          .selectedCandidates()
          .filter((c) => c.category === 'local-interaction')
          .flatMap((c) => {
            const d = elementStore.getDetail(c.ref)
            return d.found ? [{ itemId: c.itemId, selector: d.element.selector }] : []
          }),
      )
  }
  try {
    guard()
    await updateRunStatus(runId, 'running')
    await inspection?.flush()
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
    guard()
    worker = await launchBrowser({ viewport: run.spec.viewport, uiScan: !!uiScan })
    guard()
    const page = worker.page
    let mutationFailed = false
    let deniedWrites = 0
    let businessCreated = false
    let networkWrites = 0
    /**
     * The side-effect policy of a *business* run.
     *
     * A UI run has no adapter, so it has no write permission to spend and no policy to consult: the
     * `null` is what makes that structural rather than a convention. Every reader below is on a
     * business-only path, which is why the whole block is guarded by the run kind (plan 3.1).
     */
    const sideEffectPolicy = businessRuntime
      ? createSideEffectPolicy({
          contract: businessRuntime.contract,
          adapter: businessRuntime.adapter,
          publicOrigin: runOrigin,
          currentFact: (id) => latestFactForOperation(businessFacts, id),
          ownsOperation: (id) => ownedOperations.has(id),
        })
      : null
    // Side-effect budget, reserved before dispatch. A create or retry counts when the request
    // leaves, not when its response arrives, so two immediate requests cannot both pass.
    const detachedResponses = new Set<import('playwright').Request>()
    const policyDenied = new Set<import('playwright').Request>()
    const pendingWrites = new Set<import('playwright').Request>()
    // Only the business boundary dispatches writes. UI's CDP read transport owns its
    // refusals; a browser POST event is not proof that a business write left the process.
    page.on('request', (request) => {
      if (businessRuntime && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
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
      // Fact decoding is the adapter's job, and a UI run has none: its responses are read by the
      // network session and the rules, never turned into business facts (plan 3.1).
      if (!businessRuntime || !businessContract) return
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
    networkBoundary = await installRunNetworkBoundary({
      uiScan,
      page,
      context: worker.context,
      entryUrl: run.spec.entryUrl,
      isFinished: () => finished || responsesClosed || mutationFailed,
      signal,
      sideEffectPolicy,
      businessRuntime,
      ownedOperations,
      businessFacts: () => businessFacts,
      recordIntervention,
      appendEvent: (type, payload, extra) => appendEvent(runId, type, payload, extra),
      denyWrite: (request) => {
        policyDenied.add(request)
        pendingWrites.delete(request)
      },
      allowWrite: (request, decision) => {
        // Record which operation this write addresses, taken from the adapter's own intent rather
        // than from the URL shape: the response handler uses it to decide whether the fact it
        // produces belongs to the action that dispatched this request.
        if (decision.intent.kind === 'retry') {
          writeOperations.set(request, decision.intent.operationPath)
          dispatchedOperations?.add(decision.intent.operationPath)
        } else if (decision.intent.kind === 'create') {
          // A create names no entity until its own response arrives, so the commit credits it.
          writeCreates.add(request)
        }
      },
      countDeniedWrite: () => {
        deniedWrites++
      },
      inspection,
      recordUnsupported: (dimension, reasonCode) =>
        inspection?.recordUnsupported(dimension, reasonCode),
    })
    await page.goto(run.spec.entryUrl, { waitUntil: 'domcontentloaded' })
    if (uiScan) await networkBoundary.flush?.()
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

    visualFocus = createVisualFocusRuntime({
      runId,
      goal: run.spec.goal,
      page,
      browser: worker.browser,
      signal,
      guard,
      snapshot: () => ({ ...latest!, observationId: `s${observeCount}`, refs: slimRefs }),
      refresh: () => observe(),
      detail: (ref) => {
        const detail = elementStore.getDetail(ref)
        if (!detail.found || !detail.fresh) throw Error('stale-element-ref')
        return detail.element
      },
      remainingActions: () => budget.maxActions - usage.actions,
      countAction: () => {
        usage.actions++
      },
      timeRemainingMs: () => budget.totalTimeoutMs - (Date.now() - startedAt),
      countModel,
      tracker: requestTracker,
      integrity: () => integrity.snapshot(),
      usage: (input, output) => {
        if (input === undefined || output === undefined) modelUsageAvailable = false
        else reportedModelCalls++
        usage.modelInputTokens += input ?? 0
        usage.modelOutputTokens += output ?? 0
      },
      hypothesis: (id, phenomenon) => {
        knownHypothesisIds.add(id)
        taskState.recordHypothesis(id, phenomenon, 'always')
      },
      resolved: (id, status) => taskState.resolveHypothesis(id, status),
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
        retryBudgetRemaining: () => {
          const fact = businessFacts.at(-1)
          return fact ? sideEffectPolicy?.retryBudgetRemaining(fact.operationId) : undefined
        },
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
              identity,
              version: version.reusable ? version.key : undefined,
            }
          } catch (error) {
            await handle.dispose()
            throw error
          }
        },
        record: async (input) => {
          const investigationTrigger =
            input.trigger === 'retryable-failure'
              ? retryTrigger(await getEvents(runId), latest!.snapshot.text)
              : undefined
          if (input.trigger === 'retryable-failure' && !investigationTrigger)
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
          if (investigationTrigger) investigationTriggers.set(h.id, investigationTrigger)
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
        complete: async (input, result, actual, bound) => {
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
          const trigger = investigationTriggers.get(result.hypothesisId)
          investigationTriggers.delete(result.hypothesisId)
          if (
            trigger &&
            findingId &&
            result.verdict === 'fail' &&
            result.validationStatus === 'supported' &&
            input.condition === 'element-actionable' &&
            bound.identity &&
            !!businessContract &&
            result.window.durationMs >= businessContract.retryAvailabilityMs &&
            result.window.observedUntilMs - result.window.startedAtMs >=
              businessContract.retryAvailabilityMs
          ) {
            // Retain the measured DOM node, never resolve its selector to a replacement node.
            // This handle belongs to completion review, not the ordinary observation cache.
            try {
              const fingerprint = JSON.stringify(bound.identity)
              const handle = await bound.handle.evaluateHandle((el) => el)
              investigationBlockers.push({
                handle,
                fingerprint,
                triggerRef: trigger.eventRef,
                result: { ...saved, operationId: trigger.operationId },
              })
            } catch {
              // Evidence remains saved; an unmeasurable current node cannot authorize review.
            }
          }
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
        feedbackWarningMs: businessContract?.feedbackWarningMs,
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
    if (uiScan?.checkPolicy && inspection)
      checkRuntime = createDefaultCheckRuntime({
        contract: uiScan,
        inspection,
        page: () => page,
        version: () => usage.actions,
        documentVersion: () => observationVersion?.key ?? 'unobserved',
        ruleSources: () =>
          getEnabledRules().flatMap((rule) => {
            const matches = inspection
              .snapshot()
              .items.filter(
                (i) =>
                  i.category === 'automatic-check' &&
                  i.selected &&
                  i.basis === `automatic rule ${rule.id} applies to the observed state`,
              )
            return matches.length
              ? [
                  {
                    ruleId: rule.id,
                    revision: rule.revision,
                    contentHash: checkHash({
                      id: rule.id,
                      revision: rule.revision,
                      name: rule.name,
                      description: rule.description,
                      declaration: rule.declaration,
                    }),
                    approvalRef: `installed-registry:${rule.id}:${rule.revision}`,
                    scopeItemIds: matches.map((i) => i.itemId),
                    evidenceRefs: [...new Set(matches.flatMap((i) => i.evidenceRefs))],
                  },
                ]
              : []
          }),
        clean: () => integrity.epoch() === 0,
        guard,
        rulesPending: async () =>
          (await pendingKnownRules()) +
          inspection
            .snapshot()
            .items.filter(
              (i) =>
                i.selected &&
                i.category === 'automatic-check' &&
                ['pending', 'unverified'].includes(i.status),
            ).length,
        observe: () => performObservation(false),
        save: (type, body) => saveEvidence(runId, type, body, evidenceMetadata(), guard),
        hashRefs: async (refs) => {
          const out: Record<string, string> = {}
          for (const ref of refs) {
            const r = await getDbClient().execute({
              sql: 'SELECT file_path FROM artifacts WHERE id=? AND run_id=?',
              args: [ref, runId],
            })
            if (r.rows.length !== 1) throw Error('v2-evidence-not-owned')
            out[ref] = createHash('sha256')
              .update(await readFile(String(r.rows[0]!.file_path)))
              .digest('hex')
          }
          return out
        },
        emit: (type, payload, refs = [], actionId) =>
          appendEvent(runId, type, payload, { evidenceRefs: refs, actionId }),
        publishFailure: async (requirement, original, measurementRef, measurement, refs) => {
          const finding = await submitFinding(
            {
              runId,
              source: 'agent',
              ruleId: null,
              ruleRevision: null,
              hypothesisId: null,
              validationStatus: 'supported',
              severity: 'warning',
              title: 'Measured independent public requirement violated',
              expected: requirement.sourceText,
              actual: JSON.stringify(measurement),
              stepId: null,
              evidenceRefs: refs,
            },
            guard,
          )
          await appendEvent(
            runId,
            'finding:submitted',
            {
              findingId: finding.id,
              requirementId: requirement.requirementId,
              itemId: original.itemId,
              actionId: original.actionId,
              contract: 'default-check-contract-2',
            },
            { evidenceRefs: refs, actionId: original.actionId },
          )
          return finding.id
        },
      })
    if (checkRuntime && inspection && latestSlim)
      await checkRuntime.reviewSelected(
        inspection
          .selectedCandidates()
          .filter((c) => c.category === 'local-interaction')
          .flatMap((c) => {
            const d = elementStore.getDetail(c.ref)
            return d.found ? [{ itemId: c.itemId, selector: d.element.selector }] : []
          }),
      )
    // Both approved rules and autonomous investigations can measure the same current blocker.
    // Require the original trigger, operation and DOM node; the reviewer still judges alternatives.
    const measuredRetryBlocker = async () => {
      const trigger = retryTrigger(await getEvents(runId), latest?.snapshot.text ?? '')
      if (!trigger) return undefined
      const learned = boundCache.filter((cached) => {
        const rule = getEnabledRules().find((r) => r.id === cached.result.ruleId)
        return (
          cached.lastValue === false &&
          rule?.declaration?.trigger.eventType === 'retryable-failure' &&
          rule.declaration.expectation.condition === 'element-actionable'
        )
      })
      for (const cached of [...learned, ...investigationBlockers]) {
        const result = cached.result
        if (
          cached.triggerRef !== trigger.eventRef ||
          result.operationId !== trigger.operationId ||
          result.verdict !== 'fail' ||
          !result.findingId
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
      if (checkRuntime) preparedV2 = null
      const invalid = actionInputValidationError(input, { allowRefOnly: !!inspection })
      if (invalid) return invalid
      if (phaseTracker.phase === 'finalizing')
        return {
          error: 'page_act blocked: system is in finalizing phase. Call run_finish instead.',
          action: input,
        }
      if (sideEffectPending) throw new Error('reconciliation-required')
      if (usage.actions >= budget.maxActions) throw new Error('budget-exhausted')
      // Lift business read-only protection only after the complete input contract is valid.
      sideEffectPolicy?.setReadOnly(false)
      stepId = `action-${usage.actions + 1}`
      await observe(true)
      let resolvedLocator: import('playwright').Locator | undefined
      let targetDesc = ''
      /**
       * The ref the action acts at, and the snapshot it was resolved against.
       *
       * A model that names an element ref is naming a target of one particular observation; keeping
       * that pair is what lets the ledger resolve the item it actually offered, instead of whatever
       * item happens to answer to that ref after the browser has moved.
       */
      let actingRef = input.ref ?? ''
      /** The snapshot that offered this ref, so the ledger entry names the observation it came from. */
      let actionSnapshotPage = latestSlim?.snapshotId ?? ''
      const beforeUrl = page.url()
      if (input.ref) {
        const owning = [...snapshotRefs.entries()].find(([, refs]) => refs.includes(input.ref!))
        if (owning) actionSnapshotPage = owning[0]
      }
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
      if (inspection && input.ref) {
        const binding = candidateBindings.get(input.ref)
        const detail = elementStore.getDetail(input.ref)
        if (
          !binding ||
          !detail.found ||
          !(await binding.evaluate((node) => node.isConnected).catch(() => false))
        )
          throw Error('target-lost: observed ref is no longer connected')
        resolvedLocator ??= page.locator(detail.element.selector)
        const actual = await resolvedLocator.elementHandle()
        if (!actual || !(await binding.evaluate((node, other) => node === other, actual)))
          throw Error('target-mismatch: ref does not identify this action')
        targetDesc ||= detail.element.selector
      }
      if (inspection && resolvedLocator && !actingRef) {
        const actual = await resolvedLocator.elementHandle()
        for (const candidate of [
          ...inspection.selectedCandidates(),
          ...inspection.candidateItems(),
        ]) {
          const binding = candidateBindings.get(candidate.ref)
          if (
            actual &&
            binding &&
            (await binding
              .evaluate((node, other) => node.isConnected && node === other, actual)
              .catch(() => false))
          ) {
            actingRef = candidate.ref
            actionSnapshotPage = candidate.snapshotId
            break
          }
        }
      }
      if (inspection && explicitScope) {
        const selectionError = inspection.assertSamplingSelectionReady()
        if (selectionError)
          return {
            error: true,
            message: selectionError,
            validationErrors: { errors: [selectionError] },
            dispatched: false,
          }
        const requiredError = inspection.requiredActionError(actingRef, actionSnapshotPage, input)
        if (requiredError)
          return {
            error: true,
            message: requiredError,
            validationErrors: { errors: [requiredError] },
            dispatched: false,
          }
        const category =
          resolvedLocator &&
          (await resolvedLocator.evaluate((node) => node instanceof HTMLAnchorElement))
            ? 'navigation'
            : 'local-interaction'
        const returningForRequired =
          input.type === 'navigate' &&
          input.url === uiScan!.entryUrl &&
          inspection
            .requiredChecks()
            .some(
              (r) =>
                !r.boundItemId &&
                inspection
                  .snapshot()
                  .items.some((i) => i.itemId === r.itemId && i.status === 'pending'),
            )
        if (
          !returningForRequired &&
          !inspection.isRequiredTarget(actingRef, actionSnapshotPage, category)
        )
          return refuseOptionalScope(input.url ?? actingRef ?? input.type)
      }
      if (uiScan && resolvedLocator && input.type !== 'probe') {
        const refusal = await uiActionRefusal(resolvedLocator, input.type)
        if (refusal) {
          await appendEvent(runId, 'action:denied', {
            type: input.type,
            target: targetDesc,
            reasonCode: refusal,
          })
          await inspection?.recordGap({
            reasonCode: refusal,
            detail: `Skipped ${targetDesc}: ${refusal}`,
          })
          return { error: refusal, status: 'denied', inspection: inspectionSummary() }
        }
      }
      guard()
      if (
        uiScan &&
        input.verify &&
        (input.type === 'navigate' ||
          (resolvedLocator &&
            (await resolvedLocator.evaluate((node) => node instanceof HTMLAnchorElement))))
      )
        throw Error(
          'navigation-verification-is-separate: no action dispatched. Omit verify for navigation; the executor verifies the actual link and destination. Inspect the destination after arriving before composing a separate content check grounded in known requirements. Never infer exact destination text from a link label.',
        )
      if (inspection) {
        const destination =
          input.type === 'navigate' && input.url && URL.canParse(input.url, page.url())
            ? new URL(input.url, page.url()).href
            : input.type === 'click' && resolvedLocator
              ? await resolvedLocator.evaluate((node) =>
                  node instanceof HTMLAnchorElement ? node.href : null,
                )
              : null
        if (destination) inspection.assertMayNavigate(destination)
      }
      if (inspection && input.type === 'navigate' && input.url) {
        const destination = URL.canParse(input.url, page.url())
          ? new URL(input.url, page.url()).href
          : null
        for (const candidate of inspection.selectedCandidates()) {
          if (candidate.category !== 'navigation') continue
          const binding = candidateBindings.get(candidate.ref)
          const href = await binding
            ?.evaluate((node) =>
              node.isConnected && node instanceof HTMLAnchorElement ? node.href : null,
            )
            .catch(() => null)
          if (destination !== null && href === destination)
            throw Error(
              `selected-navigation-requires-click: no navigation dispatched. A selected link is still pending; use page_act click with its current observed ref to test the link itself. Direct URL navigation cannot verify that link.`,
            )
        }
      }
      if (inspection)
        inspection.assertActionSelectable(
          actingRef,
          actionSnapshotPage,
          ['click', 'fill', 'probe'].includes(input.type) &&
            !!resolvedLocator &&
            !(await resolvedLocator.evaluate((node) => node instanceof HTMLAnchorElement)),
        )
      const probeCandidate =
        uiScan && input.type === 'probe'
          ? [...inspection!.selectedCandidates(), ...inspection!.candidateItems()].find(
              (c) =>
                c.ref === actingRef &&
                c.snapshotId === actionSnapshotPage &&
                c.category === 'local-interaction',
            )
          : undefined
      if (uiScan && input.type === 'probe' && (!probeCandidate || input.verify))
        throw Error('probe-requires-observed-local-target-without-postcondition')
      if (uiScan && input.verify) await assertInteractionExpectation(page, input.verify)
      if (
        uiScan &&
        !checkRuntime &&
        !programActionItems &&
        !input.verify &&
        ['click', 'fill'].includes(input.type) &&
        resolvedLocator
      ) {
        const isLink =
          input.type === 'click' &&
          (await resolvedLocator.evaluate(
            (node) => node instanceof HTMLAnchorElement && !!node.getAttribute('href'),
          ))
        if (!isLink)
          throw Error(
            'postcondition-required: no action dispatched. Declare page_act.verify from public facts, or compose an investigation_run with explicit post-action measurement. Read current DOM before choosing the result selector.',
          )
      }
      const boundCandidate =
        inspection &&
        [...inspection.selectedCandidates(), ...inspection.candidateItems()].find(
          (c) => c.ref === actingRef && c.snapshotId === actionSnapshotPage,
        )
      if (!checkRuntime && boundCandidate && ['click', 'fill'].includes(input.type))
        interactionExploration.assertNotRepeated(boundCandidate.itemId)
      if (
        checkRuntime &&
        ['click', 'fill'].includes(input.type) &&
        boundCandidate?.category === 'local-interaction'
      ) {
        const detail = elementStore.getDetail(actingRef)
        if (!detail.found) throw Error('v2-target-not-observed')
        preparedV2 = await checkRuntime.prepare(
          boundCandidate.itemId,
          detail.element.selector,
          input,
        )
      } else if (
        checkRuntime &&
        input.type === 'click' &&
        resolvedLocator &&
        !(await resolvedLocator.evaluate((n) => n instanceof HTMLAnchorElement))
      )
        throw Error('v2-original-selected-control-required')
      let explorationSource:
        | { before: Awaited<ReturnType<typeof interactionExploration.capture>>; itemId: string }
        | undefined
      if (programExploration && !checkRuntime) {
        const item =
          boundCandidate &&
          inspection!.scope.snapshot().items.find((i) => i.itemId === boundCandidate.itemId)
        if (
          !uiScan ||
          input.type !== 'click' ||
          boundCandidate?.category !== 'local-interaction' ||
          !item?.selected ||
          item.status !== 'pending'
        )
          throw Error('exploration-requires-original-selected-pending-local-control')
        explorationSource = {
          itemId: item.itemId,
          before: await interactionExploration.capture(
            run.spec.goal,
            programExploration.expectedEffect,
          ),
        }
      }
      if (checkRuntime && preparedV2 && boundCandidate) {
        const binding = candidateBindings.get(actingRef)
        if (
          !binding ||
          !(await binding.evaluate(
            (n, selector) => n.isConnected && document.querySelector(selector) === n,
            preparedV2.sourceSelector,
          ))
        )
          throw Error('v2-source-control-replaced-before-dispatch')
      }
      const actionId = randomUUID()
      let dispatchTime = Date.now()
      const beforeText = await page.locator('body').innerText()
      // What the page looked like before this action, so the ledger entry can cite the change rather
      // than only the state afterwards.
      const beforeRefs = [...(latest?.evidenceRefs ?? [])]
      let ourNavigation = false
      if (input.type === 'navigate' && input.url) {
        const decision = uiScan
          ? (networkBoundary?.navigation?.check(input.url, beforeUrl) ??
            decideUiNavigation({
              entryUrl: uiScan.entryUrl,
              maxPages: uiScan.scope.maxPages,
              maxDepth: uiScan.scope.maxDepth,
              visited: visitedPages,
              url: input.url,
              fromUrl: beforeUrl,
            }))
          : { allow: true as const, normalized: input.url }
        await appendEvent(runId, 'navigation:requested', {
          url: input.url,
          from: beforeUrl,
          policyRevision: 'url-scan-navigation-1',
          normalized: decision.allow ? decision.normalized : null,
        })
        if (!decision.allow) {
          await appendEvent(runId, 'navigation:denied', {
            url: input.url,
            reasonCode: decision.reasonCode,
            policyRevision: 'url-scan-navigation-1',
          })
          await inspection?.recordNavigationDenied({
            url: input.url,
            reasonCode: decision.reasonCode,
          })
          throw new Error(`navigation denied: ${decision.reasonCode}`)
        }
        ourNavigation = true
        targetDesc = `navigate:${decision.normalized}`
      }
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
        {
          type: input.type,
          target: targetDesc,
          dispatchTime,
          ...(input.verify ? { verification: input.verify } : {}),
        },
        { stepId, actionId, evidenceRefs: latest!.evidenceRefs },
      )
      // The action is now on the record and in flight; everything the browser reports from here is
      // gathered into it and turned into scope by `settleActionLedger`.
      activeAction = {
        actionId,
        type: input.type,
        ref: actingRef,
        target: targetDesc,
        beforeUrl,
        beforeRefs,
        snapshotPage: actionSnapshotPage,
        navigated: ourNavigation,
        landedUrls: [],
        settled: false,
        ...(input.verify ? { verify: input.verify } : {}),
        ...(explorationSource ? { exploration: explorationSource } : {}),
      }
      if (inspection) {
        // The address an in-page move lands on. A same-document hash change is part of the action
        // itself, and it is the one way a page can move without a request; capturing it keeps an
        // inspected panel from being attributed to the document's original state.
        const onFrameNavigated = (frame: import('playwright').Frame) => {
          if (frame !== page.mainFrame() || !activeAction) return
          const url = frame.url()
          if (!activeAction.landedUrls.includes(url))
            activeAction.landedUrls = [...activeAction.landedUrls, url]
          // The action has reached its destination, so its ledger entry may be written now - before
          // the post-action observation, which must probe the page the action actually produced.
          activeAction.navigated ||= url !== activeAction.beforeUrl
        }
        page.on('framenavigated', onFrameNavigated)
        actionNavigationListener = onFrameNavigated as (frame: unknown) => void
      }
      try {
        guard()
        if (uiScan && input.type === 'probe') {
          if (!resolvedLocator || !probeCandidate) throw Error('probe-target-missing')
          const measured = await measureUiProbe(
            resolvedLocator,
            { handle: candidateBindings.get(actingRef), url: beforeUrl },
            guard,
            Math.min(3000, config.budget.toolTimeoutMs / 3),
          )
          guard()
          const screenshotBytes = await page.screenshot({ timeout: 3000 })
          const screenshot = await saveEvidence(
            runId,
            'screenshot',
            screenshotBytes,
            evidenceMetadata(),
            guard,
          )
          const receipt = {
            ...measured,
            runId,
            actionId,
            itemId: probeCandidate.itemId,
            target: targetDesc,
            ref: actingRef,
            sourceSnapshot: actionSnapshotPage,
            evidenceRefs: [screenshot],
            evidenceHashes: {
              [screenshot]: createHash('sha256').update(screenshotBytes).digest('hex'),
            },
          }
          const raw = JSON.stringify(receipt)
          const receiptRef = await saveEvidence(
            runId,
            'probe-measurement',
            raw,
            evidenceMetadata(),
            guard,
          )
          await appendEvent(
            runId,
            'probe:measured',
            { ...receipt, receiptRef, sha256: createHash('sha256').update(raw).digest('hex') },
            { actionId, stepId, evidenceRefs: [receiptRef, screenshot] },
          )
          activeAction!.probe = {
            outcome: measured.outcome,
            itemId: probeCandidate.itemId,
            receiptRef,
            evidenceRefs: [receiptRef, screenshot],
          }
          measurementFacts.add(
            JSON.stringify(['probe', measured.url, targetDesc, measured.outcome, measured.after]),
          )
        } else if (input.type === 'click' || input.type === 'probe') {
          if (!resolvedLocator)
            throw new Error('target required: provide role+name, selector, or visualDescription')
          await resolvedLocator.click({
            trial: true,
            timeout: Math.min(3000, config.budget.toolTimeoutMs / 3),
          })
          guard()
          if (input.type === 'click') {
            sideEffectPending = !!businessRuntime
            dispatchTime = Date.now()
            await resolvedLocator.click()
          }
        } else if (input.type === 'fill') {
          if (!resolvedLocator) throw new Error('target required')
          if (uiScan && (await resolvedLocator.evaluate((element) => element.tagName === 'SELECT')))
            await resolvedLocator.selectOption(input.value!)
          else await resolvedLocator.fill(input.value!)
        } else if (input.type === 'navigate') {
          if (!input.url) throw new Error('navigation denied: a destination is required')
          // A UI run's destination was already judged by its own navigation scope before this point,
          // against the entry origin, the page budget and the depth limit. The legacy business rule
          // ("only the entry path") is not applied here: it would refuse every in-scope sub-page the
          // contract was created to allow.
          if (!uiScan && !isAllowedNavigationUrl(input.url, run!.spec.entryUrl))
            throw new Error('navigation denied')
          await page.goto(input.url, { waitUntil: 'domcontentloaded' })
        } else await page.mouse.wheel(0, input.scrollY!)
        const responseDeadline = Date.now() + config.budget.toolTimeoutMs
        while (pendingWrites.size) {
          guard()
          if (Date.now() > responseDeadline) throw new Error('reconciliation-required')
          await new Promise((r) => setTimeout(r, 50))
        }
        await drainResponses()
        if (uiScan) await networkBoundary?.flush?.()
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
        // A navigation this action performed is committed with the URL the run actually landed on. The
        // address is re-judged rather than assumed: a same-origin redirect may legitimately end
        // somewhere other than the requested path, and what must be true is that wherever the run *is*
        // lies inside its contract - the entry origin, the page budget and the depth limit. A
        // cross-origin redirect never gets this far; the network boundary refuses the hop and the
        // browser reports the navigation failed.
        if (ourNavigation && input.url) {
          const landed = page.url()
          const approved = uiScan
            ? (networkBoundary?.navigation?.check(landed) ??
              decideUiNavigation({
                entryUrl: uiScan.entryUrl,
                maxPages: uiScan.scope.maxPages,
                maxDepth: uiScan.scope.maxDepth,
                visited: visitedPages,
                url: landed,
              }))
            : { allow: true as const, normalized: landed }
          if (!approved.allow) {
            await appendEvent(runId, 'navigation:denied', {
              url: landed,
              reasonCode: approved.reasonCode,
              requested: input.url,
              policyRevision: 'url-scan-navigation-1',
            })
            throw new Error(`navigation denied: ${approved.reasonCode}`)
          }
          if (!visitedPages.some((v) => normalizePageUrl(v) === normalizePageUrl(landed)))
            visitedPages.push(landed)
          await appendEvent(runId, 'navigation:committed', {
            url: landed,
            normalized: approved.normalized,
            requested: input.url,
            from: beforeUrl,
            visited: visitedPages.length,
            policyRevision: 'url-scan-navigation-1',
          })
        }
      } catch (error) {
        // A failed action is still an action: the attempt is on the record, so it is settled before
        // the error is returned rather than being lost with the exception.
        if (activeAction) activeAction.actionError = String(error)
        if (actionNavigationListener) {
          page.off('framenavigated', actionNavigationListener as never)
          actionNavigationListener = null
        }
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
        if (uiScan) {
          // A dispatched action failing is an execution failure, even when a policy
          // intervention also exists. Never let the next loop turn turn it into partial.
          active.abortController.abort(new Error('ui-action-execution-error'))
          throw error
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
          ...(inspection ? { verification: uiActionReceipt(actionId) } : {}),
          elements: referenceIndex(),
          url: latest!.snapshot.url,
          a11yTree: latestA11y!,
          pageText: latest!.snapshot.text.replace(/\s+/g, ' ').slice(0, 500),
          evidenceRefs: latest!.evidenceRefs,
        }
      }
      staleDetector.recordAction()
      if (actionNavigationListener) {
        page.off('framenavigated', actionNavigationListener as never)
        actionNavigationListener = null
      }
      await persistUsage()
      const probeMeasurement = activeAction?.probe
      await observe()
      return {
        action: input,
        status: 'completed',
        ...(probeMeasurement ? { probeMeasurement, effectTested: false } : {}),
        ...(inspection ? { verification: uiActionReceipt(actionId) } : {}),
        inspection: inspectionSummary(),
        recoverableInteractions: interactionRecovery.available(),
        elements: referenceIndex(),
        url: latest!.snapshot.url,
        a11yTree: latestA11y!,
        pageText: latest!.snapshot.text.replace(/\s+/g, ' ').slice(0, 500),
        evidenceRefs: latest!.evidenceRefs,
      }
    }
    // Reuse is scoped to this run's own contract identity, so a segment evidenced under a
    // different profile, revision, adapter or origin is never replayed here.
    const journeys =
      config.features?.journeys && businessContract
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
          // A UI run always uses the short protocol, even when the legacy business switch is off:
          // its finish is a claim about the inspection, and it has no business outcome to name. That
          // is also what makes a UI run structurally unable to pass `businessResult=success`.
          const parsed =
            uiScan || config.features?.shortFinish
              ? shortFinishInput.parse(request)
              : legacyFinishInput.parse(request)
          await appendEvent(runId, 'finish:requested', parsed)
          await observe()
          // Every network receipt is written before the claim that reads them, so a refusal cannot
          // land after the decision it should have changed.
          if (uiScan) await networkBoundary?.flush?.()
          else await networkBoundary?.settle()
          if (uiScan && inspection) return finishUiScan(parsed as { reason: string })
          const pendingRules = await pendingKnownRules()
          const gaps = [
            ...completionGaps(),
            ...(pendingRules
              ? [`known-rules:${pendingRules} applicable checks pending; use rules_search`]
              : []),
          ]
          if (review) {
            const currentVersion = await readCompletionVersion(page)
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
    /**
     * The finish decision of a `ui-scan` run (plan 6.2).
     *
     * The agent names a reason; the facts decide whether it is true. Every fact here comes from the
     * ledger, the run's own integrity epoch and the pending-rule count rather than from the request,
     * so a run cannot assemble a favourable case for its own completion. A refusal keeps its usable
     * partial suggestion: a run that may not claim coverage is not left with no way to end.
     */
    async function uiCompletionDecision(reason: string) {
      const facts = inspection!.completionFacts()
      return decideInspectionCompletion({
        reason: reason as Parameters<typeof decideInspectionCompletion>[0]['reason'],
        facts: {
          kind: 'ui-scan',
          featureEnabled: !!config.features?.urlScan,
          spec: run!.spec,
          contractValid:
            !!uiScan &&
            verifyUiContractSnapshot(uiScan) &&
            inspection!.requiredRegistrationComplete(),
          contractHash: uiScan!.hash,
          entryObserved: facts.entryObserved,
          entryEvidenceRefs: facts.entryEvidenceRefs,
          integrityEpoch: integrity.epoch(),
          scope: inspection!.scope,
          scopeEventIds: facts.scopeEventIds,
          pendingRules: await pendingKnownRules(),
          openHypotheses: taskState.hasOpenHypotheses() ? 1 : 0,
          unsupportedRecorded: facts.unsupportedRecorded,
          blockerEvidence: await uiBlockerEvidence(),
        },
      })
    }
    closeCoveredUiScope = async () => {
      if (
        !explicitScope ||
        !inspection ||
        finished ||
        closing ||
        activeAction ||
        programActionItems ||
        sideEffectPending ||
        pendingWrites.size ||
        mutationFailed ||
        integrity.epoch() !== 0
      )
        return false
      guard()
      await networkBoundary?.flush?.()
      await drainResponses()
      guard()
      if (integrity.epoch() !== 0) return false
      const decision = await uiCompletionDecision('scope-covered')
      if (!decision.accepted) return false
      closing = true // Serialize the fence before seal/recheck; queued extensions never run.
      await appendEvent(runId, 'scope:closing', {
        reason: 'required-scope-covered',
        source: 'same-completion-function',
        notChecked: inspection
          .snapshot()
          .items.filter((i) => !i.selected && ['pending', 'unverified'].includes(i.status))
          .map((i) => ({ itemId: i.itemId, basis: i.basis })),
      })
      const completion = await finishUiScan({ reason: 'scope-covered' })
      if (!completion.accepted) throw Error('ui-finalization-facts-changed')
      return true
    }
    async function finishUiScan(parsed: { reason: string }) {
      guard()
      await networkBoundary?.flush?.()
      await drainResponses()
      guard()
      if (sideEffectPending || pendingWrites.size || mutationFailed)
        throw new Error('reconciliation-required')
      const decide = () => uiCompletionDecision(parsed.reason)
      let decision = await decide()
      if (!decision.accepted) {
        const reply = {
          accepted: false,
          error: decision.reasonCode,
          missingFacts: decision.missingFacts ?? [],
          missingItems: decision.missingItems ?? [],
          partialAdvice: decision.partialAdvice ?? null,
          inspection: inspection!.snapshot(),
        }
        await appendEvent(runId, 'finish:rejected', reply)
        return reply
      }
      // Only an admissible finish closes the read session. Drain the shutdown receipts and
      // re-evaluate the same facts: a concurrent failure or cancellation cannot be hidden.
      await networkBoundary?.seal?.()
      await drainResponses()
      guard()
      decision = await decide()
      if (!decision.accepted) throw Error('ui-finalization-facts-changed')
      const facts = inspection!.completionFacts()
      // Preserve the exact persisted ledger used by the proof, including pending gaps.
      const transition = phaseTracker.enterFinalizing('agent-ready')
      if (transition.changed)
        await appendEvent(runId, 'run:phase-changed', {
          from: transition.previous,
          to: transition.current,
          reason: transition.reason,
        })
      guard()
      finished = true
      stopReason = decision.outcome === 'goal-reached' ? 'goal-reached' : 'blocked'
      await appendEvent(runId, 'finish:accepted', {
        reasonCode: decision.reasonCode,
        kind: 'ui-scan',
        businessResult: 'not-applicable',
        contractHash: uiScan!.hash,
        inspectionProof: decision.proof,
        scopeDigest: decision.proof?.scopeDigest,
        task: taskState.snapshot(),
      })
      await appendEvent(runId, 'inspection:summary', {
        kind: 'ui-scan',
        coverage:
          decision.outcome === 'goal-reached'
            ? 'covered'
            : inspection!.snapshot().counts.total > 0
              ? 'partial'
              : 'not-started',
        counts: inspection!.snapshot().counts,
        unsupported: facts.unsupportedRecorded,
      })
      await appendEvent(
        runId,
        'agent:done',
        { reasonCode: decision.reasonCode, businessResult: 'not-applicable' },
        { stepId, evidenceRefs: [...facts.entryEvidenceRefs] },
      )
      guard()
      return { accepted: true, reasonCode: decision.reasonCode, proof: decision.proof }
    }
    /**
     * Measured facts that can substantiate a blocker.
     *
     * Only durable policy refusals / unsupported channels qualify. Allowed requests,
     * execution errors and model descriptions cannot substantiate this reason.
     */
    async function uiBlockerEvidence() {
      return collectUiBlockers(runId, await getEvents(runId))
    }
    async function recoverInteraction(checkRef: string) {
      if (!inspection || !uiScan) return { error: 'ui-recovery-unavailable' }
      try {
        return await interactionRecovery.run(checkRef, async (check, assertCurrent) => {
          const item = inspection!.scope.snapshot().items.find((i) => i.itemId === check.itemId)
          if (!item || item.status !== 'unverified' || item.category !== 'local-interaction')
            throw Error('recovery-item-not-unverified')
          await observe()
          await assertCurrent()
          const observationRefs = [...latest!.evidenceRefs]
          const measurement = await measureInteraction(page, check.input, async () => [
            await saveEvidence(
              runId,
              'screenshot',
              await page.screenshot({ timeout: 3000 }),
              evidenceMetadata(),
              guard,
            ),
          ])
          await assertCurrent()
          const body = {
            ...measurement,
            checkRef,
            actionId: check.actionId,
            itemId: check.itemId,
            sourceHash: recoveryDigest(check),
            observationRefs,
          }
          const receiptRef = await saveEvidence(
            runId,
            'interaction-measurement',
            JSON.stringify(body),
            evidenceMetadata(),
            guard,
          )
          const refs = [
            ...new Set([
              ...Object.keys(check.evidenceHashes),
              ...observationRefs,
              ...measurement.evidenceRefs,
              receiptRef,
            ]),
          ]
          const event = await appendEvent(
            runId,
            'interaction:recovered',
            { ...body, receiptRef, receiptHash: recoveryDigest(body) },
            { actionId: check.actionId, evidenceRefs: refs },
          )
          await assertCurrent()
          inspection!.scope.resolveItem(check.itemId, {
            status: measurement.outcome,
            reasonCode: 'interaction-recovery-measured',
            evidenceRefs: refs,
            eventIds: [event.id],
            detail: `Original action ${check.actionId}; frozen expectation: ${check.input.basis}`,
          })
          await inspection!.settleRequired(check.itemId)
          await inspection!.flush()
          if (measurement.outcome === 'failed')
            await publishInteractionFinding({
              runId,
              actionId: check.actionId,
              itemId: check.itemId,
              receiptRef,
              evidenceRefs: refs,
              measurement,
              metadata: evidenceMetadata(),
              guard,
            })
          return { ...body, evidenceRefs: refs }
        })
      } catch (error) {
        guard()
        await appendEvent(runId, 'interaction:recovery-rejected', {
          checkRef,
          reason: String(error),
        })
        return { error: String(error), outcome: 'unverified' as const }
      }
    }
    async function verifyExploration(checkRef: string, selector?: string) {
      if (!inspection || !uiScan) return { error: 'ui-exploration-unavailable' }
      try {
        return await interactionExploration.run(
          checkRef,
          selector,
          async (check, input, assertCurrent) => {
            const item = inspection!.scope.snapshot().items.find((i) => i.itemId === check.itemId)
            if (
              !item?.selected ||
              item.status !== 'pending' ||
              item.category !== 'local-interaction'
            )
              throw Error('exploration-original-item-not-pending')
            await assertCurrent()
            const measurement = await measureInteraction(page, input, async () => [
              await saveEvidence(
                runId,
                'screenshot',
                await page.screenshot({ timeout: 3000 }),
                evidenceMetadata(),
                guard,
              ),
            ])
            await assertCurrent()
            const body = {
              ...measurement,
              checkRef,
              actionId: check.actionId,
              itemId: check.itemId,
              sourceHash: recoveryDigest(check),
              sourceGoalHash: check.goalHash,
            }
            const receiptRef = await saveEvidence(
              runId,
              'interaction-measurement',
              JSON.stringify(body),
              evidenceMetadata(),
              guard,
            )
            const refs = [
              ...new Set([
                ...Object.keys(check.evidenceHashes),
                ...measurement.evidenceRefs,
                receiptRef,
              ]),
            ]
            const event = await appendEvent(
              runId,
              'interaction:exploration-measured',
              { ...body, receiptRef },
              { actionId: check.actionId, evidenceRefs: refs },
            )
            await assertCurrent()
            const update = {
              reasonCode: 'original-exploration-effect-measured',
              evidenceRefs: refs,
              eventIds: [event.id],
              detail: `Original action ${check.actionId}; expectation frozen before operation: ${input.basis}`,
            }
            if (measurement.outcome === 'unverified')
              inspection!.scope.appendPendingEvidence(check.itemId, update)
            else
              inspection!.scope.resolveItem(check.itemId, {
                ...update,
                status: measurement.outcome,
              })
            await inspection!.settleRequired(check.itemId)
            await inspection!.flush()
            if (measurement.outcome === 'failed')
              await publishInteractionFinding({
                runId,
                actionId: check.actionId,
                itemId: check.itemId,
                receiptRef,
                evidenceRefs: refs,
                measurement,
                metadata: evidenceMetadata(),
                guard,
              })
            return { ...body, evidenceRefs: refs }
          },
        )
      } catch (error) {
        guard()
        await appendEvent(runId, 'interaction:exploration-rejected', {
          checkRef,
          reason: String(error),
        })
        return { error: String(error), outcome: 'unverified' as const }
      }
    }
    const tools = {
      ...(uiScan
        ? {
            interaction_verify: createTool({
              id: 'interaction.verify',
              description: checkRuntime
                ? 'Read-only v2 verification. purpose collect-interaction rechecks the original generic receipt with NO selector/expectation. purpose verify-effect uses original checkRef plus registered requirementId and actually inspected result selector. Both share two attempts; no action replay, changed source, other action or late requirement can discharge it.'
                : 'Read-only verification of an original UI action. Fixed recovery uses checkRef from recoverableInteractions and forbids changing its selector/expectation. Evidence collection uses checkRef from exploratoryInteractions plus a selector actually read by page_inspect after that action; only the independently frozen original-goal expectation can be evaluated. Unknown expectations remain pending. Never repeat the action or use another action’s evidence. Use checkRef from recoverableInteractions for fixed recovery. Reads and explicitly binds current result nodes; never repeats the action, changes its target or expected result. At most two attempts, same document, no intervening action, clean original evidence required. Old unknown evidence remains recorded.',
              inputSchema: z
                .object({
                  checkRef: z.string().uuid(),
                  purpose: z.enum(['collect-interaction', 'verify-effect']).optional(),
                  requirementId: z.string().max(80).optional(),
                  selector: z
                    .string()
                    .min(1)
                    .max(500)
                    .nullish()
                    .transform((v) => v ?? undefined)
                    .optional(),
                })
                .strict(),
              execute: ({ checkRef, selector, purpose, requirementId }) =>
                serial('interaction_verify', async () => {
                  if (checkRuntime?.owns(checkRef)) {
                    try {
                      return await checkRuntime.recover(
                        checkRef,
                        purpose ?? 'verify-effect',
                        requirementId,
                        selector,
                      )
                    } catch (error) {
                      return { error: String(error), outcome: 'unverified' }
                    }
                  }
                  if (purpose || requirementId)
                    return { error: 'v2-purpose-requires-v2-original-action' }
                  if (interactionExploration.owns(checkRef))
                    return await verifyExploration(checkRef, selector)
                  if (selector)
                    return { error: 'fixed-recovery-expectation-cannot-change-selector' }
                  return await recoverInteraction(checkRef)
                }),
            }),
          }
        : {}),
      page_inspect: createTool({
        id: 'page.inspect',
        description:
          'Read up to 24 public DOM elements (including noninteractive feedback), text, CSS selectors, rectangular bounds, viewport/ancestor clipping fractions and sampled hit fraction. Read-only, no scrolling. selector is CSS; offset paginates. No issue classification. Missing geometry or unsupported surfaces remain unknown. Use these facts to compose investigation_run.',
        inputSchema: inspectInput,
        execute: (input) =>
          serial('page_inspect', async () => {
            const result = await inspectElements(page, input.selector, input.offset)
            guard()
            for (const element of result.elements)
              measurementFacts.add(
                JSON.stringify({ source: 'dom-inspection', url: page.url(), ...element }),
              )
            const ref = await saveEvidence(
              runId,
              'snapshot',
              JSON.stringify(result),
              evidenceMetadata(),
              guard,
            )
            await interactionExploration.noteInspected(
              result.elements.map((e) => ({ selector: e.selector, text: e.text })),
            )
            await checkRuntime?.noteInspected(
              result.elements.map((e) => ({ selector: e.selector, text: e.text })),
              ref,
            )
            return { ...result, evidenceRefs: [ref] }
          }),
      }),
      investigation_run: createTool({
        id: 'investigation.run',
        description: checkRuntime
          ? 'Execute a bounded UI program through the original executor. exploration:{} is one permitted selected click and assertions:[] for generic evidence collection. Registered source requirements are enforced regardless of tool or requirementIds omission; naked expectedEffect is refused. Other comparisons are saved observations, not authority to publish a functional finding or clear an effect. Same action/time budgets.'
          : 'Execute an Agent-authored bounded version 1 investigation program. Declare CSS targets, measure/wait/act steps and comparisons of measured metrics. At most THREE actions and 4000ms total wait; bind_results must follow the FINAL action, then measure. Split separate action/result phases into separate bounded programs. Acts use the normal business action policy and budget; do not repeat a write. Saves program, screenshots, measurements and a bounded comparison finding automatically. Unsupported/ambiguous/replaced targets or intervention yield unknown. No arbitrary JS, no automatic global rule approval. See schema for composition; expectation applicability remains Agent-declared.',
        inputSchema: programInput,
        execute: (input) =>
          serial('investigation_run', async () => {
            if (uiScan) assertUiProgramBindings(input)
            if (checkRuntime && input.exploration?.expectedEffect)
              throw Error('v2-use-registered-requirement-not-bare-expectedEffect')
            if (input.exploration && !uiScan) throw Error('exploration-is-ui-only')
            programActionItems = []
            programExploration = input.exploration ?? null
            const priorResults = new Map<string, Awaited<ReturnType<typeof measureElement>>>()
            let result: Awaited<ReturnType<typeof investigateProgram>>
            try {
              if (uiScan && !input.exploration)
                for (const target of input.targets.filter((t) => t.binding === 'post-action')) {
                  const h = await page
                    .locator(`css=${target.selector}`)
                    .elementHandle({ timeout: 1000 })
                  if (h) {
                    try {
                      priorResults.set(target.name, await measureElement(h))
                    } finally {
                      await h.dispose()
                    }
                  }
                }
              result = await investigateProgram(input, {
                page,
                runId,
                guard,
                signal,
                remainingActions: () => budget.maxActions - usage.actions,
                clean: () => integrity.snapshot().status === 'clean',
                metadata: evidenceMetadata,
                screenshot: async () =>
                  saveEvidence(
                    runId,
                    'screenshot',
                    await page.screenshot({ scale: 'css', timeout: 3000 }),
                    evidenceMetadata(),
                    guard,
                  ),
                act: async (action) => {
                  guard()
                  try {
                    return await performAction(action)
                  } finally {
                    sideEffectPolicy?.setReadOnly(true)
                  }
                },
                observationsOnly: !!checkRuntime,
                registered: (id, phenomenon) => {
                  knownHypothesisIds.add(id)
                  taskState.recordHypothesis(id, phenomenon, 'always')
                },
                resolved: (id, status) => {
                  taskState.resolveHypothesis(id, status)
                },
              })
              const lastAct = input.steps.map((step) => step.op === 'act').lastIndexOf(true)
              const related =
                !checkRuntime &&
                !input.exploration &&
                input.steps.filter((s) => s.op === 'act').length === 1 &&
                lastAct >= 0
                  ? result.assertions.filter((assertion) => {
                      const target = input.targets.find((t) => t.name === assertion.left.target)
                      const action = input.steps.find((s) => s.op === 'act')
                      const acted =
                        action?.op === 'act'
                          ? input.targets.find((t) => t.name === action.target)
                          : undefined
                      if (
                        target?.binding !== 'post-action' ||
                        target.selector === acted?.selector ||
                        ![
                          'text',
                          'displayed',
                          'viewportFraction',
                          'unclippedFraction',
                          'hitFraction',
                        ].includes(assertion.left.metric) ||
                        !('value' in assertion.right) ||
                        input.steps.findIndex(
                          (s) => s.op === 'measure' && s.name === assertion.left.sample,
                        ) <= lastAct
                      )
                        return false
                      const old = priorResults.get(assertion.left.target)?.[assertion.left.metric]
                      if (
                        priorResults.has(assertion.left.target) &&
                        (old === null || old === undefined)
                      )
                        return false
                      return (
                        old === undefined ||
                        !(assertion.operator === 'eq'
                          ? old === assertion.right.value
                          : typeof old === 'number' &&
                            typeof assertion.right.value === 'number' &&
                            (assertion.operator === 'gte'
                              ? old >= assertion.right.value
                              : old <= assertion.right.value))
                      )
                    })
                  : []
              const relatedVerdict = related.some((a) => a.verdict === 'unknown')
                ? 'unknown'
                : related.some((a) => a.verdict === 'fail')
                  ? 'fail'
                  : 'pass'
              if (
                inspection &&
                related.length > 0 &&
                integrity.epoch() === 0 &&
                result.verdict !== 'unknown' &&
                relatedVerdict !== 'unknown'
              ) {
                for (const itemId of programActionItems ?? [])
                  inspection.scope.resolveItem(itemId, {
                    status: relatedVerdict === 'pass' ? 'verified' : 'failed',
                    reasonCode: 'program-postcondition-measured',
                    evidenceRefs: result.evidenceRefs,
                    eventIds: [],
                    detail: `Related changed result ${relatedVerdict}; public basis: ${input.basis}`,
                  })
                await inspection.flush()
              }
              return {
                ...result,
                ...(input.exploration
                  ? { exploratoryInteractions: interactionExploration.available() }
                  : {}),
              }
            } finally {
              programActionItems = null
              programExploration = null
            }
          }),
      }),
      ...(temporalInvestigator
        ? {
            investigation_check: createTool({
              id: 'investigation.check',
              description:
                'Test a grounded novel expectation that a current target becomes visible or pointer-actionable within a declared continuous measurement window. Registers hypothesis, binds the node, measures, evaluates the declared predicate and saves a bounded finding or refutation in one call. It does not prove requirement applicability, click behavior, pixel covering or any deadline before measurement starts. Select element-actionable for operability. Existing learned rules still use rule_check. Identical unchanged investigations reuse their historical result; freshWindowReason requests a new window for a specific remaining question. After completion do not duplicate the finding or measurement; continue remaining scope or run_finish.',
              inputSchema: temporalInvestigationInput,
              execute: (input) =>
                serial('investigation_check', async () => {
                  if (checkRuntime)
                    return {
                      error: 'v2-effect-checks-use-registered-requirements-and-original-checkRef',
                      verdict: 'unknown',
                    }
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
            sideEffectPolicy?.setReadOnly(true)
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
              sideEffectPolicy?.setReadOnly(true)
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
                  !uiScan &&
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
            if (
              !('error' in result) &&
              result.chunk &&
              (!uiScan || result.evidenceBearing) &&
              inspectedResultRefs.size < 3
            )
              inspectedResultRefs.add(`${result.resultRef}:${result.offset}`)
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
        description: pageActDescription(businessContract ?? undefined, config.features),
        inputSchema: actionInput,
        execute: (input) =>
          serial('page_act', () => {
            guard()
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
                nextStep: completedCheckNextStep(
                  verdict,
                  sideEffectPolicy?.retryBudgetRemaining(binding.operationId),
                ),
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
            if (checkRuntime && input.validationStatus === 'supported')
              return {
                error: 'v2-supported-effect-findings-are-executor-derived-from-registered-sources',
              }
            const db = getDbClient(),
              h = await db.execute({
                sql: 'SELECT id FROM hypotheses WHERE id=? AND run_id=?',
                args: [input.hypothesisId, runId],
              })
            if (!h.rows.length) throw new Error('hypothesis not owned by run')
            if (
              ['program', 'ui-interaction'].includes(
                (await hypothesisClass(runId, input.hypothesisId)).kind ?? '',
              )
            )
              throw Error(
                'Executor measurement already saves its computed result; do not resubmit or relabel its finding',
              )
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
            // A refusal must leave no trace, so every cheap gate runs before the insert. The receipt
            // gate lives in updateHypothesis, which runs after submitFinding - refused there, the
            // claim would still land in the findings table as a row the run never verified.
            if (input.validationStatus === 'supported' || input.validationStatus === 'refuted')
              await assertPromotableHypothesis(
                runId,
                input.hypothesisId,
                input.validationStatus,
                input.evidenceRefs,
              )
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
      focus_probe: createTool({
        id: 'visual.focus_probe',
        inputSchema: focusProbeInput,
        description:
          'Investigate a current visual input-region candidate using its candidateId, exact native-input elementRef and bindingReason. One atomic tool records ordinary clicks, verified unfocused baselines and a receipt. A result covers sampled points only. Repeating an unchanged binding returns its receipt. Unknown scope must remain unverified. Continue the business path after this bounded investigation.',
        execute: (input) =>
          serial('focus_probe', async () => {
            if (!config.features?.visualDiscovery || !visualFocus)
              throw Error('visual-discovery-disabled')
            sideEffectPolicy?.setReadOnly(true)
            try {
              return await visualFocus.probe(input)
            } finally {
              sideEffectPolicy?.setReadOnly(true)
            }
          }),
      }),
      exploration_update: createTool({
        id: 'exploration.update',
        description: uiScan
          ? 'Record the state you have reached and select the targets this run will check. selectItems chooses among the candidate items returned with the current observation, each with your basis; recordGap declares permanent extra unverified scope, not planned or deferred work: it is refused while selected controls/navigation are pending, unless the executor already intervened. Use selectItems for work you will still measure; navigation does not spend local-control sampling capacity. Only the executor concludes that a check is verified, so an item reaches a verified status through a saved measurement rather than through this call. Selections are additive: an item already reported as a gap stays reported.'
          : 'Record reached states and unfinished branches. Give every branch its actual trigger; use always only for an unconditional obligation. The server derives whether a condition triggered. Untriggered branches are reported separately and do not block completion. Send an empty list to clear previously recorded branches after checking them.',
        inputSchema: explorationInput,
        execute: (input) =>
          serial('exploration_update', async () => {
            if (input.sourceCandidates?.length) {
              if (!checkRuntime) return { error: 'source-candidates-require-v2' }
              for (const candidate of input.sourceCandidates) {
                const item = inspection
                  ?.snapshot()
                  .items.find((i) => i.itemId === candidate.itemId && i.selected)
                if (
                  !item?.checks?.effects.some(
                    (e) =>
                      e.sourceRefs.includes(candidate.sourceRef) &&
                      e.sourceHash === candidate.sourceHash &&
                      e.sourceSpan[0] === candidate.sourceSpan[0] &&
                      e.sourceSpan[1] === candidate.sourceSpan[1],
                  )
                )
                  return {
                    error: 'source-proposal-not-an-admitted-public-relation',
                    dispatched: false,
                  }
              }
            }

            if (uiScan && inspection && input.recordGap && integrity.epoch() === 0)
              inspection.assertAgentGapReady(input.selectItems?.length ?? 0)
            if (explicitScope && inspection) {
              const defaultSlots = new Set<string>()
              for (const entry of input.selectItems ?? []) {
                const candidate = inspection.candidateItems().find((c) => c.itemId === entry.itemId)
                const item = inspection.snapshot().items.find((i) => i.itemId === entry.itemId)
                if (item?.selected) continue
                if (!candidate || !['local-interaction', 'navigation'].includes(candidate.category))
                  throw Error('selection-requires-current-observed-candidate')
                if (
                  !inspection.isRequiredTarget(
                    candidate.ref,
                    candidate.snapshotId,
                    candidate.category as 'local-interaction' | 'navigation',
                  )
                )
                  return refuseOptionalScope(entry.itemId)
                if (uiScan?.samplingPolicy) continue
                const slot = `${candidate.category}:${candidate.category === 'local-interaction' ? item!.url : ''}`
                if (defaultSlots.has(slot)) return refuseOptionalScope(entry.itemId)
                defaultSlots.add(slot)
              }
            }
            notes.push(input)
            taskState.setBranches(input.unexploredBranches)
            await appendEvent(runId, 'exploration:state-reached', { state: input.state })
            if (uiScan && inspection) {
              // Selection and gaps are the agent's whole ledger surface. An empty update is inert:
              // the sampling obligation the observation created is not the model's to clear, which
              // is why a run that never selects anything still has to answer for it at finish.
              const ledger = inspection
              if (input.selectItems?.length)
                await ledger.selectItems(
                  input.selectItems.map((entry) => ({
                    itemId: entry.itemId,
                    basis: entry.basis,
                  })),
                )
              if (input.recordGap) await ledger.recordGap(input.recordGap)
              const candidates = ledger.candidateItems()
              await appendEvent(runId, 'exploration:coverage-updated', {
                task: taskState.snapshot(),
                inspection: ledger.snapshot(),
              })
              return {
                state: input.state,
                task: taskState.snapshot(),
                selected: ledger.snapshot().counts.selected,
                candidateItems: candidates,
                localSampling: ledger.localSampling(),
                missingFacts: [
                  ...completionGaps(),
                  ...ledger.completionGaps().map((g) => g.reason),
                ],
              }
            }
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
        description: uiScan
          ? 'End this UI inspection with its reason code: scope-covered when the selected checks are done, observed-blocker when a measured failure prevents progress, unverified-scope when applicable work remains and is recorded. The server decides whether the claim is supported and builds the report; a refusal lists exactly what is missing.'
          : 'Stop with an observed business outcome or blocked path. Completion never removes earlier findings. Unknown outcomes cannot count as successful completion.',
        // A UI run always uses the short protocol, even when the legacy business switch is off: its
        // finish is a claim about the inspection, and it has no business outcome to name. The schema
        // is also what stops a UI run from ever *passing* `businessResult`, which is the plan's
        // "do not change business unknown into success" requirement held structurally rather than by
        // validating it away afterwards.
        inputSchema: uiScan || config.features?.shortFinish ? shortFinishInput : legacyFinishInput,
        execute: (request) => finishInspection(request),
      }),
    }
    // The inspected business's own requirements, from its frozen contract, so an export run is not
    // briefed with the shopping requirements and vice versa.
    /**
     * The bounded visual scan, run once after the first observation and before any agent decision.
     *
     * It is deliberately read-only and happens before the loop so the candidates are already part of
     * the run's facts by the time the agent reasons about what to investigate, and so the model cost is
     * bounded to one call per observation regardless of how the conversation develops (plan 4.2).
     */

    const policy = inspectionPolicy(
      run.spec.goal,
      config.features,
      businessContract ?? undefined,
      uiScan,
    )
    const contractRepair = createToolContractRepair()
    let contractRepairAdvice: ReturnType<typeof contractRepair.take>
    let uiRecoveryUsed = false
    const remainingGuidance = createRemainingObligationGuidance()
    let remainingObligationGuidance: ReturnType<typeof remainingGuidance.take>
    let guidanceExhausted = false
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
    await appendEvent(runId, 'visual-discovery:configured', {
      enabled: !!config.features?.visualDiscovery,
      algorithmVersion: VISUAL_FOCUS_VERSION,
    })
    if (visualScanEligible && config.features?.visualDiscovery) await visualFocus.scan()
    while (!finished) {
      if (uiScan && inspection) {
        guard()
        await networkBoundary?.flush?.()
        guard()
        if (integrity.epoch() > 0) {
          const completion = await finishUiScan({ reason: 'observed-blocker' })
          if (!completion.accepted) throw Error('ui-blocker-proof-unavailable')
          break
        }
      }
      if (await closeCoveredUiScope()) break
      if (uiScan && inspection && noToolStreak >= 3) {
        if (!uiRecoveryUsed) {
          uiRecoveryUsed = true
          const before = JSON.stringify([latest?.snapshot.url, latest?.snapshot.text, latestA11y])
          await observe()
          const recovery = interactionRecovery.available()[0]
          const result = recovery ? await recoverInteraction(recovery.checkRef) : undefined
          const changed =
            before !== JSON.stringify([latest?.snapshot.url, latest?.snapshot.text, latestA11y]) ||
            result?.outcome === 'verified' ||
            result?.outcome === 'failed'
          await appendEvent(runId, 'execution:bounded-recovery', {
            changed,
            checkRef: recovery?.checkRef ?? null,
            outcome: result?.outcome ?? null,
            actionsReplayed: 0,
          })
          if (changed) {
            noToolStreak = 0
            continue
          }
        }
        contractRepairAdvice = guidanceExhausted ? undefined : contractRepair.take()
        if (contractRepairAdvice) {
          await appendEvent(runId, 'execution:contract-repair', contractRepairAdvice)
          noToolStreak = 2
          continue
        }
        const reserve = phaseTracker.shouldFinalize({
          elapsedMs: Date.now() - startedAt,
          modelCallsUsed: usage.modelCalls,
          noProgressStreak: 0,
        })
        if (
          !guidanceExhausted &&
          !reserve.should &&
          phaseTracker.phase !== 'finalizing' &&
          usage.actions < budget.maxActions &&
          !sideEffectPending &&
          integrity.epoch() === 0
        ) {
          const pending = new Set(
            inspection
              .snapshot()
              .items.filter((i) => i.selected && i.status === 'pending')
              .map((i) => i.itemId),
          )
          const connected = []
          for (const c of inspection.candidateItems()) {
            if (
              pending.has(c.itemId) &&
              (await candidateBindings
                .get(c.ref)
                ?.evaluate((n) => n.isConnected && n.ownerDocument === document))
            )
              connected.push(c)
          }
          guard()
          remainingObligationGuidance = remainingGuidance.take(connected)
          if (remainingObligationGuidance)
            await appendEvent(
              runId,
              'execution:remaining-obligation-guidance',
              remainingObligationGuidance,
            )
        }
        // No-progress is a scheduling fact, not an unverified UI dimension. An already
        // covered run must pass the same durable verifier before adding a genuine gap.
        if (!remainingObligationGuidance) {
          const completion = await finishUiScan({ reason: 'scope-covered' })
          if (completion.accepted) break
          await inspection.recordGap({
            reasonCode: 'no-progress',
            detail: 'Repeated reads added no relevant facts; bounded recovery exhausted.',
          })
          await finishUiScan({ reason: 'unverified-scope' })
          break
        }
      }
      const finCheck = phaseTracker.shouldFinalize({
        elapsedMs: Date.now() - startedAt,
        modelCallsUsed: usage.modelCalls,
        noProgressStreak: remainingObligationGuidance ? 0 : noToolStreak,
      })
      if (finCheck.should) {
        if (
          uiScan &&
          inspection &&
          usage.modelCalls > 0 &&
          (finCheck.reason === 'time-budget-reserve' ||
            (finCheck.reason === 'model-budget-reserve' &&
              budget.maxModelCalls > 2 &&
              usage.modelCalls < budget.maxModelCalls))
        ) {
          const completion = await finishUiScan({ reason: 'scope-covered' })
          if (!completion.accepted) {
            await inspection.recordGap({
              reasonCode: finCheck.reason,
              detail:
                'Reserved remaining budget for durable partial completion; no further exploration or model request.',
            })
            await finishUiScan({ reason: 'unverified-scope' })
          }
          break
        }
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
      const retryBlocker =
        config.features?.blockerReview && !uiScan ? await measuredRetryBlocker() : undefined
      const activeTools = Object.keys(tools).filter((name) => {
        // A UI run never reads or publishes a cross-run Journey: the plan closes that capability for
        // this kind, because a segment evidenced under another site's contract could otherwise be
        // replayed against a URL it was never about (plan 1.3, 7).
        if (uiScan && name === 'journey_run') return false
        if (
          name === 'investigation_run' ||
          name === 'page_inspect' ||
          name === 'investigation_check'
        )
          return phaseTracker.phase !== 'finalizing'
        if (name === 'transition_observe') return taskState.hasOpenHypotheses()
        if (name === 'findings_submit') return knownHypothesisIds.size > 0
        // Offered only while there is an uninvestigated candidate from the CURRENT observation, and
        // only outside finalization, where new exploration is not allowed (plan 4.3).
        if (name === 'focus_probe')
          return (
            phaseTracker.phase !== 'finalizing' &&
            !!config.features?.visualDiscovery &&
            !!visualFocus?.candidates(`s${observeCount}`).length
          )

        return true
      })
      const agentInput = {
        ...(uiScan
          ? {
              recoverableInteractions: interactionRecovery.available(),
              localSampling: inspection?.localSampling(),
            }
          : {}),
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
        // Only the current observation's uninvestigated candidates, and only what the agent needs to
        // choose one: the model's own prose and the raw image stay behind evidence ids (plan 4.6).
        ...(config.features?.visualDiscovery
          ? {
              visualCandidates:
                visualFocus?.candidates(`s${observeCount}`).map((c) => ({
                  id: c.id,
                  targetDescription: c.targetDescription,
                  visualBasis: c.visualBasis,
                  confidence: c.confidence,
                  investigated: c.investigated,
                })) ?? [],
              visualFindings: visualFocus?.facts ?? [],
            }
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
        ...(uiScan ? { exploratoryInteractions: interactionExploration.available() } : {}),
        history: recentHistory,
        historyWindow: {
          total: history.length,
          start: recentHistory[0]?.index ?? Math.max(0, history.length - 1),
          omitted: Math.max(0, history.length - recentHistory.length - 1),
        },
        notes: notes.slice(-10),
        task: taskState.snapshot(),
        // The UI ledger's own view: what is selected, what is outstanding, and the bounded candidate
        // list this observation actually offered. It is part of the input packet rather than only a
        // tool result so the agent can choose a target without a call that would spend an attempt.
        ...(uiScan && inspection
          ? {
              inspectionScope: {
                candidates: inspection.candidateItems(),
                requiredChecks: inspection.requiredChecks(),
                defaultSampling: inspection.defaultSampling(),
                recentChecks: [...uiActionChecks.keys()].slice(-6).map(uiActionReceipt),
                counts: inspection.snapshot().counts,
                ...(checkRuntime
                  ? {
                      checks: inspection
                        .snapshot()
                        .items.filter((i) => i.selected && i.checks)
                        .map((i) => ({ itemId: i.itemId, checks: checkSummary(i.checks!) })),
                      checkInteractions: checkRuntime.available(),
                    }
                  : {}),
                outstanding: inspection.completionGaps().map((gap) => ({
                  itemId: gap.itemId,
                  category: gap.category,
                  reason: gap.reason,
                })),
                unsupported: inspection.snapshot().unsupported.map((u) => u.dimension),
                note: explicitScope
                  ? 'Public required checks are registered by the executor. Missing targets remain obligations. New optional checks require budget admission; measurements alone resolve items.'
                  : 'Select the targets this run will check with exploration_update.selectItems, using their itemId. Only you decide relevance; the executor decides whether a check is verified.',
              },
            }
          : {}),
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
          writePolicy: businessContract
            ? {
                maxCreates: businessContract.effects.maxCreates,
                maxRetriesPerOperation: businessContract.effects.maxRetriesPerOperation,
                createsSpent: sideEffectPolicy!.snapshot().createsReserved,
                retriesSpent: sideEffectPolicy!.snapshot().retriesReserved,
                retriesRemainingForCurrentOperation: businessFacts.at(-1)
                  ? sideEffectPolicy!.retryBudgetRemaining(businessFacts.at(-1)!.operationId)
                  : null,
                createsRemaining: Math.max(
                  0,
                  businessContract.effects.maxCreates -
                    sideEffectPolicy!.snapshot().createsReserved,
                ),
                recoveryPolicy: recoveryPolicyDescription(businessFacts.at(-1)),
              }
            : null,
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
        ...(contractRepairAdvice ? { contractRepairAdvice } : {}),
        ...(remainingObligationGuidance ? { remainingObligationGuidance } : {}),
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
        // The limited blocker review is a business capability: it reasons from a business outcome
        // and a retry opportunity, neither of which a UI run has. It is closed for this kind rather
        // than being fed nulls (plan 7).
        !uiScan &&
        config.features?.blockerReview &&
        config.features?.shortFinish &&
        !deferCompletionReview &&
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
        const version = await readCompletionVersion(page)
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
          observationVersion: completionObservationVersion,
          currentVersion: version,
          alreadyReviewed: reviewedStates.has(reviewKey),
        })
        // Observation and annotation can span document/focus changes. Refresh once rather than
        // treating a stale snapshot as current or asking a model to decide from it.
        if (
          body &&
          version.reusable &&
          !sameObservationVersion(completionObservationVersion, version) &&
          refreshedReviewVersions.size < 2 &&
          !refreshedReviewVersions.has(version.key)
        ) {
          refreshedReviewVersions.add(version.key)
          await observe()
          continue
        }
        if (
          body &&
          sameObservationVersion(completionObservationVersion, version) &&
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
            deferCompletionReview = true
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
      deferCompletionReview = false
      let lastRecord: ReturnType<ReturnType<RequestTracker['startRequest']>['finish']> | undefined
      const handles = new Map<string, ReturnType<RequestTracker['startRequest']>>()
      const result = await executeModelRequest(
        agent,
        JSON.stringify(agentInput),
        {
          activeTools,
          requireTool: true,
          lengthRecoveryWithoutReasoning: config.lengthRecoveryWithoutReasoning,
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
      contractRepair.observe(result.toolResults ?? [])
      const repairingContract = !!contractRepairAdvice
      contractRepairAdvice = undefined
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
        selectionFacts: inspection?.selectionFacts() ?? [],
        hypothesisFacts: taskState.facts(),
        findingFacts: [...findingFacts],
        measurementFacts: [...measurementFacts],
        // Bounded first access to original evidence can inform a decision; it is not a new verification.
        retrievedFacts: [...inspectedResultRefs],
      }
      const progressCheck = progressDetector.check(progressFacts)
      // A failed contract repair gets no second scheduling allowance from F1. Input errors
      // themselves are not progress and never replenish the existing one-turn repair.
      if (repairingContract && !progressCheck.isProgress) guidanceExhausted = true
      if (remainingObligationGuidance) {
        guidanceExhausted = !progressCheck.isProgress
        await appendEvent(runId, 'execution:remaining-obligation-guidance-result', {
          newFacts: progressCheck.isProgress,
          basis: progressCheck.basis,
          previousNoProgressStreak: noToolStreak,
        })
        remainingObligationGuidance = undefined
      }
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
    await visualFocus?.dispose().catch(() => {})
    await closeResponses()
    await temporalInvestigator?.close()
    await interactionRecovery.dispose()
    await interactionExploration.dispose()
    await checkRuntime?.dispose()
    await Promise.allSettled(investigationBlockers.map((cached) => cached.handle.dispose()))
    if (worker) await worker.close().catch(() => {})
    await queue.commitRun(
      runId,
      sideEffectPending ? 'reconciliation-required' : stopReason,
      async (reason) => {
        stopReason = reason
        try {
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
          await updateRunStatus(runId, status, {
            businessResult,
            stopReason,
            usage: reportedUsage(),
          })
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
          await verifyCompletionCommit({
            runId,
            status,
            businessResult,
            stopReason,
            lastEvent,
            eventIds: [...active.eventIds],
          })
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
      },
    )
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
