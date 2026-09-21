import 'dotenv/config'

const ARENA_API = `http://localhost:${process.env.ARENA_API_PORT ?? 4174}`

async function main() {
  const caseArg = process.argv.find((a) => a.startsWith('--case='))?.split('=')[1]
    ?? process.argv[process.argv.indexOf('--case') + 1]
    ?? 'C0'

  const variant = caseArg.toUpperCase()

  console.log(`[arena:reset] resetting to variant ${variant}...`)

  const res = await fetch(`${ARENA_API}/__control/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variant }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error(`[arena:reset] failed: ${res.status} ${body}`)
    process.exit(1)
  }

  const data = await res.json()
  console.log(`[arena:reset] reset complete:`, data)

  console.log(`[arena:reset] verifying...`)
  const verify = await fetch(`${ARENA_API}/__control/verify`, { method: 'POST' })
  const checks = await verify.json()
  console.log(`[arena:reset] verification:`, checks)
}

main().catch((err) => {
  console.error('[arena:reset] error:', err)
  process.exit(1)
})
