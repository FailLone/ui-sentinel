/** Started only by the isolated pilot runner; receives no real provider credential. */
import { appendFileSync } from 'node:fs'
import { installExperimentalHost, installExperimentalScopeExpansion } from '../../src/execution/experimental-decision-host.ts'
import { createControlledHost } from '../../src/agent/exploration/integration/host.ts'
import { MODES } from './manifest.ts'
const mode = process.env.R1_ONLINE_MODE as typeof MODES[number]
if (!MODES.includes(mode) || !process.send || !process.env.R1_ONLINE_BROKER) throw Error('runner-only')
installExperimentalScopeExpansion()
installExperimentalHost(runId => {
  process.send!({ type: 'run-registered', runId })
  if (mode === 'agent') return undefined
  const rpc = async (route: string, body: unknown, signal: AbortSignal) => {
    const r = await fetch(process.env.R1_ONLINE_BROKER + route, { method: 'POST',
      headers: { authorization: `Bearer ${process.env.R1_ONLINE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ runId, body }), signal })
    if (!r.ok) throw Error('online-batch-stopped')
    return r.json()
  }
  const host = createControlledHost({ onlinePolicy: true,
    onFrame: frame => appendFileSync('frames.jsonl', JSON.stringify({ runId, frame }) + '\n'),
    ...(mode === 'jev' ? { score: (frame, signal) => rpc('/score', frame, signal) } : {}),
  })
  return { async decide(input, context) {
    await rpc('/guard', null, context.signal)
    const result = await host.decide(input, context)
    await rpc('/guard', null, context.signal)
    return result
  } }
})
await import('../../src/server/index.ts')
