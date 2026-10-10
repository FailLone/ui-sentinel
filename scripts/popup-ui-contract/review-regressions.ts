/** Local Chromium only. Bundle with esbuild before running to preserve page.evaluate closures. */
import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'
import { readPublicCheckPage } from '../../src/execution/default-check-runtime.ts'
import { evaluatePopupEffect } from '../../src/inspection/popup-effect.ts'

import { popupEffectCases as cases } from '../../evaluation/private/counterexample-arena/popup-effects.ts'

const browser = await chromium.launch({ headless: true })
try {
  const results = []
  for (const test of cases) {
    const page = await browser.newPage()
    try {
      await page.setContent(test.html)
      const before = await readPublicCheckPage(page, 'before')
      await page.locator('button').click()
      const after = [
        await readPublicCheckPage(page, 'after-1'),
        await readPublicCheckPage(page, 'after-2'),
      ]
      const effect = evaluatePopupEffect(before, after, 'Details overview')
      assert.equal(effect.outcome, test.outcome, test.name)
      results.push({ name: test.name, effect, before, after })
    } finally {
      await page.close()
    }
  }
  console.log(JSON.stringify({ realModelCalls: 0, passed: results.length, results }, null, 2))
} finally {
  await browser.close()
}
