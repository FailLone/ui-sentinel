import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { installInterruptGuard } from './interrupt-guard.ts'

/**
 * SIGINT handling for the paid runners (plan P3.4, acceptance R06).
 *
 * R06: "cancel and wrap up, the remaining rows stay not-run; no automatic reconcile". And the exit
 * codes: "SIGINT after wrap-up returns 130". A runner that dies on the default signal handler would
 * leave the ledger lease held and the stage directory half-written, which is exactly the state the
 * acceptance says must not be silently resumable.
 *
 * The guard is tested with an injected emitter so it never has to raise a real signal.
 */

const emitter = () =>
  new EventEmitter() as unknown as Pick<NodeJS.Process, 'on' | 'off'> & {
    emit: (e: string) => void
  }

describe('interrupt guard (R06)', () => {
  it('runs the wrap-up once and reports interruption on the first signal', async () => {
    const signals = emitter()
    const wrapUp = vi.fn(async () => {})
    const exit = vi.fn()
    const guard = installInterruptGuard({ signals, wrapUp, exit })

    signals.emit('SIGINT')
    // The wrap-up is async; let it settle.
    await vi.waitFor(() => expect(wrapUp).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(130))
    expect(guard.interrupted()).toBe(true)
  })

  it('exits 130 after wrap-up, and never 0 - an interrupted batch is not a pass', async () => {
    const signals = emitter()
    const exit = vi.fn()
    installInterruptGuard({ signals, wrapUp: async () => {}, exit })

    signals.emit('SIGINT')

    await vi.waitFor(() => expect(exit).toHaveBeenCalled())
    expect(exit).toHaveBeenCalledWith(130)
  })

  it('does not run the wrap-up twice when a second signal arrives', async () => {
    const signals = emitter()
    const wrapUp = vi.fn(async () => new Promise<void>((r) => setTimeout(r, 10)))
    const exit = vi.fn()
    installInterruptGuard({ signals, wrapUp, exit })

    signals.emit('SIGINT')
    signals.emit('SIGINT')

    await vi.waitFor(() => expect(exit).toHaveBeenCalled())
    expect(wrapUp).toHaveBeenCalledTimes(1)
  })

  it('reports not-yet-interrupted before any signal', () => {
    const guard = installInterruptGuard({
      signals: emitter(),
      wrapUp: async () => {},
      exit: vi.fn(),
    })
    expect(guard.interrupted()).toBe(false)
  })

  it('stops responding after dispose, so a finished run is not exited by a late signal', () => {
    const signals = emitter()
    const wrapUp = vi.fn(async () => {})
    const exit = vi.fn()
    const guard = installInterruptGuard({ signals, wrapUp, exit })

    guard.dispose()
    signals.emit('SIGINT')

    expect(wrapUp).not.toHaveBeenCalled()
    expect(exit).not.toHaveBeenCalled()
  })
})
