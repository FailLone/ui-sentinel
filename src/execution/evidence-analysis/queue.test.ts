import { expect, it } from 'vitest'
import { createEvidenceAnalysisQueue } from './queue.ts'
import { createEvidenceWorkflow } from './workflow.ts'
import type { EvidencePacket, EvidenceAnalysisResult } from './types.ts'

const packet = (version = 'v1'): EvidencePacket => ({
  parentTaskId: 'run:initial',
  dependsOn: [],
  deadlineAt: Date.now() + 5000,
  consistency: 'verified',
  runId: 'run',
  snapshotId: version,
  factVersion: version,
  operationId: null,
  evidenceRefs: ['image.png', 'snapshot.json'],
  capturedAt: new Date().toISOString(),
  url: 'http://example.test',
  viewport: { width: 100, height: 100 },
  imageDataUrl: 'data:image/png;base64,abc',
  question: 'Inspect occlusion',
  elements: [
    {
      ref: 'e1',
      text: 'Pay',
      tag: 'button',
      bounds: { x: 80, y: 20, width: 40, height: 20 },
      blockedPoints: 1,
    },
  ],
})
const result: EvidenceAnalysisResult = {
  visual: {
    answer: 'Frozen screenshot inspected for the requested question.',
    coverage: 'reviewed',
    candidates: [],
    limitations: [],
  },
  geometry: { checkedElements: 1, partiallyOutside: [], intercepted: [] },
}

it('uses the installed Mastra parallel workflow to combine independent snapshot analyses', async () => {
  const workflow = createEvidenceWorkflow(async (p) => {
    expect(p.snapshotId).toBe('v1')
    return {
      answer: 'Frozen screenshot inspected for the requested question.',
      coverage: 'reviewed',
      candidates: [],
      limitations: ['No live interaction performed.'],
    }
  })
  const run = await workflow.createRun()
  const r = await run.start({ inputData: packet() })
  expect(r.status).toBe('success')
  if (r.status !== 'success') throw Error('workflow failed')
  expect(r.result.geometry).toEqual({
    checkedElements: 1,
    partiallyOutside: ['e1'],
    intercepted: ['e1'],
  })
  expect(r.result.visual.limitations).toHaveLength(1)
})

it('freezes evidence, bounds pending tasks, and retains old-page results for later review', async () => {
  let release!: () => void
  const barrier = new Promise<void>((resolve) => {
    release = resolve
  })
  let reserved = 0
  const captured: string[] = []
  const queue = createEvidenceAnalysisQueue({
    signal: new AbortController().signal,
    reserve: () => {
      reserved++
      return {
        start() {},
        release() {
          reserved--
        },
      }
    },
    event: async () => {},
    execute: async (p) => {
      await barrier
      captured.push(p.elements[0]!.text)
      expect(Object.isFrozen(p.elements[0])).toBe(true)
      return result
    },
  })
  const first = packet()
  const a = await queue.enqueue(first)
  first.elements[0]!.text = 'Changed live page'
  const duplicate = await queue.enqueue(packet())
  expect(duplicate.id).toBe(a.id)
  expect(reserved).toBe(1)
  await queue.enqueue(packet('v2'))
  await expect(queue.enqueue(packet('v3'))).rejects.toThrow('backpressure')
  release()
  await queue.waitAll()
  expect(captured).toEqual(['Pay', 'Pay'])
  expect(queue.consume().map((t) => t.snapshotId)).toEqual(['v1', 'v2'])
  expect(queue.consume()).toEqual([])
  expect(reserved).toBe(0)
  await queue.close()
})

it('cancels a non-cooperative worker and queued work without publishing late success or leaking reservations', async () => {
  let release!: (value: EvidenceAnalysisResult) => void
  let reserved = 0,
    executions = 0
  const queue = createEvidenceAnalysisQueue({
    signal: new AbortController().signal,
    reserve: () => {
      reserved++
      return {
        start() {},
        release() {
          reserved--
        },
      }
    },
    event: async () => {},
    execute: async () => {
      executions++
      return new Promise((resolve) => {
        release = resolve
      })
    },
  })
  await queue.enqueue(packet())
  await queue.enqueue(packet('v2'))
  await new Promise((r) => setTimeout(r, 0))
  await queue.close()
  release(result)
  await Promise.resolve()
  expect(executions).toBe(1)
  expect(reserved).toBe(0)
  expect(queue.snapshot().every((t) => t.status === 'cancelled' && t.result === undefined)).toBe(
    true,
  )
})

it('keeps failures explicit and does not reuse a prior operation with the same page version', async () => {
  const queue = createEvidenceAnalysisQueue({
    signal: new AbortController().signal,
    reserve: () => ({ start() {}, release() {} }),
    event: async () => {},
    execute: async () => {
      throw Error('model-unavailable')
    },
  })
  await queue.enqueue(packet())
  await queue.waitAll()
  expect(queue.consume()[0]).toMatchObject({ status: 'failed', error: 'model-unavailable' })
  await queue.enqueue({ ...packet(), operationId: 'new-order' })
  await queue.waitAll()
  expect(queue.snapshot()).toHaveLength(2)
  await queue.close()
})
