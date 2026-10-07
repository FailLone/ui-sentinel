import { chromium } from 'playwright'
import type { UrlScanSampleTruth } from './truth.ts'

/** An evaluator-owned browser, with assertions independent of production rules and reports. */
export async function replayUrlSample(entryUrl: string, sample: UrlScanSampleTruth) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto(entryUrl)
    const before = await page.locator('#rows .price').allTextContents()
    await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('price')
    const response = page.waitForResponse((r) => r.url().includes('/items?sort=price'))
    await page.getByRole('button', { name: 'Apply sort', exact: true }).click()
    await response
    await page.waitForTimeout(100)
    const prices = await page.locator('#rows .price').allTextContents()
    const sortWorks = JSON.stringify(prices) === JSON.stringify(['5', '12', '20'])
    let filterWorks: boolean | null = null
    if (sample.sampleId.startsWith('overlay-')) {
      await page
        .getByRole('button', { name: 'Filters', exact: true })
        .click({ timeout: 700 })
        .catch(() => {})
      filterWorks = await page.locator('#panel').isVisible()
    }
    return {
      before,
      prices,
      sortWorks,
      filterWorks,
      passed:
        sample.variant === 'healthy'
          ? sortWorks && filterWorks !== false
          : sample.expectedFindingKey === 'foreground-control-covered'
            ? filterWorks === false
            : !sortWorks,
      reproducedFindingKeys: [
        ...(!sortWorks ? ['sort-ignores-selection'] : []),
        ...(filterWorks === false ? ['foreground-control-covered'] : []),
      ],
      screenshot: await page.screenshot(),
    }
  } finally {
    await browser.close()
  }
}
