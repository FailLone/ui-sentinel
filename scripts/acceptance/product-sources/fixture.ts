import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { chromium } from 'playwright'
import { startArena } from '../../../evaluation/fixtures/counterexample-arena/server.ts'
import { documentFor, type Variant } from '../../../evaluation/fixtures/product-sources/page.ts'
import { cases } from '../../../evaluation/private/product-sources/truth.ts'
import { digest } from '../../../src/agent/exploration/integration/host.ts'
import { productSource } from './policy.ts'
const [mode = '--verify', value] = process.argv.slice(2)
if (mode === '--serve') {
  if (!cases.some((c) => c.variant === value)) throw Error('choose-healthy-defect-unavailable')
  const arena = await startArena(documentFor(value as Variant))
  console.log(JSON.stringify({ url: arena.origin + '/', reset: 'new browser context + GET /' }))
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => void arena.close())
} else if (mode === '--verify') {
  const output = resolve(value ?? `data/r2-product-acceptance/truth-${Date.now()}`)
  await mkdir(output, { recursive: false })
  const browser = await chromium.launch({ headless: true })
  const records: unknown[] = []
  try {
    for (const c of cases) {
      const arena = await startArena(documentFor(c.variant))
      try {
        for (let repeat = 0; repeat < 2; repeat++) {
          const context = await browser.newContext({ viewport: { width: 1000, height: 900 } })
          try {
            const page = await context.newPage()
            await page.goto(arena.origin + '/')
            const before = await page.evaluate(() => {
              const a = document.querySelector('#preview-state'),
                b = document.querySelector('#details-state')
              ;(window as any).__original = [a, b]
              return {
                preview: a?.textContent,
                details: b?.textContent,
                slots: [
                  document.querySelectorAll('#preview-state').length,
                  document.querySelectorAll('#details-state').length,
                ],
              }
            })
            assert.deepEqual(before, { preview: '尚未预览', details: '尚未查看', slots: [1, 1] })
            assert.equal(
              await page.getByRole('button', { name: '查看详情', exact: true }).count(),
              0,
            )
            if (c.variant === 'unavailable') {
              assert.equal(await page.locator('#availability').innerText(), '暂不可用')
              assert.equal(
                await page.getByRole('button', { name: '预览目录', exact: true }).isDisabled(),
                true,
              )
            } else {
              assert.equal(await page.locator('#availability').innerText(), '可用')
              await page.getByRole('button', { name: '预览目录', exact: true }).click()
              assert.equal(await page.locator('#preview-state').innerText(), '预览就绪')
              assert.equal(
                await page.getByRole('button', { name: '查看详情', exact: true }).count(),
                1,
              )
              await page.getByRole('button', { name: '查看详情', exact: true }).click()
            }
            const after = await page.evaluate(() => ({
              preview: document.querySelector('#preview-state')?.textContent,
              details: document.querySelector('#details-state')?.textContent,
              sameNodes: (window as any).__original.every(
                (n: Element, i: number) =>
                  n === document.querySelector(i ? '#details-state' : '#preview-state'),
              ),
            }))
            assert.deepEqual(after, { preview: c.preview, details: c.details, sameNodes: true })
            await page.screenshot({ path: join(output, `${c.id}-${repeat}.png`) })
            // Reload is a second reset mechanism; no shared state, cookies, storage or server mutation.
            await page.reload()
            assert.equal(await page.locator('#preview-state').innerText(), '尚未预览')
            assert.equal(await page.locator('#details-state').innerText(), '尚未查看')
            assert.equal(
              await page.getByRole('button', { name: '查看详情', exact: true }).count(),
              0,
            )
            records.push({
              case: c.id,
              repeat,
              before,
              after,
              reset: true,
              htmlHash: digest(documentFor(c.variant)),
            })
          } finally {
            await context.close()
          }
        }
        assert.equal((await fetch(arena.origin + '/private')).status, 404)
        assert.equal((await fetch(arena.origin + '/?variant=defect')).status, 404)
        assert.equal((await fetch(arena.origin + '/', { method: 'POST' })).status, 405)
      } finally {
        await arena.close()
      }
    }
    await writeFile(
      join(output, 'truth.json'),
      JSON.stringify({ realModels: false, sourceHash: digest(productSource()), records }, null, 2) +
        '\n',
    )
    console.log(JSON.stringify({ output, cases: 3, freshContexts: 6, reloads: 6, passed: true }))
  } finally {
    await browser.close()
  }
} else throw Error('unknown-mode')
