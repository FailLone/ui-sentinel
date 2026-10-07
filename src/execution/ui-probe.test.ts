import { it, expect } from 'vitest'
import { launchBrowser } from './browser.ts'
import { measureUiProbe } from './ui-probe.ts'

it('measures healthy and intercepted controls without dispatch; rejects absent and ambiguous targets', async () => {
  const w = await launchBrowser({ headless: true })
  try {
    await w.page.setContent(
      '<button style="position:absolute;left:40px;top:40px;width:200px;height:80px" onclick="document.body.dataset.clicked=1">Open</button>',
    )
    const l = w.page.locator('button')
    expect((await measureUiProbe(l, () => {}, 3000)).outcome).toBe('actionable')
    await w.page.evaluate(
      "document.body.insertAdjacentHTML('beforeend','<div style=\"position:fixed;inset:0;z-index:10\"></div>')",
    )
    const negative = await measureUiProbe(l, () => {}, 150)
    expect(negative.outcome).toBe('intercepted')
    expect(negative.after.hitFraction).toBe(0)
    expect(await w.page.locator('body').getAttribute('data-clicked')).toBeNull()
    await expect(measureUiProbe(w.page.locator('.missing'), () => {}, 150)).rejects.toThrow(
      'not-unique',
    )
    await expect(measureUiProbe(w.page.locator('button, div'), () => {}, 150)).rejects.toThrow(
      'not-unique',
    )
    let checks = 0
    await expect(
      measureUiProbe(
        l,
        () => {
          if (++checks === 3) throw Error('cancelled')
        },
        150,
      ),
    ).rejects.toThrow('cancelled')
  } finally {
    await w.close()
  }
})

it('does not turn a disabled control or closed page into interception evidence', async () => {
  const w = await launchBrowser({ headless: true })
  try {
    await w.page.setContent('<button disabled>Open</button>')
    await expect(measureUiProbe(w.page.locator('button'), () => {}, 150)).rejects.toThrow()
    await w.page.close()
    await expect(measureUiProbe(w.page.locator('button'), () => {}, 150)).rejects.toThrow()
  } finally {
    await w.close()
  }
})
