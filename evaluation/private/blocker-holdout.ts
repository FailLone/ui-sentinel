import { chromium } from 'playwright'
import type { BlockerProfile } from '../fixtures/blocker.ts'
import type { RunReport } from '../../src/shared/types.ts'
import type { IndependentEvidence } from './evaluator.ts'
import type { PageSnapshot } from '../../src/rules/types.ts'

export const blockerHoldoutGoal =
  'Reserve one seat for the selected studio session. Inspect access to the final confirmation and the resulting business outcome. Announcements must not prevent reservation. Preserve evidence before using an available recovery control. Only one reservation is permitted; inspect novel observed issues as necessary.'
export async function verifyBlockerHoldout(
  profile: BlockerProfile,
  url: string,
  controlUrl: string,
  token: string,
) {
  const control = async (path: string, body?: unknown): Promise<any> => {
    const response = await fetch(controlUrl + path, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw Error('Private fixture control failed')
    return response.json()
  }
  await control('/__control/reset', { profile })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 768 } })
  try {
    await page.goto(url)
    await page.getByRole('button', { name: 'Review selection', exact: true }).click()
    const confirm = page.getByRole('button', { name: 'Complete reservation', exact: true })
    const intercepted = await confirm.evaluate((el) => {
      const b = el.getBoundingClientRect()
      return !el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2))
    })
    if (!intercepted) throw Error('Fixture did not intercept confirmation')
    const recover = page.getByRole('button', { name: 'Keep my original selection', exact: true })
    if (profile === 'J0') {
      if (await recover.count()) throw Error('Unexpected recovery control')
    } else {
      await recover.click()
      await confirm.click()
      await page.getByRole('heading', { name: 'Booking confirmed', exact: true }).waitFor()
    }
    const state = await control('/__control/state')
    if (state.orders.length !== (profile === 'J0' ? 0 : 1)) throw Error('Wrong fixture write count')
    return { valid: true, intercepted: true, recoveryControlVerified: true }
  } finally {
    await browser.close()
    await control('/__control/reset', { profile })
    if ((await control('/__control/state')).orders.length) throw Error('Reset retained writes')
  }
}
export function evaluateBlockerHoldout(
  report: RunReport,
  profile: BlockerProfile,
  evidence: IndependentEvidence,
) {
  const findings = report.findings.filter((f) => f.validationStatus === 'supported')
  const findingEvidence =
    findings.length === 1 &&
    findings.every((f) => {
      const refs = f.evidenceRefs.map((id) => evidence.artifacts[id])
      return (
        f.ruleId === 'overlay-blocking' &&
        refs.every((a) => a?.exists) &&
        refs.some((a) => a.type === 'screenshot') &&
        refs.some(
          (a) =>
            a.type === 'snapshot' &&
            (a.data as PageSnapshot).elements.some(
              (e) =>
                e.text === 'Complete reservation' &&
                e.visible &&
                e.hitSamples?.length === 5 &&
                e.hitSamples.every((s) => s.relation === 'unrelated'),
            ),
        )
      )
    })
  const order = evidence.backend.orders[0]
  const outcome =
    profile === 'J0'
      ? report.status === 'blocked' &&
        report.businessResult === 'unknown' &&
        evidence.backend.orders.length === 0 &&
        report.unexploredBranches.length > 0
      : report.status === 'completed' &&
        report.businessResult === 'success' &&
        evidence.backend.orders.length === 1 &&
        order?.status === 'paid' &&
        evidence.events.some(
          (e) =>
            e.type === 'business:verified' &&
            (e.payload.verifiedBusiness as any)?.orderId === order.id,
        )
  const assertions = {
    fixtureValid: evidence.fixtureValid,
    findingEvidence,
    outcome,
    explicitFinish: evidence.events.some((e) => e.type === 'finish:accepted'),
    noIntervention: !evidence.events.some((e) => e.type === 'execution:intervention'),
    noOpenHypotheses: !evidence.hypotheses.some((h) => ['open', 'inconclusive'].includes(h.status)),
    artifactsAvailable: Object.values(evidence.artifacts).every((a) => a.exists),
  }
  return { overallPass: Object.values(assertions).every(Boolean), assertions }
}
