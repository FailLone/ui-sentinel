// Explicit test preload only. No environment switch means no imports/patches/database access.
if (process.env.R0_PERSISTENCE_TRACE_DIR) {
  const { installPersistenceTrace } = await import('./persistence-trace.ts')
  const trace = installPersistenceTrace({
    directory: process.env.R0_PERSISTENCE_TRACE_DIR,
    maxRecords: Number(process.env.R0_PERSISTENCE_TRACE_MAX_RECORDS ?? 4000),
    readBack: process.env.R0_PERSISTENCE_TRACE_READ_BACK === '1',
    captureOnMismatch: process.env.R0_PERSISTENCE_TRACE_CAPTURE === '1',
  })
  // Test-only pause before the first artifact INSERT after a recorded action.
  if (process.env.R0_PERSISTENCE_BARRIER_DIR) {
    const { createClient } = await import('@libsql/client')
    const { access, writeFile } = await import('node:fs/promises')
    const { resolve } = await import('node:path')
    const probe = createClient({ url: ':memory:' })
    const prototype = Object.getPrototypeOf(probe),
      execute = prototype.execute
    probe.close()
    let actionRun = '',
      paused = false
    prototype.execute = async function (stmt, ...rest) {
      if (
        !paused &&
        actionRun &&
        stmt?.sql?.startsWith('INSERT INTO artifacts') &&
        stmt.args[1] === actionRun
      ) {
        paused = true
        const directory = resolve(process.env.R0_PERSISTENCE_BARRIER_DIR)
        await writeFile(
          resolve(directory, 'paused.json'),
          JSON.stringify({
            pid: process.pid,
            runId: actionRun,
            point: 'before-first-post-action-artifact-insert',
            at: new Date().toISOString(),
          }),
        )
        const deadline = Date.now() + 10000
        while (true) {
          if (
            await access(resolve(directory, 'release')).then(
              () => true,
              () => false,
            )
          )
            break
          if (Date.now() >= deadline) throw Error('test-persistence-barrier-timeout')
          await new Promise((r) => setTimeout(r, 5))
        }
        await writeFile(
          resolve(directory, 'released.json'),
          JSON.stringify({ at: new Date().toISOString() }),
        )
      }
      const result = await execute.call(this, stmt, ...rest)
      if (stmt?.sql?.startsWith('INSERT INTO run_events') && stmt.args[3] === 'action:executing')
        actionRun = stmt.args[1]
      return result
    }
  }
  process.on('exit', () => trace.stop())
}
