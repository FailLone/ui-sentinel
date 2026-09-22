import 'dotenv/config'
import { resetAndVerify } from '../../evaluation/private/controller.ts'
import { VARIANT_EXPECTATIONS, type VariantId } from '../../evaluation/private/answers.ts'
async function main() {
  const args = process.argv.slice(2)
  const index = args.indexOf('--case')
  const variant = (args.find((a) => a.startsWith('--case='))?.slice(7) ??
    (index >= 0 ? args[index + 1] : 'C0')) as VariantId
  if (!(variant in VARIANT_EXPECTATIONS)) throw new Error('Expected --case C0 through C5')
  const token = process.env.ARENA_CONTROL_TOKEN
  if (!token) throw new Error('ARENA_CONTROL_TOKEN required')
  const base = `http://localhost:${process.env.PORT ?? 4111}`
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  const response = await fetch(base + '/api/evaluation/lease', {
    method: 'POST',
    headers,
    body: '{}',
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok)
    throw new Error('Cannot reset while tasks or another evaluation are active: ' + response.status)
  const { lease } = (await response.json()) as { lease: string }
  try {
    console.log(JSON.stringify({ variant, verification: await resetAndVerify(variant) }, null, 2))
  } finally {
    await fetch(base + '/api/evaluation/release', {
      method: 'POST',
      headers,
      body: JSON.stringify({ lease }),
      signal: AbortSignal.timeout(5000),
    })
  }
}
main().catch((error) => {
  console.error(String(error))
  process.exitCode = 1
})
