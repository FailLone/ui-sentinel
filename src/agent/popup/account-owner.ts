import { resolve } from 'node:path'
import { openCampaignSession } from '../../../evaluation/support/campaign-session.ts'

type Session = Awaited<ReturnType<typeof openCampaignSession>>

/** One parent owns the existing account lease; requests keep separate original ledger rows. */
export function createPopupAccountOwner(open: typeof openCampaignSession = openCampaignSession) {
  let opening: Promise<Session> | undefined
  let identity: string | undefined
  let users = 0
  let closing = false
  let closed: Promise<void> | undefined
  let drained: (() => void) | undefined
  return {
    async acquire(configuration: { directory: string; limitUsd: number }) {
      if (closing) throw Error('popup-account-owner-closed')
      const key = JSON.stringify([resolve(configuration.directory), configuration.limitUsd])
      if (identity && identity !== key) throw Error('popup-account-owner-mismatch')
      identity = key
      opening ??= open(configuration.directory, String(configuration.limitUsd))
      users++
      let released = false
      const release = () => {
        if (released) return
        released = true
        if (--users === 0) drained?.()
      }
      try {
        return { session: await opening, release }
      } catch (error) {
        release()
        throw error
      }
    },
    close() {
      closing = true
      return (closed ??= (async () => {
        if (users)
          await new Promise<void>((resolve) => {
            drained = resolve
          })
        const session = await opening?.catch(() => undefined)
        await session?.close()
      })())
    },
  }
}

export type PopupAccountOwner = ReturnType<typeof createPopupAccountOwner>
