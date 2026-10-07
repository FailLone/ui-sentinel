import { errors, type Locator } from 'playwright'
import { measureElement } from './investigation/measure.ts'

/** Only a failed trial corroborated by current, bound geometry is a negative measurement. */
export async function measureUiProbe(locator: Locator, guard: () => void, timeout: number) {
  guard()
  if ((await locator.count()) !== 1) throw Error('probe-target-not-unique')
  const handle = await locator.elementHandle()
  if (!handle) throw Error('probe-target-missing')
  const page = locator.page()
  const url = page.url()
  const sameTarget = async () => {
    guard()
    if (page.url() !== url || (await locator.count()) !== 1) throw Error('probe-target-changed')
    const current = await locator.elementHandle()
    try {
      if (
        !current ||
        !(await handle.evaluate((node, other) => node.isConnected && node === other, current))
      )
        throw Error('probe-target-changed')
    } finally {
      await current?.dispose()
    }
  }
  try {
    await sameTarget()
    const before = await measureElement(handle)
    let trialError: unknown
    try {
      await handle.click({ trial: true, timeout })
    } catch (error) {
      trialError = error
    }
    await sameTarget()
    const after = await measureElement(handle)
    guard()
    const intercepted = (m: typeof before) =>
      m.exists === true &&
      m.displayed === true &&
      m.enabled === true &&
      m.viewportFraction === 1 &&
      m.unclippedFraction === 1 &&
      m.hitFraction === 0
    if (
      trialError &&
      !(trialError instanceof errors.TimeoutError && intercepted(before) && intercepted(after))
    )
      throw trialError
    return {
      version: 1 as const,
      url,
      outcome: trialError ? ('intercepted' as const) : ('actionable' as const),
      method: 'bound-trial-and-geometry' as const,
      before,
      after,
      dispatched: false as const,
    }
  } finally {
    await handle.dispose()
  }
}
