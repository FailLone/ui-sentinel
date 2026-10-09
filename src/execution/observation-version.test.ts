import { it, expect } from 'vitest'
import { launchBrowser } from './browser.ts'
import {
  readObservationVersion,
  readCompletionVersion,
  sameObservationVersion,
} from './observation-version.ts'

it('versions native choice state for completion without enabling observation cache reuse', async () => {
  const worker = await launchBrowser()
  try {
    await worker.page.setContent(
      '<label>Dataset<input type="radio" name="dataset" value="orders"></label><input type="checkbox"><button disabled>Retry</button>',
    )
    expect((await readObservationVersion(worker.page)).reusable).toBe(false)
    let version = await readCompletionVersion(worker.page)
    expect(version.reusable).toBe(true)
    expect(sameObservationVersion(version, await readCompletionVersion(worker.page))).toBe(true)
    for (const property of ['checked', 'value', 'indeterminate'] as const) {
      await worker.page
        .locator('input[type=checkbox]')
        .evaluate((el: HTMLInputElement, property) => {
          if (property === 'value') el.value = 'changed'
          else el[property] = true
        }, property)
      const next = await readCompletionVersion(worker.page)
      expect(next.key).not.toBe(version.key)
      version = next
    }
    for (const markup of [
      '<input>',
      '<input type="file">',
      '<select><option>A</option></select>',
      '<canvas></canvas>',
    ]) {
      await worker.page.setContent(markup)
      expect((await readCompletionVersion(worker.page)).reusable).toBe(false)
    }
  } finally {
    await worker.close()
  }
})

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
