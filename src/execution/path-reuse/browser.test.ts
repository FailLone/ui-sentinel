import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { readPublicCheckPage } from '../default-check-runtime.ts'
import { describeTarget, matchTarget } from './library.ts'

it('real DOM rebinding rejects unique semantic ambiguity and detects same-selector node replacement', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.setContent(
      '<main><button id="go">Go</button><section aria-label="Result"><p id="out">Before</p></section></main>',
    )
    const before = await readPublicCheckPage(page, '1')
    const descriptor = describeTarget(before, '#go', true)
    const original = matchTarget(before, descriptor)
    await page.evaluate(() => {
      const n = document.querySelector('#go')!
      n.replaceWith(n.cloneNode(true))
    })
    const after = await readPublicCheckPage(page, '2')
    expect(matchTarget(after, descriptor).identity).not.toBe(original.identity)
    await page.evaluate(() => {
      document.querySelector('#go')!.setAttribute('aria-label', 'Other')
    })
    const changed = await readPublicCheckPage(page, '3')
    expect(() => matchTarget(changed, descriptor)).toThrow('target-description-changed')
    const result = describeTarget(before, '#out')
    await page.evaluate(() => {
      document.querySelector('section')!.setAttribute('aria-label', 'Other result')
    })
    expect(() => describeTarget(before, '#missing')).toThrow('target-missing-or-ambiguous')
    const changedParent = await readPublicCheckPage(page, '4')
    expect(() => matchTarget(changedParent, result)).toThrow('target-description-changed')
  } finally {
    await browser.close()
  }
})
