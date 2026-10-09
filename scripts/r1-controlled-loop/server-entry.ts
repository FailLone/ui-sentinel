import { createFrameCampaign } from '../r1-jev-real/frame-campaign.ts'
import { replyFor, jsonResponse } from '../r1-jev-real/test-support.ts'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  installExperimentalHost,
  installExperimentalScopeExpansion,
} from '../../src/execution/experimental-decision-host.ts'
import { createControlledHost, digest } from '../../src/agent/exploration/integration/host.ts'
installExperimentalScopeExpansion()
const mode = process.env.R1_LOOP_MODE
if (!['agent-fixed', 'program', 'jev-fixed'].includes(mode ?? ''))
  throw new Error('explicit-free-mode-required')
const directory = process.env.R1_LOOP_OUTPUT!
mkdirSync(directory, { recursive: true })
if (mode !== 'agent-fixed')
  installExperimentalHost((runId) =>
    createControlledHost({
      onFrame: (frame) =>
        appendFileSync(join(directory, 'frames.jsonl'), JSON.stringify({ runId, frame }) + '\n'),
      ...(mode === 'jev-fixed'
        ? {
            score: async (frame, signal) => {
              signal.throwIfAborted()
              const words = new Set(frame.input.task.goal.toLowerCase().match(/[a-z]{4,}/g) ?? [])
              const match = (text: string) =>
                (text.toLowerCase().match(/[a-z]{4,}/g) ?? []).some((w) => words.has(w))
              const high = frame.input.candidates.findIndex((c) => match(c.text))
              const campaign = createFrameCampaign({
                directory: join(directory, 'campaign-' + runId),
                getKey: () => 'fixed-test-credential',
                current: () => frame,
                authorizedPacketHash: digest(frame),
                fetch: async (_url, init) => {
                  const wire = JSON.parse(init.body as string)
                  const response = replyFor({ questions: wire.questions }, high)
                  response.usage.cost = 0
                  return jsonResponse(response)
                },
              })
              let reply
              try {
                reply = await campaign.decide(frame, signal)
              } finally {
                campaign.close()
              }
              appendFileSync(
                join(directory, 'jev-fixed.jsonl'),
                JSON.stringify({ runId, frame, reply, costUsd: 0, fixed: true }) + '\n',
              )
              return reply
            },
          }
        : {}),
    }),
  )
await import('../../src/server/index.ts')
