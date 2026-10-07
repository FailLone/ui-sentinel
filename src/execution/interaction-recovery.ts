import { randomUUID, createHash } from 'node:crypto'
import type { Page, ElementHandle } from 'playwright'
import type { InteractionVerification } from './interaction-verification.ts'

export type RecoveryCheck = {
  checkRef: string
  actionId: string
  itemId: string
  actionVersion: number
  url: string
  input: InteractionVerification
  evidenceHashes: Record<string, string>
}
export const recoveryDigest = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')
/** Run-local capabilities. The model supplies only an opaque reference, never a new expectation. */
export function createInteractionRecovery(host: {
  page(): Page
  actionVersion(): number
  clean(): boolean
  guard(): void
  hashEvidence(refs: readonly string[]): Promise<Record<string, string>>
}) {
  const checks = new Map<
    string,
    { check: RecoveryCheck; root: ElementHandle<Element>; attempts: number; done: boolean }
  >()
  return {
    async register(
      input: Omit<RecoveryCheck, 'checkRef' | 'actionVersion' | 'url' | 'evidenceHashes'>,
      refs: readonly string[],
    ) {
      host.guard()
      const root = await host.page().locator('html').elementHandle()
      if (!root || !host.clean() || !refs.length) throw Error('recovery-source-unavailable')
      const check: RecoveryCheck = {
        ...structuredClone(input),
        checkRef: randomUUID(),
        actionVersion: host.actionVersion(),
        url: host.page().url(),
        evidenceHashes: await host.hashEvidence(refs),
      }
      host.guard()
      checks.set(check.checkRef, { check, root, attempts: 0, done: false })
      return structuredClone(check)
    },
    available() {
      return [...checks.values()]
        .filter((e) => !e.done && e.attempts < 2 && e.check.actionVersion === host.actionVersion())
        .map((e) => ({
          checkRef: e.check.checkRef,
          actionId: e.check.actionId,
          itemId: e.check.itemId,
          attemptsRemaining: 2 - e.attempts,
        }))
    },
    async run<T extends { outcome: string }>(
      ref: string,
      measure: (check: RecoveryCheck, assertCurrent: () => Promise<void>) => Promise<T>,
    ): Promise<T> {
      const entry = checks.get(ref)
      if (!entry || entry.done || entry.attempts >= 2) throw Error('recovery-reference-unavailable')
      const assertCurrent = async () => {
        host.guard()
        if (
          !host.clean() ||
          host.actionVersion() !== entry.check.actionVersion ||
          host.page().url() !== entry.check.url ||
          !(await entry.root
            .evaluate((e) => e.isConnected && e === document.documentElement)
            .catch(() => false))
        )
          throw Error('recovery-state-stale-or-intervened')
        const hashes = await host.hashEvidence(Object.keys(entry.check.evidenceHashes))
        if (recoveryDigest(hashes) !== recoveryDigest(entry.check.evidenceHashes))
          throw Error('recovery-source-evidence-changed')
      }
      await assertCurrent()
      entry.attempts++
      const result = await measure(structuredClone(entry.check), assertCurrent)
      await assertCurrent()
      if (['verified', 'failed'].includes(result.outcome)) entry.done = true
      return result
    },
    async dispose() {
      await Promise.allSettled([...checks.values()].map((e) => e.root.dispose()))
      checks.clear()
    },
  }
}
