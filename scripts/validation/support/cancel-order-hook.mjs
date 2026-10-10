// Test-only scheduler. No SQL or production events are changed. Parent controls
// explicit barriers; never await an API request from inside its own commit lock.
import { createClient } from '@libsql/client'
import { chromium } from 'playwright'
const probe = createClient({ url: ':memory:' })
const prototype = Object.getPrototypeOf(probe)
const execute = prototype.execute
probe.close()
let mode = '',
  armed = false,
  terminalPaused = false,
  readSent = false
const gates = new Map()
process.on('message', (message) => {
  if (message.command === 'arm') {
    mode = message.mode
    armed = true
    readSent = false
    process.send?.({ event: 'armed', mode })
  } else if (message.command === 'release') gates.get(message.point)?.()
})
async function pause(point, runId) {
  await new Promise((resolve) => {
    gates.set(point, resolve)
    process.send?.({ event: 'paused', point, runId })
  })
  gates.delete(point)
  process.send?.({ event: 'released', point, runId })
}
prototype.execute = async function (stmt, ...rest) {
  if (typeof stmt !== 'object') return execute.call(this, stmt, ...rest)
  if (terminalPaused && !readSent && stmt.sql === 'SELECT * FROM runs WHERE id = ?') {
    readSent = true
    const result = await execute.call(this, stmt, ...rest)
    process.send?.({ event: 'cancel-read', status: result.rows[0]?.status })
    return result
  }
  if (
    mode === 'cancel-first' &&
    stmt.sql?.startsWith('INSERT INTO run_events') &&
    stmt.args[3] === 'run:cancel-requested'
  ) {
    await pause('cancellation', stmt.args[1])
  }
  if (
    mode === 'terminal-first' &&
    armed &&
    stmt.sql?.startsWith('UPDATE runs SET status') &&
    ['blocked', 'completed', 'execution-error'].includes(stmt.args[0])
  ) {
    armed = false
    terminalPaused = true
    await pause('terminal', stmt.args.at(-1))
    terminalPaused = false
  }
  return execute.call(this, stmt, ...rest)
}

const launch = chromium.launch
chromium.launch = async function (...args) {
  const browser = await launch.apply(this, args)
  const close = browser.close.bind(browser)
  browser.close = async (...closeArgs) => {
    const result = await close(...closeArgs)
    // Before terminal arbitration, after all browser activity, outside eventTail.
    if (mode === 'cancel-first' && armed) {
      armed = false
      await pause('finish')
    }
    return result
  }
  return browser
}
