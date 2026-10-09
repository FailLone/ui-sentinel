import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { installExperimentalHost } from '../../src/execution/experimental-decision-host.ts'
import { createControlledHost, digest } from '../../src/agent/exploration/integration/host.ts'
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
              const ordered = [...frame.input.candidates].sort(
                (a, b) => Number(match(b.text)) - Number(match(a.text)) || a.id.localeCompare(b.id),
              )
              const reply = {
                binding: frame.binding,
                packetHash: digest(frame),
                kind: 'scores' as const,
                orderedIds: ordered.map((c) => c.id),
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
