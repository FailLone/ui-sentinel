import type { ElementHandle, Page } from 'playwright'
import {
  programInput,
  evaluateProgram,
  type InvestigationProgram,
  type Samples,
} from './program.ts'
import { measureElement, unknownMeasurement } from './measure.ts'

export interface ProgramHost {
  page: Page
  guard(): void
  signal: AbortSignal
  remainingActions(): number
  act(input: {
    type: 'click' | 'fill' | 'scroll'
    selector?: string
    value?: string
    scrollY?: number
  }): Promise<unknown>
  screenshot(): Promise<string>
  clean(): boolean
}

/** No issue-specific branches, model calls, or arbitrary eval. All writes pass through the host. */
export async function runProgram(raw: InvestigationProgram, host: ProgramHost) {
  const program = programInput.parse(raw)
  host.guard()
  if (program.steps.filter((s) => s.op === 'act').length > host.remainingActions())
    throw Error('program-action-budget-exhausted')
  const samples: Samples = {},
    screenshotRefs: string[] = [],
    log: { op: string; at: number; detail: string }[] = []
  const handles = new Map<string, ElementHandle<Element>>()
  const targetIssues: { sample: string; target: string; reason: string }[] = []
  const bindingIssues = new Map<string, string>()
  let resultsBound = false
  const resultBindings: { target: string; selector: string; text: string | null }[] = []
  const root = await host.page.locator('html').elementHandle({ timeout: 1000 })
  const url = host.page.url()
  const startedAt = Date.now()
  let error: string | undefined
  const check = async () => {
    host.guard()
    if (Date.now() - startedAt > 10000) throw Error('program-time-budget-exhausted')
    if (
      url !== host.page.url() ||
      !root ||
      !(await root.evaluate((e) => e.isConnected && e === document.documentElement))
    )
      throw Error('program-document-changed')
  }
  const bind = async (name: string, explicitResultBinding = false) => {
    const target = program.targets.find((t) => t.name === name)!
    if (
      target.binding === 'post-action' &&
      (!resultsBound || (!explicitResultBinding && !handles.has(name)))
    ) {
      bindingIssues.set(name, 'result-not-bound')
      return null
    }
    const count = await host.page.evaluate(
      (s) => document.querySelectorAll(s).length,
      target.selector,
    )
    if (count !== 1) {
      bindingIssues.set(name, count === 0 ? 'target-missing' : 'target-ambiguous')
      return null
    }
    let h = handles.get(name)
    if (!h) {
      h =
        (await host.page.locator(`css=${target.selector}`).elementHandle({ timeout: 1000 })) ??
        undefined
      if (h) handles.set(name, h)
    }
    if (
      !h ||
      !(await h.evaluate(
        (e, s) => e.isConnected && document.querySelector(s) === e,
        target.selector,
      ))
    ) {
      bindingIssues.set(name, h ? 'target-replaced-or-detached' : 'target-unavailable')
      return null
    }
    bindingIssues.delete(name)
    return h
  }
  try {
    for (const step of program.steps) {
      await check()
      log.push({
        op: step.op,
        at: Date.now(),
        detail:
          step.op === 'measure'
            ? step.name
            : step.op === 'wait'
              ? String(step.ms)
              : step.op === 'bind_results'
                ? 'current public result nodes'
                : step.type,
      })
      if (step.op === 'bind_results') {
        resultsBound = true
        for (const target of program.targets.filter((t) => t.binding === 'post-action')) {
          // Explicit, recorded rebinding applies only to declared result slots. Node targets retain identity.
          await handles.get(target.name)?.dispose()
          handles.delete(target.name)
          const handle = await bind(target.name, true)
          const facts = handle ? await measureElement(handle) : unknownMeasurement()
          resultBindings.push({
            target: target.name,
            selector: target.selector,
            text: typeof facts.text === 'string' ? facts.text : null,
          })
        }
      } else if (step.op === 'measure') {
        const measured: Samples[string] = {}
        for (const t of program.targets) {
          const h = await bind(t.name)
          measured[t.name] = h ? await measureElement(h) : unknownMeasurement()
          if (!h)
            targetIssues.push({
              sample: step.name,
              target: t.name,
              reason: bindingIssues.get(t.name) ?? 'target-unavailable',
            })
        }
        const shot = await host.screenshot()
        await check()
        for (const target of program.targets) {
          const handle = await bind(target.name)
          const current = handle ? await measureElement(handle) : unknownMeasurement()
          if (JSON.stringify(current) !== JSON.stringify(measured[target.name]))
            throw Error('program-capture-changed')
        }
        samples[step.name] = measured
        screenshotRefs.push(shot)
      } else if (step.op === 'wait') {
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer)
            reject(host.signal.reason ?? Error('aborted'))
          }
          const timer = setTimeout(() => {
            host.signal.removeEventListener('abort', abort)
            resolve()
          }, step.ms)
          host.signal.addEventListener('abort', abort, { once: true })
          if (host.signal.aborted) {
            host.signal.removeEventListener('abort', abort)
            abort()
          }
        })
      } else {
        if (step.target && !(await bind(step.target)))
          throw Error('program-action-target-unavailable')
        const result = await host.act({
          type: step.type,
          ...(step.target
            ? { selector: `css=${program.targets.find((t) => t.name === step.target)!.selector}` }
            : {}),
          ...(step.value !== undefined ? { value: step.value } : {}),
          ...(step.scrollY !== undefined ? { scrollY: step.scrollY } : {}),
        })
        if (result && typeof result === 'object' && 'error' in result)
          throw Error(String(result.error))
      }
      await check()
      if (!host.clean()) throw Error('program-evidence-intervened')
    }
  } catch (e) {
    host.guard() // cancellation must not commit a late receipt
    error = String(e)
  } finally {
    await Promise.allSettled([root?.dispose(), ...[...handles.values()].map((h) => h.dispose())])
  }
  const evaluated = evaluateProgram(program, samples)
  return {
    version: 1 as const,
    program,
    samples,
    log,
    screenshotRefs,
    startedAt,
    finishedAt: Date.now(),
    assertions: evaluated.assertions,
    targetIssues,
    resultBindings,
    verdict: error || !host.clean() ? ('unknown' as const) : evaluated.verdict,
    ...(error ? { error } : {}),
    scope:
      'Bounded comparison of measured public DOM facts against Agent-declared expectations. Applicability and user impact are not independently proven. Rectangular geometry excludes transforms, masks and complex clipping; sampled hit testing does not prove click handlers or all pixels. This receipt is not an enabled rule.',
  }
}
export type ProgramReceipt = Awaited<ReturnType<typeof runProgram>>
