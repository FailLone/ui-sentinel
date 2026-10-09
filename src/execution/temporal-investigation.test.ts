import { expect, it } from 'vitest'
import { launchBrowser, sampleBoundElementCondition } from './browser.ts'
import { readObservationVersion } from './observation-version.ts'
import { sampleWindow } from './sample-window.ts'
import {
  createTemporalInvestigator,
  type TemporalInvestigationInput,
} from './temporal-investigation.ts'

const input: TemporalInvestigationInput = {
  phenomenon: 'Recovery is unavailable',
  basis: 'Observed disabled control after an eligible failure',
  trigger: 'always',
  elementRef: 'target',
  target: 'recovery control',
  condition: 'element-actionable',
  durationMs: 500,
  severity: 'warning',
  freshWindowReason: '',
}
async function fixture(html = '<button id="target" disabled>Resume export</button>') {
  const worker = await launchBrowser()
  await worker.page.setContent(html)
  let epoch = 0,
    recorded = 0,
    measured = 0,
    reused = 0
  const completed: any[] = []
  const controller = new AbortController()
  const version = async () => {
    const v = await readObservationVersion(worker.page)
    return v.reusable ? v.key : undefined
  }
  const investigator = createTemporalInvestigator({
    guard: () => controller.signal.throwIfAborted(),
    epoch: () => String(epoch),
    version,
    bind: async (ref) => {
      if (ref !== 'target') throw Error('unknown ref')
      const handle = await worker.page.locator('#target').elementHandle()
      if (!handle) throw Error('missing target')
      return { handle, selector: '#target', version: await version() }
    },
    record: async () => `hyp-${++recorded}`,
    measure: async (i, bound) => {
      measured++
      const window = await sampleWindow({
        durationMs: i.durationMs,
        guard: () => controller.signal.throwIfAborted(),
        sample: () => sampleBoundElementCondition(bound.handle, i.condition),
      })
      return {
        ...window,
        observedUntilMs: Date.now(),
        condition: i.condition,
        eventType: i.trigger,
        samples: window.samples.map((s) => ({ ...s, target: i.target })),
        evidenceRefs: [`measurement-${measured}`],
      }
    },
    complete: async (_i, result, actual) => {
      completed.push({ ...result, actual })
      return result.verdict === 'fail' ? `finding-${recorded}` : undefined
    },
    reused: async () => {
      reused++
    },
  })
  return {
    ...worker,
    investigator,
    controller,
    completed,
    nextOperation: () => {
      epoch++
    },
    stats: () => ({ recorded, measured, reused }),
    close: async () => {
      await investigator.close()
      await worker.close()
    },
  }
}

it('evaluates once, preserves the original window on reuse, and permits an explicit new question', async () => {
  const f = await fixture()
  try {
    const first = await f.investigator.run(input)
    expect(first).toMatchObject({
      verdict: 'fail',
      validationStatus: 'supported',
      findingId: 'finding-1',
      reused: false,
    })
    const repeated = await f.investigator.run({
      ...input,
      phenomenon: 'Same physical assertion, different wording',
    })
    expect(repeated).toMatchObject({
      hypothesisId: first.hypothesisId,
      window: first.window,
      reused: true,
    })
    expect(f.stats()).toEqual({ recorded: 1, measured: 1, reused: 1 })
    expect(f.completed[0].actual).toContain('bounded observation')
    expect(f.completed[0].actual).not.toContain('permanently disabled')
    await f.investigator.run({
      ...input,
      freshWindowReason: 'Check a later recovery interval separately',
    })
    expect(f.stats().measured).toBe(2)
    f.nextOperation()
    await f.investigator.run(input)
    expect(f.stats().measured).toBe(3)
  } finally {
    await f.close()
  }
})

it('does not reuse results across predicate, DOM state or node identity changes', async () => {
  const f = await fixture()
  try {
    await f.investigator.run(input)
    const visibility = await f.investigator.run({ ...input, condition: 'element-visible' })
    expect(visibility).toMatchObject({ verdict: 'pass', findingId: undefined, reused: false })
    await f.page.locator('#target').evaluate((el) => el.removeAttribute('disabled'))
    const healthy = await f.investigator.run(input)
    expect(healthy).toMatchObject({ verdict: 'pass', validationStatus: 'refuted', reused: false })
    await f.page.locator('#target').evaluate((el) => el.replaceWith(el.cloneNode(true)))
    expect((await f.investigator.run(input)).reused).toBe(false)
    expect(f.stats().measured).toBe(4)
  } finally {
    await f.close()
  }
})

it('retains the bound node; replacement during a window is unknown, never a supported defect', async () => {
  const f = await fixture()
  try {
    const pending = f.investigator.run(input)
    await f.page.waitForTimeout(250)
    await f.page.locator('#target').evaluate((el) => el.replaceWith(el.cloneNode(true)))
    expect(await pending).toMatchObject({
      verdict: 'unknown',
      validationStatus: 'inconclusive',
      findingId: undefined,
    })
    expect((await f.investigator.run(input)).reused).toBe(false)
  } finally {
    await f.close()
  }
})

it('aborts a running measurement without publishing a completed verdict', async () => {
  const f = await fixture()
  try {
    const pending = f.investigator.run({ ...input, durationMs: 1500 })
    const rejected = expect(pending).rejects.toThrow('stop test')
    await f.page.waitForTimeout(250)
    f.controller.abort(Error('stop test'))
    await rejected
    expect(f.completed).toEqual([])
  } finally {
    await f.close()
  }
})

it('retains declared supporting evidence separately from the measured predicate', async () => {
  const f = await fixture()
  try {
    const result = await f.investigator.run({ ...input, evidenceRefs: ['resource-owned'] })
    expect(result.evidenceRefs).toEqual(['measurement-1', 'resource-owned'])
    expect(result.verdict).toBe('fail')
    expect(f.completed[0].evidenceRefs).toContain('resource-owned')
  } finally {
    await f.close()
  }
})
