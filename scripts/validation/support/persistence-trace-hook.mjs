// Explicit test preload only. No environment switch means no imports/patches/database access.
if (process.env.R0_PERSISTENCE_TRACE_DIR) {
  const { installPersistenceTrace } = await import('./persistence-trace.ts')
  const trace = installPersistenceTrace({
    directory: process.env.R0_PERSISTENCE_TRACE_DIR,
    maxRecords: Number(process.env.R0_PERSISTENCE_TRACE_MAX_RECORDS ?? 4000),
    readBack: process.env.R0_PERSISTENCE_TRACE_READ_BACK === '1',
    captureOnMismatch: process.env.R0_PERSISTENCE_TRACE_CAPTURE === '1',
  })
  process.on('exit', () => trace.stop())
}
