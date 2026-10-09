import { it, expect } from 'vitest'
import { launchBrowser } from './browser.ts'
import { measureInteraction } from './interaction-verification.ts'
import { overlayBlockingRule } from '../rules/builtin/overlay-blocking.ts'
it('measures real numeric order and refuses ambiguous or unsupported predicates', async () => {
  const w = await launchBrowser()
  try {
    await w.page.setContent('<ul><li>20</li><li>5</li><li>12</li></ul>')
    const input = {
      selector: 'li',
      condition: 'numeric-ascending' as const,
      basis: 'Prices should be ascending',
    }
    expect((await measureInteraction(w.page, input)).outcome).toBe('failed')
    await w.page.setContent('<ul><li>5</li><li>12</li><li>20</li></ul>')
    expect((await measureInteraction(w.page, input)).outcome).toBe('verified')
    // A single container must not fall through to text equality and falsely verify order.
    for (const condition of ['numeric-ascending', 'numeric-descending'] as const) {
      expect(
        (
          await measureInteraction(w.page, {
            ...input,
            selector: 'ul',
            condition,
            expected: '51220',
          })
        ).outcome,
      ).toBe('unverified')
      expect(
        (
          await measureInteraction(w.page, {
            ...input,
            selector: 'missing',
            condition,
            expected: '',
          })
        ).outcome,
      ).toBe('unverified')
    }
    expect(
      (await measureInteraction(w.page, { ...input, condition: 'text-equals', expected: '5' }))
        .outcome,
    ).toBe('unverified')
  } finally {
    await w.close()
  }
})
it('does not flag intentional modal background or inert/disabled controls as overlay defects', async () => {
  const element = {
    tag: 'button',
    text: 'background',
    visible: true,
    enabled: true,
    selector: '#background',
    attributes: {},
    bounds: { x: 0, y: 0, width: 20, height: 20 },
    interactionExcludedReason: 'modal-background',
    hitSamples: Array.from({ length: 5 }, () => ({
      relation: 'unrelated',
      x: 1,
      y: 1,
      hitSelector: '#dialog',
    })),
  }
  const context = {
    snapshot: {
      elements: [element],
      viewport: { width: 100, height: 100 },
      screenshotPath: 'shot',
    },
  } as any
  expect((await overlayBlockingRule.evaluate(context)).verdict).toBe('not-applicable')
  delete (element as any).interactionExcludedReason
  expect((await overlayBlockingRule.evaluate(context)).verdict).toBe('fail')
})

it('observes modal and inert applicability from the live DOM rather than page-provided verdicts', async () => {
  const { initDatabase } = await import('../storage/database.ts')
  await initDatabase()
  const { observePage } = await import('./browser.ts')
  const { createRun } = await import('./run-manager.ts')
  const { rm } = await import('node:fs/promises')
  const w = await launchBrowser()
  const { id: runId } = await createRun({
    goal: 'Observe modal applicability',
    environmentId: 'test',
    entryUrl: 'about:blank',
  })
  try {
    await w.page.setContent(
      '<button>Background</button><div inert><button>Inert control</button></div><dialog><button>Close</button></dialog>',
    )
    await w.page.locator('dialog').evaluate((d: HTMLDialogElement) => d.showModal())
    const { snapshot } = await observePage(w.page, runId)
    expect(snapshot.elements.find((e) => e.text === 'Background')?.interactionExcludedReason).toBe(
      'modal-background',
    )
    expect(
      snapshot.elements.find((e) => e.text === 'Inert control')?.interactionExcludedReason,
    ).toBe('inert')
    expect(
      snapshot.elements.find((e) => e.text === 'Close')?.interactionExcludedReason,
    ).toBeUndefined()
  } finally {
    await w.close()
    await rm(`data/artifacts/${runId}`, { recursive: true, force: true })
  }
})

it('does not report offscreen or intentionally disabled controls as intercepted foreground actions', async () => {
  const { createRun } = await import('./run-manager.ts')
  const { observePage } = await import('./browser.ts')
  const { rm } = await import('node:fs/promises')
  const { id } = await createRun({
    goal: 'Check foreground controls',
    environmentId: 'test',
    entryUrl: 'about:blank',
  })
  const worker = await launchBrowser()
  try {
    await worker.page.setContent(
      '<button disabled>Unavailable</button><button style="position:absolute;top:2500px">Below viewport</button><button>Available</button>',
    )
    const { snapshot } = await observePage(worker.page, id)
    expect(snapshot.elements.find((e) => e.text === 'Unavailable')?.enabled).toBe(false)
    expect(
      snapshot.elements
        .find((e) => e.text === 'Below viewport')
        ?.hitSamples?.every((s) => s.relation === 'none'),
    ).toBe(true)
    expect((await overlayBlockingRule.evaluate({ snapshot } as any)).verdict).not.toBe('fail')
  } finally {
    await worker.close()
    await rm(`data/artifacts/${id}`, { recursive: true, force: true })
  }
})

it('keeps select labels separate from DOM values and rejects ambiguous pre-action contracts', async () => {
  const { assertInteractionExpectation } = await import('./interaction-verification.ts')
  const w = await launchBrowser()
  try {
    await w.page.setContent(
      '<select><option value="internal-42">Public choice</option></select><p>Public choice</p>',
    )
    const input = {
      selector: 'select',
      condition: 'value-equals' as const,
      expected: 'Public choice',
      basis: 'The public selected label',
    }
    await expect(assertInteractionExpectation(w.page, input)).rejects.toThrow(
      'verification-value-is-label',
    )
    expect((await measureInteraction(w.page, input)).outcome).toBe('failed')
    await expect(
      assertInteractionExpectation(w.page, { ...input, expected: 'internal-42' }),
    ).resolves.toBeUndefined()
    expect((await measureInteraction(w.page, { ...input, expected: 'internal-42' })).outcome).toBe(
      'verified',
    )
    const label = { ...input, condition: 'selected-label-equals' as const }
    expect((await measureInteraction(w.page, label)).outcome).toBe('verified')
    expect((await measureInteraction(w.page, { ...label, expected: 'Other choice' })).outcome).toBe(
      'failed',
    )
    expect((await measureInteraction(w.page, { ...label, selector: 'p' })).outcome).toBe(
      'unverified',
    )
    await w.page.locator('select').evaluate((s: HTMLSelectElement) => {
      s.multiple = true
    })
    expect((await measureInteraction(w.page, label)).outcome).toBe('unverified')
  } finally {
    await w.close()
  }
})
