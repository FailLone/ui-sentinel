/** Called only after runBatch has drained and sealed its result. */
export function batchExitCode(result: unknown) {
  if (!result || typeof result !== 'object') return 0
  if ('stopped' in result && result.stopped) return 2
  return 'goalPassed' in result && result.goalPassed === false ? 3 : 0
}
