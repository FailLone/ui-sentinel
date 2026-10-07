import { it, expect } from 'vitest'
import { chromium } from 'playwright'
import { createInteractionRecovery } from './interaction-recovery.ts'
import { measureInteraction } from './interaction-verification.ts'
it('recovers only the frozen original check, with bounded reads and no actions', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  let version = 1,
    hash = 'owned',
    clean = true,
    calls = 0
  const recovery = createInteractionRecovery({
    page: () => page,
    actionVersion: () => version,
    clean: () => clean,
    guard: () => {},
    hashEvidence: async () => ({ source: hash }),
  })
  try {
    await page.setContent('<div id="result"></div>')
    const input = {
      actionId: 'action',
      itemId: 'item',
      input: {
        selector: '#result span',
        condition: 'text-equals' as const,
        expected: 'Ready',
        basis: 'Public action feedback',
      },
    }
    const check = await recovery.register(input, ['source'])
    input.input.expected = 'Changed after dispatch'
    const measure = async (c: any, guard: () => Promise<void>) => {
      calls++
      await guard()
      return measureInteraction(page, c.input)
    }
    expect((await recovery.run(check.checkRef, measure)).outcome).toBe('unverified')
    await page.locator('#result').evaluate((e) => (e.innerHTML = '<span>Ready</span>'))
    expect((await recovery.run(check.checkRef, measure)).outcome).toBe('verified')
    await expect(recovery.run(check.checkRef, measure)).rejects.toThrow('unavailable')
    await expect(recovery.run('other-run-ref', measure)).rejects.toThrow('unavailable')
    expect(calls).toBe(2)
    for (const cause of ['action', 'evidence', 'intervention', 'document']) {
      const c = await recovery.register(
        { ...input, input: { ...input.input, expected: 'Ready' } },
        ['source'],
      )
      if (cause === 'action') version++
      if (cause === 'evidence') hash = 'changed'
      if (cause === 'intervention') clean = false
      if (cause === 'document') await page.setContent('<div id="result"><span>Ready</span></div>')
      await expect(recovery.run(c.checkRef, measure)).rejects.toThrow(/stale|changed/)
      clean = true
    }
  } finally {
    await recovery.dispose()
    await browser.close()
  }
})
it('rejects a result replaced during evidence capture instead of silently rebinding', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  try {
    await page.setContent('<p id="result">Ready</p>')
    const r = await measureInteraction(
      page,
      {
        selector: '#result',
        condition: 'text-equals',
        expected: 'Ready',
        basis: 'Public feedback',
      },
      async () => {
        await page.locator('#result').evaluate((e) => (e.outerHTML = '<p id="result">Ready</p>'))
        return ['shot']
      },
    )
    expect(r.outcome).toBe('unverified')
  } finally {
    await browser.close()
  }
})
