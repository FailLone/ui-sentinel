import { it, expect } from 'vitest'
import { launchBrowser } from './browser.ts'
import { readObservationVersion, sameObservationVersion } from './observation-version.ts'

it('invalidates same-text layout, CSSOM, hit changes, node replacement and scroll', async () => {
  const worker = await launchBrowser()
  try {
    await worker.page.setContent(
      '<style>button{width:100px}body{height:2000px}</style><button>Continue</button>',
    )
    const a = await readObservationVersion(worker.page)
    expect(a.reusable).toBe(true)
    expect(sameObservationVersion(a, await readObservationVersion(worker.page))).toBe(true)
    await worker.page.evaluate(() => document.styleSheets[0]!.insertRule('button{width:200px}', 1))
    const b = await readObservationVersion(worker.page)
    expect(b.key).not.toBe(a.key)
    await worker.page.locator('button').evaluate((el) => el.replaceWith(el.cloneNode(true)))
    const c = await readObservationVersion(worker.page)
    expect(c.key).not.toBe(b.key)
    await worker.page.evaluate(() => scrollTo(0, 100))
    expect((await readObservationVersion(worker.page)).key).not.toBe(c.key)
    await worker.page.evaluate(() => {
      const el = document.createElement('div')
      el.style.cssText = 'position:fixed;inset:0;background:transparent'
      document.body.append(el)
    })
    expect((await readObservationVersion(worker.page)).key).not.toBe(c.key)
  } finally {
    await worker.close()
  }
})

it('does not certify animations, canvas, or navigation as unchanged', async () => {
  const worker = await launchBrowser()
  try {
    await worker.page.setContent('<button>Continue</button>')
    const before = await readObservationVersion(worker.page)
    await worker.page.evaluate(() =>
      document
        .querySelector('button')!
        .animate([{ opacity: 1 }, { opacity: 0.5 }], { duration: 10000 }),
    )
    expect((await readObservationVersion(worker.page)).reusable).toBe(false)
    await worker.page.setContent('<canvas></canvas>')
    expect((await readObservationVersion(worker.page)).reusable).toBe(false)
    await worker.page.goto('about:blank')
    await worker.page.setContent('<button>Continue</button>')
    expect(sameObservationVersion(before, await readObservationVersion(worker.page))).toBe(false)
  } finally {
    await worker.close()
  }
})
