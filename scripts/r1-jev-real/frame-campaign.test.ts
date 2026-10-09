import { describe, it, expect } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFrameCampaign, runAuthorizedFrame } from './frame-campaign.ts'
import { compileFrame, requestFor } from '../../src/agent/exploration/integration/jev.ts'
import { digest, type PublicFrame } from '../../src/agent/exploration/integration/host.ts'
import { replyFor, jsonResponse } from './test-support.ts'
import { testInput } from './test-support.ts'
function fixture(): PublicFrame {
  const input = testInput()
  input.state.cacheable = false
  input.state.observationVersion = 'frozen'
  input.candidates = input.candidates
    .slice(0, 2)
    .map((c) => ({ ...c, observationVersion: 'frozen' }))
  input.scope.executableCandidateIds = input.candidates.map((c) => c.id)
  return {
    revision: 'r1-controlled-loop-1',
    binding: 'frozen',
    input,
    facts: {
      source: 'public',
      checks: { generic: 'collected', effect: 'pending' },
      unknownCost: null,
    },
  }
}
describe('full-state durable campaign extension', () => {
  for (const mode of ['valid', 'unknown', 'readiness', 'keys', 'stale', 'abort'] as const)
    it(mode + ' is audited without real HTTP', async () => {
      const root = mkdtempSync(join(tmpdir(), 'r1-frame-')),
        frame = fixture()
      let current = frame,
        count = 0
      const control = new AbortController()
      const campaign = createFrameCampaign({
        directory: join(root, 'campaign'),
        getKey: () => 'test-key-not-real',
        current: () => current,
        authorizedPacketHash: digest(frame),
        fetch: async (_url, init) => {
          count++
          const wire = JSON.parse(init.body as string)
          expect(wire.state).toEqual(frame)
          expect(wire.provider.allow_fallbacks).toBe(false)
          const reply: any = replyFor(wire)
          if (mode === 'unknown') delete reply.usage.cost
          if (mode === 'readiness')
            reply.answers.readiness = {
              type: 'choice',
              choice: 'insufficient-information',
              confidence: 1,
              probabilities: {
                scoreable: 0,
                'insufficient-information': 1,
                'requires-agent-investigation': 0,
              },
            }
          if (mode === 'keys') delete reply.answers.c0_relevance
          if (mode === 'stale') current = { ...frame, binding: 'different' }
          if (mode === 'abort') {
            control.abort()
            await new Promise((r) => setTimeout(r, 10))
          }
          return jsonResponse(reply)
        },
      })
      try {
        const r = await campaign.decide(frame, control.signal)
        expect(r.kind).toBe(mode === 'valid' ? 'scores' : 'handoff')
        if (mode === 'readiness') expect(r.reason).toBe('insufficient-information')
        if (mode === 'unknown' || mode === 'abort') expect(campaign.snapshot().pending).toBe(1)
        const again = await campaign.decide(frame, new AbortController().signal)
        expect(again.kind).toBe('handoff')
        expect(count).toBe(1)
        expect(readFileSync(join(root, 'campaign/ledger.jsonl'), 'utf8')).toContain('reserve')
      } finally {
        campaign.close()
        rmSync(root, { recursive: true, force: true })
      }
    })
  it('requires matching authorization before reading a credential', async () => {
    const f = fixture()
    let reads = 0
    await expect(
      runAuthorizedFrame({
        frame: f,
        freeze: {
          sourceSha: 'a',
          packetHash: digest(f),
          wireHash: compileFrame(requestFor(f)).wireDigest,
          maxCostUsd: 0.003,
        },
        authorization: {
          approvedBy: '',
          approvalReference: '',
          freezeHash: 'wrong',
          expiresAt: 'invalid',
        },
        sourceSha: 'a',
        directory: 'unused',
        claimDirectory: 'unused',
        getKey: () => {
          reads++
          return ''
        },
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('authorization')
    expect(reads).toBe(0)
  })
  it('rejects oversize facts without dropping them and uses exactly candidate identities', () => {
    const f = fixture(),
      request = requestFor(f),
      compiled = compileFrame(request)
    expect(Object.keys(compiled.questions)).toHaveLength(5)
    f.facts.extra = 'x'.repeat(32768)
    expect(() => compileFrame(requestFor(f))).toThrow('r1-request-bound')
  })
})
