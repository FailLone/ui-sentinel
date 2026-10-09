/**
 * SIGINT handling for the paid runners (plan P3.4, acceptance R06).
 *
 * R06: cancel and wrap up, leaving the remaining rows `not-run`, with no automatic reconcile. The exit
 * codes add: SIGINT returns 130 after wrap-up. The default Node behaviour would exit immediately with
 * 130 but run nothing - leaving the campaign lease held and the stage directory half-written, which is
 * the state the acceptance says must not be silently resumable. So the signal is caught, the wrap-up
 * runs once (release the lease, stop the children, write what was recorded), and only then does the
 * process exit 130 - never 0, because an interrupted batch is not a pass.
 *
 * The signal source is injected, so the guard is tested without raising a real signal.
 */

export interface InterruptGuard {
  /** True once a signal has been received. Callers use it to stop starting new work. */
  interrupted(): boolean
  /** Stop listening. Called when the run finished normally, so a late signal cannot exit it. */
  dispose(): void
}

export function installInterruptGuard(input: {
  signals: Pick<NodeJS.Process, 'on' | 'off'>
  wrapUp: () => Promise<void>
  exit: (code: number) => void
  code?: number
}): InterruptGuard {
  let interrupted = false
  let running = false
  let disposed = false
  const code = input.code ?? 130

  const onSignal = () => {
    interrupted = true
    // A second Ctrl-C must not start a second wrap-up: the first is already releasing the lease and
    // stopping the children, and racing it would double-release or kill a half-written file.
    if (running || disposed) return
    running = true
    void input
      .wrapUp()
      .catch(() => {
        /* the process is exiting 130 either way; a wrap-up error must not become a success */
      })
      .finally(() => input.exit(code))
  }

  input.signals.on('SIGINT', onSignal)
  input.signals.on('SIGTERM', onSignal)

  return {
    interrupted: () => interrupted,
    dispose() {
      disposed = true
      input.signals.off('SIGINT', onSignal)
      input.signals.off('SIGTERM', onSignal)
    },
  }
}
