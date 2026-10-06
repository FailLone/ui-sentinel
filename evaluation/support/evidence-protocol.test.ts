import { describe, expect, it } from 'vitest'
import { buildManifest, buildArtifactIndex, type Stage } from './evidence-protocol.ts'

/**
 * The evidence protocol (plan P3.4, acceptance E04).
 *
 * Every stage writes the same manifest shape so a free run can never be read as one that authorised
 * spending, and so a reviewer can tell what a directory is without being told. The mode is the load
 * bearing field: `real` is a claim that credentials were used and requests were sent.
 */

const identity = { campaignId: 'campaign-1', buildHash: 'b'.repeat(64), commit: 'abc1234' }

describe('manifest protocol (E04)', () => {
  it('stamps the mode, stage and schema version on every stage', () => {
    const stages: Stage[] = ['preflight', 'p2-smoke', 'diagnostic', 'formal']
    for (const stage of stages) {
      const manifest = buildManifest({ stage, mode: 'fixed', identity })
      expect(manifest.schemaVersion).toBe(1)
      expect(manifest.stage).toBe(stage)
      expect(manifest.kind).toBe(`visual-focus-${stage}`)
    }
  })

  it('refuses a preflight that claims `real`', () => {
    // The preflight blanks every real credential, so `real` would be a lie about what ran.
    expect(() => buildManifest({ stage: 'preflight', mode: 'real', identity })).toThrow(
      /preflight-must-be-fixed/,
    )
  })

  it('marks the P2 smoke real, because it really spends', () => {
    // The smoke reads OPENROUTER_API_KEY, requires a clean commit and calls the real models. It is
    // not a diagnostic - the formal gate refuses its kind - but calling it `fixed` would
    // misrepresent a paid run as a free one, which is the distinction this field exists to carry.
    expect(buildManifest({ stage: 'p2-smoke', mode: 'real', identity }).mode).toBe('real')
  })

  it('carries the freeze identity so a manifest ties to one build and campaign', () => {
    const manifest = buildManifest({ stage: 'formal', mode: 'real', identity })
    expect(manifest.campaignId).toBe('campaign-1')
    expect(manifest.buildHash).toBe('b'.repeat(64))
    expect(manifest.commit).toBe('abc1234')
  })

  it('a fixed manifest states zero paid requests; a real one states none, not zero', () => {
    // Zero is a fact for a fixed run. A real run cannot know its request count from the stage alone,
    // and writing 0 there would be a claim the directory has not earned.
    expect(buildManifest({ stage: 'preflight', mode: 'fixed', identity }).paidRequests).toBe(0)
    expect(buildManifest({ stage: 'formal', mode: 'real', identity }).paidRequests).toBeNull()
  })
})

describe('artifact index protocol (E04)', () => {
  it('records ownership, bytes, sha and a relative path for each entry', () => {
    const index = buildArtifactIndex(
      [
        {
          runId: 'r1',
          artifactId: 'a1',
          type: 'screenshot',
          sha256: 'a'.repeat(64),
          bytes: 2048,
          path: '/abs/dir/r1/a1',
        },
      ],
      { base: '/abs/dir' },
    )
    expect(index).toHaveLength(1)
    expect(index[0]).toMatchObject({
      runId: 'r1',
      artifactId: 'a1',
      type: 'screenshot',
      sha256: 'a'.repeat(64),
      bytes: 2048,
      // The path is stored relative so the index survives being moved between machines.
      path: 'r1/a1',
    })
  })

  it('keeps the relative path for entries already relative', () => {
    const index = buildArtifactIndex([
      { runId: 'r1', artifactId: 'a1', type: 'snapshot', sha256: 'x', bytes: 1, path: 'dl/a1' },
    ])
    expect(index[0]!.path).toBe('dl/a1')
  })

  it('preserves the order it was handed, so the same run indexes identically twice', () => {
    const entries = ['a2', 'a1'].map((artifactId) => ({
      runId: 'r1',
      artifactId,
      type: 'screenshot',
      sha256: artifactId,
      bytes: 1,
      path: `/x/${artifactId}`,
    }))
    expect(buildArtifactIndex(entries).map((e) => e.artifactId)).toEqual(['a2', 'a1'])
  })
})
