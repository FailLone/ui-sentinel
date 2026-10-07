import { it, expect } from 'vitest'
import { startUrlScanFixture } from './fixture.ts'
import { replayUrlSample } from './replay.ts'
import { urlScanTruth } from './truth.ts'
it('independently verifies the actual five samples and their healthy counterparts', async () => {
  const fixture = await startUrlScanFixture()
  try {
    for (const sample of urlScanTruth().samples) {
      fixture.setVariant(sample.variant)
      const path = new URL(sample.entryUrl).pathname + new URL(sample.entryUrl).search
      const html = await fetch(fixture.origin + path).then((r) => r.text())
      expect(html).not.toMatch(
        /expectedFindingKey|foreground-control-covered|sort-ignores-selection|__control|variant=/,
      )
      const replay = await replayUrlSample(fixture.origin + path, sample)
      expect(replay.passed, sample.sampleId).toBe(true)
      if (sample.variant === 'defective')
        expect(replay.reproducedFindingKeys).toContain(sample.expectedFindingKey)
    }
    expect((await fetch(fixture.origin + '/__control?variant=healthy')).status).toBe(404)
  } finally {
    await fixture.close()
  }
}, 20_000)
