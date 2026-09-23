import { it, expect, vi, afterEach } from 'vitest'
import { analyzeEvidence } from './workflow.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('real Mastra and OpenAI adapters preserve PNG media type and bytes for visual analysis', async () => {
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII='
  const review = { answer: 'No candidate.', coverage: 'reviewed', candidates: [], limitations: [] }
  let requests = 0
  vi.stubEnv('VISION_API_KEY', 'explicit-test-key')
  vi.stubEnv('VISION_BASE_URL', 'https://invalid.test/v1')
  vi.stubEnv('VISION_MODEL', 'test-visual-model')
  const nativeFetch = globalThis.fetch
  vi.stubGlobal('fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
    if (String(_url).startsWith('data:')) return nativeFetch(_url)
    requests++
    const body = JSON.parse(String(init?.body))
    const images = body.messages.flatMap((m: any) =>
      Array.isArray(m.content) ? m.content.filter((p: any) => p.type === 'image_url') : [],
    )
    expect(images).toHaveLength(1)
    expect(images[0].image_url.url).toBe(png)
    const chunks = [
      {
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'review-1',
                  type: 'function',
                  function: { name: 'report_visual_review', arguments: JSON.stringify(review) },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      },
      {
        choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 },
      },
    ]
    return new Response(
      chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )
  })
  const result = await analyzeEvidence(
    {
      runId: 'r',
      snapshotId: 's1',
      factVersion: 'v1',
      operationId: null,
      parentTaskId: 'parent',
      dependsOn: [],
      deadlineAt: Date.now() + 5000,
      consistency: 'verified',
      evidenceRefs: ['screenshot', 'snapshot'],
      capturedAt: new Date().toISOString(),
      url: 'https://invalid.test',
      viewport: { width: 1, height: 1 },
      imageDataUrl: png,
      question: 'Inspect.',
      elements: [],
    },
    { signal: new AbortController().signal, timeRemainingMs: 5000, hooks: {} },
  )
  expect(requests).toBe(1)
  expect(result.visual).toEqual(review)
})
