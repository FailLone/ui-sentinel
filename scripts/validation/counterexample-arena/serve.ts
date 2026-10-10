import { cases, caseById } from '../../../evaluation/private/counterexample-arena/catalog.ts'
import { startArena } from '../../../evaluation/fixtures/counterexample-arena/server.ts'

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--list') {
  console.log(
    cases.map((c) => `${c.id}\t${c.family}\t${c.viewport.width}x${c.viewport.height}`).join('\n'),
  )
} else {
  if (
    args[0] !== '--case' ||
    !args[1] ||
    ![2, 4].includes(args.length) ||
    (args.length === 4 && args[2] !== '--port')
  )
    throw Error('Usage: --list | --case CA01 [--port 4190]')
  const port = args[3] === undefined ? 4190 : Number(args[3])
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('Invalid port')
  const selected = caseById(args[1])
  const arena = await startArena(selected.html(), port)
  console.log(
    JSON.stringify({
      entryUrl: arena.origin + '/',
      viewport: selected.viewport,
      reset: 'New browser context and GET /; stop this process to change case.',
    }),
  )
  let closing = false
  const close = () => {
    if (closing) return
    closing = true
    void arena.close().catch((e) => {
      console.error(e)
      process.exitCode = 1
    })
  }
  process.once('SIGINT', close)
  process.once('SIGTERM', close)
}
