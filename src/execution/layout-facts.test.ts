import { beforeAll, afterAll, it, expect } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readLayoutFacts, measureLayoutPixels } from './layout-facts.ts'
import { createControlLayoutRule, type LayoutReceipt } from '../rules/builtin/control-layout.ts'
import { controlLayoutFixture } from '../../evaluation/fixtures/control-layout.ts'
let browser: Browser
const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }
const output = resolve(
  process.env.LAYOUT_TEST_OUTPUT ?? 'data/control-layout-tests',
  new Date().toISOString().replace(/[:.]/g, '-'),
)
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  await mkdir(output, { recursive: true })
})
afterAll(async () => {
  await browser?.close()
})
async function capture(mode: Parameters<typeof controlLayoutFixture>[0], renamed = false) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 768 },
    deviceScaleFactor: 1,
  })
  await page.setContent(controlLayoutFixture(mode, renamed))
  const before = await readLayoutFacts(page),
    png = await page.screenshot({ scale: 'css', caret: 'initial' }),
    facts = await readLayoutFacts(page)
  const proof = await measureLayoutPixels(page, png, facts),
    observedAt = new Date().toISOString()
  const receipt: LayoutReceipt = {
    runId: 'local',
    observedAt,
    expiresAt: new Date(Date.now() + 300000).toISOString(),
    screenshotRef: 'shot',
    facts,
    pixels: proof.pixels,
    stable: JSON.stringify(before) === JSON.stringify(facts),
    issues: [],
    evidenceRefs: ['shot'],
    evidenceIntegrity: clean,
  }
  const context = {
    runId: 'local',
    currentUrl: facts.url,
    pageTitle: '',
    timestamp: observedAt,
    events: [],
    snapshot: {
      url: facts.url,
      title: '',
      viewport: facts.viewport,
      elements: [],
      screenshotPath: 'shot',
      evidenceIntegrity: clean,
    },
  }
  const results = await Promise.all(
    (['clipping', 'overlap'] as const).map((k) =>
      createControlLayoutRule(k, receipt).evaluate(context),
    ),
  )
  await writeFile(
    resolve(output, mode + (renamed ? '-renamed' : '') + '.json'),
    JSON.stringify({ receipt, results }, null, 2),
  )
  await writeFile(resolve(output, mode + (renamed ? '-renamed' : '') + '.png'), png)
  if (proof.referencePng)
    await writeFile(
      resolve(output, mode + (renamed ? '-renamed' : '') + '-reference.png'),
      proof.referencePng,
    )
  return { page, receipt, context, results }
}
it('measures actual healthy ink for both rules and vertical clipped glyph ink, with renamed/structured controls', async () => {
  for (const renamed of [false, true])
    for (const mode of ['healthy', 'clipped'] as const) {
      const c = await capture(mode, renamed)
      try {
        expect(c.results[0]!.verdict, JSON.stringify(c.results)).toBe(
          mode === 'clipped' ? 'fail' : 'pass',
        )
        if (mode === 'healthy')
          expect(c.results[1]!.verdict, JSON.stringify(c.results)).toBe('pass')
      } finally {
        await c.page.close()
      }
    }
})
it('proves sibling visual erasure even when the sibling does not intercept pointers', async () => {
  for (const renamed of [false, true]) {
    const c = await capture('overlap', renamed)
    try {
      expect(c.results[1]!.verdict, JSON.stringify(c.results)).toBe('fail')
      expect(await c.page.evaluate(() => document.elementFromPoint(120, 40)?.textContent)).toBe(
        renamed ? 'Archive receipt' : 'Review invoice',
      )
    } finally {
      await c.page.close()
    }
  }
})
it('keeps scroll/ellipsis/alternate/layer/unsupported cases unknown and disabled controls not-applicable', async () => {
  for (const mode of [
    'ellipsis',
    'scroll',
    'alternative',
    'unknown',
    'disabled',
    'layer',
  ] as const) {
    const c = await capture(mode)
    try {
      for (const r of c.results) expect(r.verdict, mode + JSON.stringify(r)).not.toBe('fail')
      expect((c.results[0]!.details.rows as any[])[0].verdict).toBe(
        mode === 'disabled' ? 'not-applicable' : 'unknown',
      )
    } finally {
      await c.page.close()
    }
  }
})
it('reports omitted candidates and rejects changed node, viewport, evidence, time or integrity', async () => {
  const b = await capture('budget')
  expect(b.receipt.facts.omitted).toBe(4)
  expect(b.results[0]!.verdict).toBe('unknown')
  await b.page.close()
  const c = await capture('clipped')
  try {
    await c.page
      .locator('button')
      .first()
      .evaluate((e) => e.replaceWith(e.cloneNode(true)))
    expect(JSON.stringify(await readLayoutFacts(c.page))).not.toBe(JSON.stringify(c.receipt.facts))
    for (const change of [
      { stable: false },
      { issues: ['layout-evidence-missing-or-changed'] },
      { expiresAt: '2000-01-01T00:00:00.000Z' },
      {
        evidenceIntegrity: {
          version: 1 as const,
          status: 'intervened' as const,
          interventionIds: ['x'],
        },
      },
    ]) {
      const r = await createControlLayoutRule('clipping', { ...c.receipt, ...change }).evaluate(
        c.context,
      )
      expect(r.verdict).toBe('unknown')
      expect(r.unchecked).toBeUndefined()
    }
    expect(
      (
        await createControlLayoutRule('clipping', c.receipt).evaluate({
          ...c.context,
          snapshot: { ...c.context.snapshot, viewport: { width: 999, height: 768 } },
        })
      ).verdict,
    ).toBe('unknown')
  } finally {
    await c.page.close()
  }
})

it('requires actual missing ink rather than intersecting rectangles or a crossing Range box', async () => {
  const c = await capture('healthy')
  try {
    await c.page
      .locator('button')
      .first()
      .evaluate((e) =>
        Object.assign((e as HTMLElement).style, { height: '20px', overflow: 'clip' }),
      )
    await c.page
      .locator('button')
      .nth(1)
      .evaluate((e) => ((e as HTMLElement).style.left = '-40px'))
    const facts = await readLayoutFacts(c.page),
      proof = await measureLayoutPixels(
        c.page,
        await c.page.screenshot({ scale: 'css', caret: 'initial' }),
        facts,
      )
    const receipt = { ...c.receipt, facts, pixels: proof.pixels }
    expect(facts.rows[0]!.textBox.height).toBeGreaterThan(facts.rows[0]!.box.height)
    for (const kind of ['clipping', 'overlap'] as const)
      expect((await createControlLayoutRule(kind, receipt).evaluate(c.context)).verdict).toBe(
        'pass',
      )
    await c.page.setContent(
      controlLayoutFixture('overlap').replace('<nav>', '<div>').replace('</nav>', '</div>'),
    )
    const noGroup = await readLayoutFacts(c.page),
      pixels = await measureLayoutPixels(c.page, await c.page.screenshot(), noGroup)
    const noBasis = await createControlLayoutRule('overlap', {
      ...c.receipt,
      facts: noGroup,
      pixels: pixels.pixels,
    }).evaluate(c.context)
    expect(noBasis.verdict).toBe('unknown')
  } finally {
    await c.page.close()
  }
})

it('bounds a large document and records normal modal background as not-applicable', async () => {
  const c = await capture('healthy')
  try {
    await c.page.evaluate(() => {
      const d = document.createElement('dialog')
      d.textContent = 'Temporary notice'
      document.body.append(d)
      d.showModal()
    })
    const facts = await readLayoutFacts(c.page)
    const result = await createControlLayoutRule('clipping', {
      ...c.receipt,
      facts,
      pixels: [],
    }).evaluate(c.context)
    expect((result.details.rows as any[]).every((r) => r.verdict === 'not-applicable')).toBe(true)
    await c.page.setContent(
      controlLayoutFixture('healthy').replace(
        '</body>',
        '<div>'.repeat(600) + '</div>'.repeat(600) + '</body>',
      ),
    )
    const bounded = await readLayoutFacts(c.page)
    expect(bounded.enumerationComplete).toBe(false)
    expect(bounded.issues).toContain('document-budget')
    expect(
      (
        await createControlLayoutRule('clipping', {
          ...c.receipt,
          facts: bounded,
          pixels: [],
        }).evaluate(c.context)
      ).verdict,
    ).toBe('unknown')
  } finally {
    await c.page.close()
  }
})

it('does not turn unmeasured scripted or hover recovery into a defect, while healthy ink remains measurable', async () => {
  const c = await capture('clipped')
  try {
    for (const mode of ['clipped', 'overlap', 'healthy'] as const) {
      await c.page.setContent(
        controlLayoutFixture(mode).replace(
          '</body>',
          '<script>document.querySelector("button").addEventListener("mouseenter",()=>{})</script></body>',
        ),
      )
      const facts = await readLayoutFacts(c.page),
        proof = await measureLayoutPixels(
          c.page,
          await c.page.screenshot({ scale: 'css', caret: 'initial' }),
          facts,
        )
      const results = await Promise.all(
        (['clipping', 'overlap'] as const).map((k) =>
          createControlLayoutRule(k, { ...c.receipt, facts, pixels: proof.pixels }).evaluate(
            c.context,
          ),
        ),
      )
      expect(results.every((r) => r.verdict !== 'fail')).toBe(true)
      if (mode === 'healthy') expect(results.every((r) => r.verdict === 'pass')).toBe(true)
    }
    await c.page.setContent(
      controlLayoutFixture('clipped').replace(
        '</style>',
        'button:hover{height:40px!important}</style>',
      ),
    )
    const facts = await readLayoutFacts(c.page),
      proof = await measureLayoutPixels(c.page, await c.page.screenshot(), facts)
    expect(
      (
        await createControlLayoutRule('clipping', {
          ...c.receipt,
          facts,
          pixels: proof.pixels,
        }).evaluate(c.context)
      ).verdict,
    ).toBe('unknown')
  } finally {
    await c.page.close()
  }
})

it('retains a measured failure alongside omitted and unknown targets', async () => {
  const c = await capture('budget')
  try {
    await c.page
      .locator('button')
      .first()
      .evaluate((e) =>
        Object.assign((e as HTMLElement).style, { height: '12px', overflow: 'clip' }),
      )
    const facts = await readLayoutFacts(c.page),
      proof = await measureLayoutPixels(c.page, await c.page.screenshot(), facts)
    const result = await createControlLayoutRule('clipping', {
      ...c.receipt,
      facts,
      pixels: proof.pixels,
    }).evaluate(c.context)
    expect(result.verdict).toBe('fail')
    expect(result.details.omitted).toBe(4)
    expect((result.details.rows as any[]).some((r) => r.verdict === 'unknown')).toBe(true)
  } finally {
    await c.page.close()
  }
})
