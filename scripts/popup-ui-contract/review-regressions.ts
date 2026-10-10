/** Local Chromium only. Bundle with esbuild before running to preserve page.evaluate closures. */
import { strict as assert } from 'node:assert'
import { chromium } from 'playwright'
import { readPublicCheckPage } from '../../src/execution/default-check-runtime.ts'
import { evaluatePopupEffect } from '../../src/inspection/popup-effect.ts'

const cases = [
  {
    name: 'fixed-button-text-change',
    html: `<button style="position:fixed;background:white;border:1px solid;top:20px" onclick="this.textContent='Details overview'">Open details</button>`,
    outcome: 'unverified',
  },
  {
    name: 'insert-before-surviving-sibling',
    html: `<button onclick="const p=document.createElement('div');p.textContent='Details overview';p.style.cssText='position:fixed;background:white;border:1px solid;top:100px;width:200px;height:100px';document.body.insertBefore(p,document.querySelector('div'))">Open details</button><div>Existing content</div>`,
    outcome: 'verified',
  },
  {
    name: 'replace-hidden-original-target',
    html: `<button onclick="const old=document.getElementById('panel');const p=old.cloneNode(true);p.hidden=false;old.replaceWith(p)">Open details</button><div id="panel" hidden style="position:fixed;background:white;border:1px solid;top:100px;width:200px;height:100px">Details overview</div>`,
    outcome: 'unverified',
  },
  {
    name: 'native-dialog-appears',
    html: `<button onclick="document.querySelector('dialog').showModal()">Open details</button><dialog>Details overview</dialog>`,
    outcome: 'verified',
  },
] as const
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
