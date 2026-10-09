import { randomUUID } from 'node:crypto'
import type { Page, JSHandle, ElementHandle } from 'playwright'
import { z } from 'zod'
import { recoveryDigest } from './interaction-recovery.ts'
import type { InteractionVerification } from './interaction-verification.ts'

/** A literal user requirement is frozen BEFORE the operation; a result selector is not guessed. */
export const exploratoryEffectInput = z
  .object({
    condition: z.enum(['text-equals', 'text-contains']),
    expected: z.string().min(1).max(500),
    basis: z.string().min(1).max(1000),
  })
  .strict()
export type ExploratoryEffect = z.infer<typeof exploratoryEffectInput>
type Before = { snapshot: JSHandle<any>; goalHash: string; effect?: ExploratoryEffect }
type Check = {
  checkRef: string
  actionId: string
  itemId: string
  actionVersion: number
  url: string
  evidenceHashes: Record<string, string>
  goalHash: string
  effect?: ExploratoryEffect
}

/** Run-local evidence capabilities only. This module dispatches NO browser actions. */
export function createInteractionExploration(host: {
  page(): Page
  actionVersion(): number
  clean(): boolean
  guard(): void
  hashEvidence(refs: readonly string[]): Promise<Record<string, string>>
}) {
  const captures = new Set<Before>()
  const checks = new Map<
    string,
    {
      check: Check
      before: Before
      inspected: Map<string, ElementHandle<Element>>
      attempts: number
      done: boolean
      selector?: string
    }
  >()
  return {
    async capture(goal: string, effect?: ExploratoryEffect): Promise<Before> {
      host.guard()
      if (!host.clean()) throw Error('exploration-evidence-intervened')
      if (effect && !goal.includes(effect.expected))
        throw Error('exploration-expectation-not-in-original-user-goal')
      const snapshot = await host.page().evaluateHandle(() => {
        const nodes = [...document.querySelectorAll('body *')]
        if (nodes.length > 500) throw Error('exploration-observation-limit')
        const states = new WeakMap<
          Element,
          { visible: boolean; text: string; truncated: boolean }
        >()
        for (const n of nodes) {
          const r = n.getBoundingClientRect(),
            s = getComputedStyle(n),
            text = (n.textContent ?? '').trim()
          states.set(n, {
            visible:
              r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden',
            text: text.slice(0, 1000),
            truncated: text.length > 1000,
          })
        }
        return { root: document.documentElement, url: location.href, states }
      })
      const before = {
        snapshot,
        goalHash: recoveryDigest(goal),
        effect: effect && structuredClone(effect),
      }
      captures.add(before)
      host.guard()
      return before
    },
    assertNotRepeated(itemId: string) {
      if ([...checks.values()].some((e) => e.check.itemId === itemId && !e.done))
        throw Error(
          'exploration-original-action-already-recorded: measure it without repeating the operation',
        )
    },
    async register(
      before: Before,
      input: { actionId: string; itemId: string },
      refs: readonly string[],
    ) {
      host.guard()
      const check: Check = {
        ...input,
        checkRef: randomUUID(),
        actionVersion: host.actionVersion(),
        url: host.page().url(),
        evidenceHashes: await host.hashEvidence(refs),
        goalHash: before.goalHash,
        effect: before.effect,
      }
      checks.set(check.checkRef, { check, before, inspected: new Map(), attempts: 0, done: false })
      host.guard()
      return structuredClone(check)
    },
    available() {
      return [...checks.values()]
        .filter((e) => !e.done && e.attempts < 2 && e.check.actionVersion === host.actionVersion())
        .slice(-6)
        .map((e) => ({
          ...e.check,
          evidenceHashes: undefined,
          evidenceRefs: Object.keys(e.check.evidenceHashes),
          attemptsRemaining: 2 - e.attempts,
          effectTested: false,
        }))
    },
    owns(ref: string) {
      return checks.has(ref)
    },
    async noteInspected(observed: readonly { selector: string; text: unknown }[]) {
      for (const e of checks.values()) {
        if (e.done || e.check.actionVersion !== host.actionVersion()) continue
        for (const { selector, text } of observed) {
          const locator = host.page().locator(`css=${selector}`)
          if ((await locator.count()) !== 1) continue
          const handle = await locator.elementHandle()
          if (handle) {
            const consistent = await handle.evaluate(
              (n, t) => (n.textContent ?? '').trim().slice(0, 160) === t,
              text,
            )
            if (!consistent) {
              await handle.dispose()
              continue
            }
            await e.inspected.get(selector)?.dispose()
            e.inspected.set(selector, handle as ElementHandle<Element>)
          }
        }
      }
      host.guard()
    },
    async run<T extends { outcome: string }>(
      ref: string,
      selector: string | undefined,
      measure: (
        check: Check,
        input: InteractionVerification,
        assertCurrent: () => Promise<void>,
      ) => Promise<T>,
    ): Promise<T> {
      const e = checks.get(ref)
      if (!e || e.done || e.attempts >= 2) throw Error('exploration-reference-unavailable')
      if (!e.check.effect)
        throw Error('exploration-no-independent-expectation: original item remains pending')
      if (!selector || !e.inspected.has(selector)) throw Error('exploration-result-not-inspected')
      if (e.selector && e.selector !== selector) throw Error('exploration-result-binding-frozen')
      const assertCurrent = async () => {
        host.guard()
        if (
          !host.clean() ||
          host.actionVersion() !== e.check.actionVersion ||
          host.page().url() !== e.check.url
        )
          throw Error('exploration-state-stale-or-intervened')
        const state = await e.before.snapshot.evaluate(
          ({ root, url, states }, input) => {
            if (root !== document.documentElement || url !== location.href)
              return 'document-changed'
            const nodes = [...document.querySelectorAll(input.selector)]
            if (nodes.length !== 1) return 'result-missing-or-ambiguous'
            const n = nodes[0]!,
              before = states.get(n)
            if (n.matches('html,body,button,input,select,textarea,a,[role="button"],[role="link"]'))
              return 'result-is-not-feedback'
            if (before?.truncated) return 'result-baseline-truncated'
            const r = n.getBoundingClientRect(),
              s = getComputedStyle(n)
            if (r.width <= 0 || r.height <= 0 || s.display === 'none' || s.visibility === 'hidden')
              return 'result-not-visible'
            const wasSatisfied =
              before &&
              (input.condition === 'text-equals'
                ? before.text === input.expected
                : before.text.includes(input.expected))
            // Existing visible content or a previously true predicate is not the original action's effect.
            if (before?.visible && wasSatisfied) return 'result-predicate-already-true'
            if (before?.visible && before.text === (n.textContent ?? '').trim())
              return 'result-unchanged'
            return null
          },
          { selector, condition: e.check.effect!.condition, expected: e.check.effect!.expected },
        )
        if (state) throw Error('exploration-' + state)
        const h = e.inspected.get(selector)!
        if (
          !(await h
            .evaluate((n, s) => n.isConnected && document.querySelector(s) === n, selector)
            .catch(() => false))
        )
          throw Error('exploration-inspected-result-replaced')
        if (
          recoveryDigest(await host.hashEvidence(Object.keys(e.check.evidenceHashes))) !==
          recoveryDigest(e.check.evidenceHashes)
        )
          throw Error('exploration-source-evidence-changed')
      }
      await assertCurrent()
      e.selector = selector
      e.attempts++
      const input = { selector, ...e.check.effect }
      const result = await measure(structuredClone(e.check), input, assertCurrent)
      await assertCurrent()
      if (['verified', 'failed'].includes(result.outcome)) e.done = true
      return result
    },
    async dispose() {
      await Promise.allSettled([...captures].map((c) => c.snapshot.dispose()))
      await Promise.allSettled(
        [...checks.values()].flatMap((e) => [...e.inspected.values()].map((h) => h.dispose())),
      )
    },
  }
}
