import {
  getRun,
  updateRunStatus,
  appendEvent,
  registerActiveRun,
  removeActiveRun,
  getActiveRun,
} from './run-manager.ts'
import { launchBrowser, saveScreenshot, type BrowserWorker } from './browser.ts'
import { config, checkModelConfig } from '../shared/config.ts'
import type { RunUsage, BusinessResult, StopReason } from '../shared/types.ts'

export async function startRunExecution(runId: string): Promise<void> {
  const run = await getRun(runId)
  if (!run) throw new Error(`Run not found: ${runId}`)

  const modelCheck = checkModelConfig()
  if (!modelCheck.ready) {
    await updateRunStatus(runId, 'execution-error', {
      stopReason: 'execution-error',
    })
    await appendEvent(runId, 'run:error', {
      error: 'configuration-missing',
      missing: modelCheck.missing,
    })
    return
  }

  const active = registerActiveRun(runId)
  let worker: BrowserWorker | null = null

  const usage: RunUsage = {
    actions: 0,
    modelCalls: 0,
    elapsedMs: 0,
    modelInputTokens: 0,
    modelOutputTokens: 0,
  }

  try {
    await updateRunStatus(runId, 'running')
    await appendEvent(runId, 'run:started', {
      goal: run.spec.goal,
      entryUrl: run.spec.entryUrl,
    })

    worker = await launchBrowser({
      headless: true,
      viewport: run.spec.viewport,
    })

    await appendEvent(runId, 'browser:launched', {
      viewport: run.spec.viewport,
    })

    await worker.page.goto(run.spec.entryUrl, { waitUntil: 'networkidle' })
    await appendEvent(runId, 'navigation:completed', {
      url: run.spec.entryUrl,
    })

    const screenshotPath = await saveScreenshot(worker.page, runId, 'initial')
    await appendEvent(runId, 'screenshot:captured', {
      label: 'initial',
      path: screenshotPath,
    })

    await runAgentLoop(runId, worker, run.spec.goal, run.spec.budget, usage, active.abortController.signal)

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)

    if (active.abortController.signal.aborted) {
      await updateRunStatus(runId, 'cancelled', {
        stopReason: 'cancelled',
        usage: { ...usage, elapsedMs: Date.now() - active.startedAt },
      })
      await appendEvent(runId, 'run:cancelled', {})
    } else {
      await updateRunStatus(runId, 'execution-error', {
        stopReason: 'execution-error',
        usage: { ...usage, elapsedMs: Date.now() - active.startedAt },
      })
      await appendEvent(runId, 'run:error', { error: errorMessage })
    }
  } finally {
    if (worker) {
      try {
        await saveScreenshot(worker.page, runId, 'final')
      } catch { /* page may be closed */ }
      await worker.close()
    }
    removeActiveRun(runId)
  }
}

async function runAgentLoop(
  runId: string,
  worker: BrowserWorker,
  goal: string,
  budget: { totalTimeoutMs: number; maxActions: number; maxModelCalls: number },
  usage: RunUsage,
  signal: AbortSignal,
): Promise<void> {
  const startTime = Date.now()
  let businessResult: BusinessResult = 'unknown'
  let stopReason: StopReason = 'goal-reached'
  let actionCount = 0
  let modelCallCount = 0

  const mutableUsage = { ...usage }

  try {
    const { Agent } = await import('@mastra/core')

    const agent = new Agent({
      name: 'ui-explorer',
      instructions: buildAgentInstructions(goal),
      model: config.agentModel as `${string}/${string}`,
    })

    const maxIterations = Math.min(budget.maxActions, 20)

    for (let i = 0; i < maxIterations; i++) {
      if (signal.aborted) {
        stopReason = 'cancelled'
        break
      }

      const elapsed = Date.now() - startTime
      if (elapsed >= budget.totalTimeoutMs) {
        stopReason = 'budget-exhausted'
        await appendEvent(runId, 'budget:timeout', { elapsedMs: elapsed })
        break
      }

      if (actionCount >= budget.maxActions) {
        stopReason = 'budget-exhausted'
        await appendEvent(runId, 'budget:actions-exhausted', { actions: actionCount })
        break
      }

      if (modelCallCount >= budget.maxModelCalls) {
        stopReason = 'budget-exhausted'
        await appendEvent(runId, 'budget:model-calls-exhausted', { calls: modelCallCount })
        break
      }

      const pageUrl = worker.page.url()
      const pageTitle = await worker.page.title()

      await appendEvent(runId, 'exploration:state-reached', {
        state: pageTitle || pageUrl,
        url: pageUrl,
        iteration: i,
      })

      const screenshotPath = await saveScreenshot(worker.page, runId, `step-${i}`)

      modelCallCount++
      await appendEvent(runId, 'agent:thinking', {
        iteration: i,
        pageUrl,
        pageTitle,
      })

      const prompt = buildStepPrompt(goal, pageUrl, pageTitle, i, actionCount, budget.maxActions)

      const response = await agent.generate(prompt)
      mutableUsage.modelInputTokens += response.usage?.promptTokens ?? 0
      mutableUsage.modelOutputTokens += response.usage?.completionTokens ?? 0

      const text = response.text ?? ''
      await appendEvent(runId, 'agent:response', {
        iteration: i,
        response: text.slice(0, 500),
        screenshotRef: screenshotPath,
      })

      const action = parseAgentAction(text)

      if (action.type === 'done') {
        businessResult = action.businessResult ?? 'unknown'
        stopReason = 'goal-reached'
        await appendEvent(runId, 'agent:done', {
          businessResult,
          summary: action.summary,
        })
        break
      }

      if (action.type === 'blocked') {
        businessResult = 'unknown'
        stopReason = 'blocked'
        await appendEvent(runId, 'agent:blocked', {
          reason: action.reason,
        })
        break
      }

      if (action.type === 'click' || action.type === 'fill' || action.type === 'navigate') {
        actionCount++
        await appendEvent(runId, 'action:executing', {
          type: action.type,
          target: action.target,
          value: action.value,
        }, { actionId: `action-${i}` })

        try {
          await executeAction(worker, action, config.budget.toolTimeoutMs)
          await worker.page.waitForLoadState('networkidle').catch(() => {})
          await appendEvent(runId, 'action:completed', {
            type: action.type,
            target: action.target,
          }, { actionId: `action-${i}` })
        } catch (err) {
          await appendEvent(runId, 'action:failed', {
            type: action.type,
            target: action.target,
            error: err instanceof Error ? err.message : String(err),
          }, { actionId: `action-${i}` })
        }
      }
    }
  } catch (err) {
    stopReason = 'execution-error'
    await appendEvent(runId, 'agent:error', {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  const finalUsage: RunUsage = {
    actions: actionCount,
    modelCalls: modelCallCount,
    elapsedMs: Date.now() - startTime,
    modelInputTokens: mutableUsage.modelInputTokens,
    modelOutputTokens: mutableUsage.modelOutputTokens,
  }

  const finalStatus = stopReason === 'cancelled' ? 'cancelled'
    : stopReason === 'budget-exhausted' ? 'timed-out'
    : stopReason === 'execution-error' ? 'execution-error'
    : stopReason === 'blocked' ? 'blocked'
    : 'completed'

  await updateRunStatus(runId, finalStatus, {
    businessResult,
    stopReason,
    usage: finalUsage,
  })

  await appendEvent(runId, 'run:completed', {
    status: finalStatus,
    businessResult,
    stopReason,
    usage: finalUsage,
  })
}

function buildAgentInstructions(goal: string): string {
  return `You are a UI quality tester. Your goal: ${goal}

You explore web applications autonomously. At each step, you see the current page state and decide what to do next.

Respond with exactly ONE action per step in this format:

ACTION: click | fill | navigate | done | blocked
TARGET: <css selector or description>
VALUE: <text to fill, URL to navigate to, or empty>
BUSINESS_RESULT: <success | rejected | unknown> (only for done action)
SUMMARY: <brief explanation>

Rules:
- Explore the page systematically to achieve the goal
- Click buttons, fill forms, navigate pages as needed
- When the goal is achieved, use "done" with the appropriate business result
- If you cannot proceed, use "blocked" with a reason
- Be precise with CSS selectors when possible
- Report what you observe honestly`
}

function buildStepPrompt(
  goal: string,
  pageUrl: string,
  pageTitle: string,
  iteration: number,
  actionsTaken: number,
  maxActions: number,
): string {
  return `Step ${iteration + 1}. Page: "${pageTitle}" at ${pageUrl}. Actions used: ${actionsTaken}/${maxActions}.

Goal: ${goal}

What do you observe on this page? What action should you take next?`
}

interface AgentAction {
  type: 'click' | 'fill' | 'navigate' | 'done' | 'blocked'
  target?: string
  value?: string
  businessResult?: 'success' | 'rejected' | 'unknown'
  summary?: string
  reason?: string
}

function parseAgentAction(text: string): AgentAction {
  const actionMatch = text.match(/ACTION:\s*(click|fill|navigate|done|blocked)/i)
  const targetMatch = text.match(/TARGET:\s*(.+)/i)
  const valueMatch = text.match(/VALUE:\s*(.+)/i)
  const resultMatch = text.match(/BUSINESS_RESULT:\s*(success|rejected|unknown)/i)
  const summaryMatch = text.match(/SUMMARY:\s*(.+)/i)

  if (!actionMatch) {
    return { type: 'done', businessResult: 'unknown', summary: 'Could not parse agent response' }
  }

  return {
    type: actionMatch[1].toLowerCase() as AgentAction['type'],
    target: targetMatch?.[1]?.trim(),
    value: valueMatch?.[1]?.trim(),
    businessResult: resultMatch?.[1]?.toLowerCase() as AgentAction['businessResult'],
    summary: summaryMatch?.[1]?.trim(),
    reason: summaryMatch?.[1]?.trim(),
  }
}

async function executeAction(
  worker: BrowserWorker,
  action: AgentAction,
  timeoutMs: number,
): Promise<void> {
  const page = worker.page

  switch (action.type) {
    case 'click': {
      if (!action.target) throw new Error('click requires a target')
      const element = await page.locator(action.target).first()
      await element.click({ timeout: timeoutMs })
      break
    }
    case 'fill': {
      if (!action.target) throw new Error('fill requires a target')
      if (!action.value) throw new Error('fill requires a value')
      const input = await page.locator(action.target).first()
      await input.fill(action.value, { timeout: timeoutMs })
      break
    }
    case 'navigate': {
      if (!action.value) throw new Error('navigate requires a URL')
      await page.goto(action.value, { timeout: timeoutMs, waitUntil: 'networkidle' })
      break
    }
    default:
      break
  }
}
