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
    const binding = { handle: await l.elementHandle(), url: w.page.url() }
    expect((await measureUiProbe(l, binding, () => {}, 3000)).outcome).toBe('actionable')
    await w.page.evaluate(
      "document.body.insertAdjacentHTML('beforeend','<div style=\"position:fixed;inset:0;z-index:10\"></div>')",
    )
    const negative = await measureUiProbe(l, binding, () => {}, 150)
    expect(negative.outcome).toBe('intercepted')
    expect(negative.after.hitFraction).toBe(0)
    expect(await w.page.locator('body').getAttribute('data-clicked')).toBeNull()
    await expect(
      measureUiProbe(w.page.locator('.missing'), binding, () => {}, 150),
    ).rejects.toThrow('not-unique')
    await expect(
      measureUiProbe(w.page.locator('button, div'), binding, () => {}, 150),
    ).rejects.toThrow('not-unique')
    let checks = 0
    await expect(
      measureUiProbe(
        l,
        binding,
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
    const binding = { handle: await w.page.locator('button').elementHandle(), url: w.page.url() }
    await expect(measureUiProbe(w.page.locator('button'), binding, () => {}, 150)).rejects.toThrow()
    await w.page.close()
    await expect(measureUiProbe(w.page.locator('button'), binding, () => {}, 150)).rejects.toThrow()
  } finally {
    await w.close()
  }
})

it('never rebinds a replacement at probe entry to an earlier observed target', async () => {
  const w = await launchBrowser({ headless: true })
  try {
    await w.page.setContent('<button>Open</button>')
    const l = w.page.locator('button'),
      binding = { handle: await l.elementHandle(), url: w.page.url() }
    await l.evaluate((n) => {
      n.outerHTML = n.outerHTML
    })
    await expect(measureUiProbe(l, binding, () => {}, 150)).rejects.toThrow('probe-target-changed')
  } finally {
    await w.close()
  }
})
