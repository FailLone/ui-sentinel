import { chromium } from 'playwright'

/**
 * Private verifier for the dataset-export arena.
 *
 * This module knows the answer key: which variant does what, and what the browser must therefore
 * observe. It is never reachable from the arena bundle or the public API - the browser is only
 * ever shown the public protocol, so an agent cannot read the truth it is being graded against.
 */
export type ExportVariantId = 'E0' | 'E1' | 'E2' | 'E3' | 'E4'

/** What the page's outcome heading can say. `pending` is not a terminal state. */
type Outcome = 'pending' | 'succeeded' | 'rejected' | 'failed'

export const exportControlUrl = () => `http://127.0.0.1:${process.env.EXPORT_CONTROL_PORT ?? 4185}`
export const exportArenaUrl = () =>
  process.env.EXPORT_ARENA_URL ?? `http://127.0.0.1:${process.env.EXPORT_ARENA_PORT ?? 4183}`

export async function exportControlRequest(path: string, body?: unknown): Promise<any> {
  const token = process.env.EXPORT_CONTROL_TOKEN
  if (!token) throw new Error('EXPORT_CONTROL_TOKEN required for the private export controller')
  const response = await fetch(`${exportControlUrl()}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Private export controller ${path}: ${response.status}`)
  return response.json()
}

export async function assertExportIdle(): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? 4111}/api/health`, {
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('Cannot verify execution queue idle')
  const health = (await response.json()) as { activeRuns?: number; queuedRuns?: number }
  if (health.activeRuns !== 0 || health.queuedRuns !== 0)
    throw new Error('Queue must be explicitly idle before reset')
}

/** The private business truth a grader checks. `attempts` is only meaningful where a retry is
 * expected, so it is optional and omitted when no retry happened. */
export interface ExportTruth {
  readonly creates: number
  readonly retries: number
  readonly jobs: number
  readonly artifacts: number
  readonly attempts?: readonly number[]
}

/** What each variant must produce, stated once so the verifier and the grader agree. */
const EXPECTED: Record<ExportVariantId, ExportTruth> = {
  // A healthy export: one create, one job, one artifact, no retry.
  E0: { creates: 1, retries: 0, jobs: 1, artifacts: 1, attempts: [0] },
  // A recoverable failure: the retry is a real second attempt of the same job.
  E1: { creates: 1, retries: 1, jobs: 1, artifacts: 1, attempts: [0, 1] },
  // The same failure, but recovery is unavailable: no retry, no artifact.
  E2: { creates: 1, retries: 0, jobs: 1, artifacts: 0, attempts: [0] },
  // A legitimate business rejection, not a defect.
  E3: { creates: 1, retries: 0, jobs: 1, artifacts: 0, attempts: [0] },
  // E1's business under different wording and layout.
  E4: { creates: 1, retries: 1, jobs: 1, artifacts: 1, attempts: [0, 1] },
}

export function expectedTruth(variant: ExportVariantId): ExportTruth {
  return EXPECTED[variant]
}

/**
 * Reset to a variant and verify it through a *real browser*.
 *
 * The checks below are observations, not assertions about internal flags: the page must genuinely
 * offer an unselected choice, the failure must genuinely present a recovery control, and that
 * control must genuinely be operable (or not) as the variant declares. A variant whose public
 * behaviour disagreed with its expected truth would be caught here rather than in a later run.
 */
export async function resetAndVerifyExport(variant: ExportVariantId) {
  await assertExportIdle()
  await exportControlRequest('/__control/reset', { variant })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  try {
    await page.goto(exportArenaUrl())

    // F01: nothing is selected until the user selects it.
    const radios = page.getByRole('radio')
    await radios.first().waitFor({ state: 'visible' })
    const initialChecked = await radios.evaluateAll(
      (els) => els.filter((el) => (el as HTMLInputElement).checked).length,
    )
    if (initialChecked !== 0) throw new Error('Export options must start unselected')

    // The page must not disclose which variant is running, in markup or in fetched resources.
    const markup = await page.content()
    if (/E[0-4]\b/.test(markup)) throw new Error('Variant identifier leaked into the page')

    await page.getByRole('radio', { name: 'Orders (Q3)' }).click()
    await page.getByRole('radio', { name: 'CSV' }).click()
    await page.getByRole('button', { name: /start export|generate export/i }).click()

    // F03: the create response is processing, and the status read drives the terminal state.
    await page.getByText(/job-/).waitFor({ state: 'visible' })
    const jobId = ((await page.getByText(/job-/).textContent()) ?? '').replace(/^Job\s*/, '').trim()
    if (!/^job-[0-9a-f]+$/.test(jobId)) throw new Error(`Unusable job id on the page: ${jobId}`)

    // Read the heading, which is the single element naming the outcome. Body text can contain the
    // same words, which is what made an earlier text-based locator ambiguous.
    const readOutcome = async (): Promise<Outcome> => {
      const text = (await page.locator('.result h3').textContent()) ?? ''
      // The terminal state arrives from the server, so the page is correct to show processing for
      // a moment: "in progress" is not an outcome, it is the absence of one.
      if (/in progress/i.test(text)) return 'pending'
      // The negative patterns are tested first because they are the specific ones. E4's rewritten
      // failure heading - "Export could not be delivered" - contains the word "delivered", so a
      // success test placed ahead of it would read a failure as a success.
      if (/could not|failed/i.test(text)) return 'failed'
      if (/not permitted/i.test(text)) return 'rejected'
      if (/complete|delivered/i.test(text)) return 'succeeded'
      return 'pending'
    }

    /**
     * Poll until the visible outcome is terminal *and* different from `previous`.
     *
     * Excluding the previous value is what makes recovery observable. After the recovery control
     * is clicked the page still shows the failure until the retry response lands, so a helper that
     * only waited for "some terminal state" would read that stale failure straight back and report
     * a successful recovery as a failure.
     */
    const settle = async (timeout: number, previous?: Outcome): Promise<Outcome> => {
      await page.locator('.result h3').waitFor({ state: 'visible', timeout })
      const deadline = Date.now() + timeout
      let seen: Outcome = 'pending'
      while (Date.now() < deadline) {
        seen = await readOutcome()
        if (seen !== 'pending' && seen !== previous) return seen
        await page.waitForTimeout(100)
      }
      return seen
    }

    const firstOutcome = await settle(10_000)
    const expectedFirst = variant === 'E0' ? 'succeeded' : variant === 'E3' ? 'rejected' : 'failed'
    if (firstOutcome !== expectedFirst)
      throw new Error(`Variant ${variant}: expected ${expectedFirst}, saw ${firstOutcome}`)

    // F04: recovery. Three observations, deliberately kept apart, because they are what tell a real
    // defect from a benign one:
    //
    //   - `recoveryControl`  - is there a recovery control, and does it look operable?
    //   - `retrySucceeded`   - does using it actually drive the job to a success?
    //   - `backendPermitsRetry` - does the API itself allow the retry?
    //
    // E1 and E2 publish the same failure payload and the same retry terms, so the payload cannot
    // separate them. The defect is exactly the gap between the first and third observation: the
    // backend permits the retry, but the workspace does not offer a usable control. A probe that
    // only tried the control would call that "no recovery offered" and learn nothing about which
    // side is at fault.
    const recovery = page.getByRole('button', { name: /try again|regenerate export/i })
    // A control that is going to be offered must have settled before it is judged: while the
    // prerequisite request is in flight the workspace shows a placeholder, not the control's final
    // state. Only a failure can produce a recovery control, so the other variants skip the wait.
    if (firstOutcome === 'failed')
      await recovery.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {})

    const recoveryControl: 'usable' | 'inoperable' | 'absent' = (await recovery.count())
      ? (await recovery.isDisabled())
        ? 'inoperable'
        : 'usable'
      : 'absent'

    // The backend's own answer, read from the public protocol before the recovery is used. This
    // has to happen first: a spent retry clears the term, so reading it afterwards would describe
    // the post-recovery job rather than the failure being judged.
    const readEligibility = async () =>
      (await fetch(`${exportArenaUrl()}/api/exports/${jobId}/eligibility`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)) as {
        backendPermitsRetry?: boolean
        prerequisite?: { met: boolean }
      } | null
    const eligibility = await readEligibility()
    const backendPermitsRetry = eligibility?.backendPermitsRetry === true
    const prerequisiteMet = eligibility?.prerequisite?.met === true

    let retrySucceeded = false
    if (recoveryControl === 'usable') {
      await recovery.click()
      // Bounded: a recovery that works settles in well under a second here.
      retrySucceeded = (await settle(4_000, firstOutcome)) === 'succeeded'
    } else if (recoveryControl === 'inoperable') {
      // A present-but-inoperable control is still probed, because "inoperable" must mean it really
      // cannot be operated - not merely that it carries a disabled attribute.
      let operable = true
      try {
        await recovery.click({ trial: true, timeout: 700 })
      } catch {
        operable = false
      }
      if (operable) throw new Error(`${variant}: control is marked inoperable but is operable`)
    }

    const shouldRecover = variant === 'E1' || variant === 'E4'
    if (shouldRecover && !retrySucceeded)
      throw new Error(`${variant}: recovery was offered but did not complete`)
    if (!shouldRecover && retrySucceeded)
      throw new Error(`${variant}: recovery completed but the variant declares no recovery`)
    if (variant === 'E2') {
      // F04: this is the whole variant. The workspace offers no usable control and publishes an
      // unmet prerequisite, while the API itself permits the retry. The eligibility resource must
      // agree, since it is the source an agent is meant to consult.
      if (prerequisiteMet) throw new Error('E2 must publish an unmet recovery prerequisite')
      if (recoveryControl === 'usable')
        throw new Error('E2 recovery control must not be usable despite the backend permitting it')
      if (!backendPermitsRetry)
        throw new Error('E2 eligibility resource must report that the backend permits retry')
    }
    if (shouldRecover && !prerequisiteMet)
      throw new Error(`${variant}: the recovery prerequisite must be met`)
    // No variant may claim a recovery the backend refuses.
    if (retrySucceeded && !backendPermitsRetry)
      throw new Error(`${variant}: recovered against a backend that refuses the retry`)

    // The page must still be showing the same job it created: recovery is a second attempt of one
    // entity, not a fresh export that happens to end well.
    const shownId = ((await page.getByText(/job-/).textContent()) ?? '')
      .replace(/^Job\s*/, '')
      .trim()
    if (shownId !== jobId)
      throw new Error(`${variant}: page moved from ${jobId} to ${shownId} during recovery`)

    const state = (await exportControlRequest('/__control/state')) as {
      creates: number
      retries: number
      jobs: number
      artifacts: number
      requests: readonly { method: string; path: string }[]
    }

    // The status polls and the retry must address the *same* entity the create returned. A poll of
    // some other job, or a retry that quietly creates a second one, would still produce plausible
    // numbers - so the identity is checked directly rather than inferred from the counters.
    const paths = state.requests.map((r) => `${r.method} ${r.path}`)
    for (const entry of paths) {
      const match = /^(GET|POST) \/api\/exports\/(job-[0-9a-f]+)(\/[a-z]+)?$/.exec(entry)
      if (match && match[2] !== jobId)
        throw new Error(`${variant}: request ${entry} targets a different job than ${jobId}`)
    }

    // E2's claim that "the backend really permits the retry" is proved by asking it, not by
    // trusting the eligibility resource's own report. This runs *after* the truth snapshot above,
    // so the extra retry cannot contaminate the counts the variant is graded on.
    if (variant === 'E2') {
      const response = await fetch(`${exportArenaUrl()}/api/exports/${jobId}/retry`, {
        method: 'POST',
      })
      if (!response.ok)
        throw new Error(
          `E2 backend refused the retry (${response.status}); the defect would not be UI-only`,
        )
      const retried = (await response.json()) as { attempt?: number }
      if (retried.attempt !== 1)
        throw new Error(`E2 retry did not advance the attempt (saw ${retried.attempt})`)
    }

    return {
      firstOutcome,
      recoveryControl,
      retrySucceeded,
      backendPermitsRetry,
      prerequisiteMet,
      jobId,
      truth: {
        creates: state.creates,
        retries: state.retries,
        jobs: state.jobs,
        artifacts: state.artifacts,
      },
      requests: paths,
    }
  } finally {
    await browser.close()
  }
}

/** Assert the observed private truth matches what the variant declares. */
export function assertTruth(variant: ExportVariantId, truth: ExportTruth): void {
  const expected = EXPECTED[variant]
  for (const key of ['creates', 'retries', 'jobs', 'artifacts'] as const)
    if (truth[key] !== expected[key])
      throw new Error(
        `Variant ${variant}: expected ${key}=${expected[key]}, observed ${truth[key]}`,
      )
}
