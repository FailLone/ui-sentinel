import { chromium } from 'playwright'
import type { RunReport } from '../../src/shared/types.ts'
import type { IndependentEvidence } from './evaluator.ts'
import type { PageSnapshot } from '../../src/rules/types.ts'
import type { TransitionObservation } from '../../src/rules/transition.ts'
import type { HoldoutProfile } from '../fixtures/recovery.ts'

export const holdoutGoal =
  'Reserve one workshop place through the visible attendance and confirmation steps. Inspect access to primary actions, response, outcome communication and recovery. Retryable failures must offer an operable recovery action within five seconds. Inspect recovery without making a second reservation. Do not mistake a clearly stated unmet prerequisite for a broken control.'
export async function verifyHoldout(
  profile: HoldoutProfile,
  url: string,
  controlUrl: string,
  token: string,
) {
  const control = async (path: string, body?: unknown): Promise<any> => {
    const r = await fetch(controlUrl + path, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(5000),
    })
    if (!r.ok) throw Error(`Holdout control ${r.status}`)
    return r.json()
  }
  await control('/__control/reset', { profile })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 768 } })
  try {
    await page.goto(url)
    await page.getByRole('button', { name: 'Choose a place', exact: true }).click()
    if (await page.getByRole('button', { name: 'Review reservation', exact: true }).isEnabled())
      throw Error('Prerequisite not enforced')
    await page
      .getByRole('checkbox', { name: 'I accept the attendance policy', exact: true })
      .check()
    await page.getByRole('button', { name: 'Review reservation', exact: true }).click()
    const button = page.getByRole('button', { name: 'Confirm reservation', exact: true })
    await button.click({ trial: true })
    await button.click()
    await page.getByText('Reference:', { exact: false }).waitFor()
    const state = await control('/__control/state')
    const order = state.orders[0]
    if (
      state.orders.length !== 1 ||
      order.status !== (profile === 'H0' ? 'paid' : 'failed') ||
      !(await page.locator('body').innerText()).includes(order.id)
    )
      throw Error('Holdout order/UI mismatch')
    if (profile !== 'H0') {
      const recovery = page.getByRole('button', { name: 'Resume reservation', exact: true })
      if (profile === 'H1') {
        await recovery.waitFor({ state: 'visible' })
        const deadline = Date.now() + 5000
        while (!(await recovery.isEnabled()) && Date.now() < deadline)
          await page.waitForTimeout(100)
        if (!(await recovery.isEnabled())) throw Error('Healthy recovery did not become available')
        await recovery.click({ trial: true })
      } else {
        const deadline = Date.now() + 5250
        while (Date.now() < deadline) {
          if (await recovery.isEnabled()) throw Error('Stuck recovery unexpectedly enabled')
          await page.waitForTimeout(200)
        }
      }
    }
    return {
      valid: true,
      prerequisiteVerified: true,
      orderUiVerified: true,
      recoveryVerified: profile !== 'H0',
    }
  } finally {
    await browser.close()
    await control('/__control/reset', { profile })
    if ((await control('/__control/state')).orders.length)
      throw Error('Holdout reset retained orders')
  }
}

/** Independent oracle: exact actual recovery control, not a retry-label heuristic. */
export function evaluateHoldout(
  report: RunReport,
  profile: HoldoutProfile,
  evidence: IndependentEvidence,
) {
  const supported = report.findings.filter((f) => f.validationStatus === 'supported')
  const order = evidence.backend.orders.length === 1 ? evidence.backend.orders[0] : undefined
  const snapshots = Object.values(evidence.artifacts)
    .filter(
      (a) =>
        a.exists &&
        a.type === 'snapshot' &&
        Array.isArray((a.data as PageSnapshot | undefined)?.elements),
    )
    .map((a) => a.data as PageSnapshot)
  const matchingUi =
    !!order &&
    snapshots.some((s) => s.elements?.some((e) => e.visible && e.text.includes(order.id)))
  const response = evidence.events.find(
    (e) => e.type === 'business:response' && e.payload.orderId === order?.id,
  )?.payload
  const findingsValid =
    profile === 'H2'
      ? !!order &&
        supported.length === 1 &&
        supported.every((f) => {
          if (
            f.source !== 'agent' ||
            !f.hypothesisId ||
            !evidence.hypotheses.some((h) => h.id === f.hypothesisId && h.status === 'supported')
          )
            return false
          const refs = f.evidenceRefs.map((id) => evidence.artifacts[id])
          if (!refs.every((a) => a?.exists) || !refs.some((a) => a.type === 'screenshot'))
            return false
          return refs
            .filter((a) => a.type === 'measurement')
            .some((a) => {
              const m = a.data as TransitionObservation & { selector?: string }
              if (
                !m ||
                m.condition !== 'element-actionable' ||
                !Number.isFinite(m.startedAtMs) ||
                !m.samples?.length
              )
                return false
              const deadline = m.startedAtMs + 5000
              const samples = m.samples
                .filter((s) => s.atMs >= m.startedAtMs && s.atMs <= deadline)
                .sort((a, b) => a.atMs - b.atMs)
              const target = samples[0]?.target
              return (
                !!target &&
                Number.isFinite(m.observedUntilMs) &&
                m.observedUntilMs >= deadline &&
                samples.length >= 11 &&
                samples.every(
                  (s, i) =>
                    s.target === target &&
                    s.value === false &&
                    (!i || s.atMs - samples[i - 1]!.atMs <= 500),
                ) &&
                samples[0]!.atMs - m.startedAtMs <= 250 &&
                deadline - samples.at(-1)!.atMs <= 250 &&
                refs.some(
                  (a) =>
                    a.type === 'snapshot' &&
                    (a.data as PageSnapshot | undefined)?.elements?.some(
                      (e) => e.visible && e.text.includes(order!.id),
                    ) &&
                    (a.data as PageSnapshot | undefined)?.elements?.some(
                      (e) =>
                        e.tag === 'button' &&
                        e.text === 'Resume reservation' &&
                        e.visible &&
                        e.enabled === false &&
                        e.selector === m.selector,
                    ),
                )
              )
            })
        })
      : supported.length === 0
  const assertions = {
    fixtureValid: evidence.fixtureValid && !evidence.invalidReason,
    oneMatchingOrder:
      !!order && order.status === (profile === 'H0' ? 'paid' : 'failed') && matchingUi,
    matchingResponse:
      !!response &&
      (profile === 'H0'
        ? response.success === true && response.status === 'paid'
        : response.success === false && response.status === 'failed' && response.canRetry === true),
    healthyRecoveryObserved:
      profile !== 'H1' ||
      snapshots.some((s) =>
        s.elements?.some(
          (e) =>
            e.tag === 'button' &&
            e.text === 'Resume reservation' &&
            e.visible &&
            e.enabled === true &&
            !!e.hitSamples?.length &&
            e.hitSamples.every((h) => h.relation === 'self' || h.relation === 'descendant'),
        ),
      ),
    correctOutcome:
      report.businessResult === (profile === 'H0' ? 'success' : 'unknown') &&
      report.status === (profile === 'H0' ? 'completed' : 'blocked'),
    explicitFinish: evidence.events.some((e) => e.type === 'finish:accepted'),
    normalStop: ['goal-reached', 'blocked'].includes(report.stopReason ?? ''),
    findingsValid,
    noUnresolvedHypotheses: !evidence.hypotheses.some((h) =>
      ['open', 'inconclusive'].includes(h.status),
    ),
    evidencePresent: Object.values(evidence.artifacts).every((a) => a.exists),
    noRepeatedWrite: !evidence.events.some((e) => e.type === 'write:denied'),
    budget:
      report.usage.modelCalls <= evidence.budget.maxModelCalls &&
      report.usage.actions <= evidence.budget.maxActions &&
      report.usage.elapsedMs <= evidence.budget.totalTimeoutMs + 1000,
    noAnswerLeak: !evidence.events.some((e) =>
      /\bH[012]\b|__control/.test(JSON.stringify(e.payload)),
    ),
  }
  return { profile, overallPass: Object.values(assertions).every(Boolean), assertions }
}
