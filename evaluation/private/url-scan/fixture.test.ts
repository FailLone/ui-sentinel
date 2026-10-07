import { it, expect } from 'vitest'
import {
  startUrlScanFixture,
  URL_SCAN_HOLDOUT_LAYOUT,
  URL_SCAN_SEEN_LAYOUT,
  URL_SCAN_SEEN_SIDEBAR,
  URL_SCAN_SEEN_CARDS,
  URL_SCAN_SEEN_LIST,
  URL_SCAN_SEEN_WIDE,
  URL_SCAN_SEEN_STACK,
  URL_SCAN_SEEN_COLUMNS,
} from './fixture.ts'
import { replayUrlSample } from './replay.ts'
import { urlScanTruth } from './truth.ts'
it.each([
  'development',
  URL_SCAN_SEEN_LAYOUT,
  URL_SCAN_SEEN_SIDEBAR,
  URL_SCAN_SEEN_CARDS,
  URL_SCAN_SEEN_LIST,
  URL_SCAN_SEEN_WIDE,
  URL_SCAN_SEEN_STACK,
  URL_SCAN_SEEN_COLUMNS,
  URL_SCAN_HOLDOUT_LAYOUT,
] as const)(
  'independently verifies five actual samples and their counterparts with layout %s',
  async (layout) => {
    const fixture = await startUrlScanFixture(layout)
    try {
      for (const sample of urlScanTruth().samples) {
        fixture.setVariant(sample.variant)
        const path = new URL(sample.entryUrl).pathname + new URL(sample.entryUrl).search
        const html = await fetch(fixture.origin + path).then((r) => r.text())
        expect(html).not.toMatch(
          /expectedFindingKey|foreground-control-covered|sort-ignores-selection|__control|variant=/,
        )
        const structural = 'html > body > ul > li:nth-of-type(1)'
        const replay = await replayUrlSample(fixture.origin + path, sample, [
          structural,
          '#rows li:first-child',
          '#rows li:first-child .name',
          '#rows .price',
          '#rows .price:first-child',
          '#rows',
          '#rows li:nth-child(2)',
          '#rows, button',
          'invalid[',
        ])
        expect(replay.passed, sample.sampleId).toBe(true)
        expect(replay.resultMeasurements.price['#rows .price']).toEqual(replay.prices)
        expect(replay.resultMeasurements.name['#rows li:first-child .name']).toEqual([
          replay.names[0],
        ])
        expect(replay.resultMeasurements.price['#rows, button']).toBeUndefined()
        expect(replay.resultMeasurements.price['invalid[']).toBeUndefined()
        expect(replay.firstRowSelectors).toContain(structural)
        expect(replay.firstRowSelectors).toContain('#rows li:first-child')
        expect(replay.firstRowSelectors).not.toContain('#rows')
        expect(replay.firstRowSelectors).not.toContain('#rows li:nth-child(2)')
        expect(replay.firstRowSelectors).not.toContain('#rows, button')
        expect(replay.firstRowSelectors).not.toContain('invalid[')
        if (sample.variant === 'defective')
          expect(replay.reproducedFindingKeys).toContain(sample.expectedFindingKey)
      }
      expect((await fetch(fixture.origin + '/__control?variant=healthy')).status).toBe(404)
    } finally {
      await fixture.close()
    }
  },
  20_000,
)
