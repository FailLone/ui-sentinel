import { it, expect } from 'vitest'
import { createServer } from 'node:http'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchBrowser } from './browser.ts'
import { createRun, getEvents, getFindings } from './run-manager.ts'
import { createNativeInspection } from '../../scripts/experiments/native-inspection.ts'

async function fixture(html: string, atomic = false) {
  let writes = 0
  const web = createServer((req, res) => {
    if (req.method === 'POST') {
      writes++
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          success: false,
          status: 'failed',
          orderId: 'order-test',
          message: 'Try again',
          canRetry: true,
        }),
      )
    } else {
      res.setHeader('content-type', 'text/html')
      res.end(html)
    }
  })
  await new Promise<void>((r) => web.listen(0, '127.0.0.1', r))
  const url = `http://127.0.0.1:${(web.address() as any).port}`
  const run = await createRun({ goal: 'Inspect the page', environmentId: 'arena', entryUrl: url })
  const worker = await launchBrowser()
  const ac = new AbortController()
  const inspection = await createNativeInspection(worker.page, run.id, ac.signal, url, { atomic })
  await worker.page.goto(url)
  return {
    ...worker,
    run,
    ac,
    inspection,
    writes: () => writes,
    async close() {
      await inspection.close()
      await worker.close()
      web.closeAllConnections()
      await new Promise<void>((r) => web.close(() => r()))
      await rm(resolve('data/artifacts', run.id), { recursive: true, force: true })
    },
  }
}
const hypothesis = {
  phenomenon: 'Recovery control stays disabled',
  basis: 'Visible disabled button',
  verificationPlan: 'Measure actionability continuously',
  eventType: 'retryable-failure',
  target: 'recovery',
  condition: 'element-actionable',
  timeoutMs: 500,
}
const claim = {
  status: 'supported',
  title: 'Recovery unavailable during measured window',
  expected: 'An actionable recovery control',
  actual: 'All samples during the specified window were false',
  severity: 'error',
}

it('native inspection preserves supported pointer evidence and requires explicit completion', async () => {
  const f = await fixture(
    '<button style="position:absolute;left:30px;top:30px;width:160px;height:50px">Submit</button><div style="position:fixed;inset:0;background:#fff8;z-index:2">Campaign</div>',
  )
  try {
    const state = await f.inspection.observe()
    expect(state.elements.find((e) => e.tag === 'button')?.blockedPoints).toBe(5)
    expect(
      (await getFindings(f.run.id)).some(
        (finding) =>
          finding.source === 'rule' &&
          finding.validationStatus === 'supported' &&
          finding.evidenceRefs.length >= 2,
      ),
    ).toBe(true)
    expect((await getEvents(f.run.id)).some((e) => e.type === 'finish:accepted')).toBe(false)
    expect(await f.inspection.finish({ reason: 'observed-blocker' })).toMatchObject({
      status: 'blocked',
      businessResult: 'unknown',
    })
  } finally {
    await f.close()
  }
})

it('native tools require real continuous evidence and reject stale targets and unresolved finish', async () => {
  const f = await fixture('<button disabled>Retry</button>')
  try {
    const state = await f.inspection.observe()
    const h: any = await f.inspection.invoke('quality_hypothesis', hypothesis)
    await expect(
      f.inspection.invoke('quality_resolve', { ...claim, hypothesisId: h.hypothesisId }),
    ).rejects.toThrow('measurement')
    await expect(f.inspection.finish({ reason: 'scope-covered' })).rejects.toThrow('unresolved')
    await expect(
      f.inspection.invoke('quality_measure', {
        hypothesisId: h.hypothesisId,
        qualityRef: state.elements[0].qualityRef,
      }),
    ).rejects.toThrow('current qualityRef')
    const current = await f.inspection.observe()
    const measured: any = await f.inspection.invoke('quality_measure', {
      hypothesisId: h.hypothesisId,
      qualityRef: current.elements[0].qualityRef,
    })
    expect(measured.samples.length).toBeGreaterThanOrEqual(3)
    expect(measured.samples.every((s: any) => s.value === false)).toBe(true)
    await expect(
      f.inspection.invoke('quality_resolve', {
        ...claim,
        hypothesisId: h.hypothesisId,
        actual: 'A modal visually covers the button',
      }),
    ).rejects.toThrow('occlusion')
    await f.inspection.invoke('quality_resolve', { ...claim, hypothesisId: h.hypothesisId })
    expect(
      (await getFindings(f.run.id)).some(
        (finding) => finding.source === 'agent' && finding.validationStatus === 'supported',
      ),
    ).toBe(true)
  } finally {
    await f.close()
  }
})

it('native cancellation prevents late evidence', async () => {
  const f = await fixture(
    "<button onclick=\"fetch('/order',{method:'POST'})\">Pay</button><button disabled>Retry</button>",
  )
  try {
    await f.page.getByText('Pay', { exact: true }).click()
    await f.inspection.observe()
    const current = await f.inspection.observe()
    const h: any = await f.inspection.invoke('quality_hypothesis', {
      ...hypothesis,
      timeoutMs: 5000,
    })
    const measurement = f.inspection.invoke('quality_measure', {
      hypothesisId: h.hypothesisId,
      qualityRef: current.elements.find((e) => e.text === 'Retry')!.qualityRef,
    })
    setTimeout(() => f.ac.abort(Error('cancelled')), 80)
    await expect(measurement).rejects.toThrow('cancelled')
    expect((await getEvents(f.run.id)).some((e) => e.type === 'transition:observed')).toBe(false)
    await expect(f.inspection.finish({ reason: 'scope-covered' })).rejects.toThrow('cancelled')
  } finally {
    await f.close()
  }
})

it('native measurement refuses evidence when another browser input interrupts sampling', async () => {
  const f = await fixture('<button disabled>Retry</button><button>Other</button>')
  try {
    const current = await f.inspection.observe()
    const h: any = await f.inspection.invoke('quality_hypothesis', hypothesis)
    const measurement = f.inspection.invoke('quality_measure', {
      hypothesisId: h.hypothesisId,
      qualityRef: current.elements.find((e) => e.text === 'Retry')!.qualityRef,
    })
    const assertion = expect(measurement).rejects.toThrow('measurement-interrupted')
    await f.page.waitForTimeout(150)
    await f.page.getByText('Other', { exact: true }).click()
    await assertion
    expect((await getEvents(f.run.id)).some((e) => e.type === 'transition:observed')).toBe(false)
    await expect(
      f.inspection.invoke('quality_resolve', { ...claim, hypothesisId: h.hypothesisId }),
    ).rejects.toThrow('measurement')
  } finally {
    await f.close()
  }
})

it('does not invent epoch-long response timing after reload and keeps new-document input identity distinct', async () => {
  const f = await fixture(
    "<button onclick=\"document.querySelector('p').textContent='Changed'\">Go</button><p>Initial</p>",
  )
  try {
    await f.inspection.observe()
    await f.page.getByRole('button', { name: 'Go' }).click()
    await f.inspection.observe()
    const responses = async () =>
      (await getEvents(f.run.id)).filter((e) => e.type === 'response:observed')
    expect(await responses()).toHaveLength(1)
    await f.page.reload()
    await f.inspection.observe()
    expect(await responses()).toHaveLength(1)
    await f.page.getByRole('button', { name: 'Go' }).click()
    await f.inspection.observe()
    const measured = await responses()
    expect(measured).toHaveLength(2)
    expect(measured[0].payload.documentId).not.toBe(measured[1].payload.documentId)
    expect(
      measured.every(
        (e) => Number(e.payload.dispatchAt) > 0 && Number(e.payload.durationMs) < 10000,
      ),
    ).toBe(true)
    expect((await getFindings(f.run.id)).some((f) => f.ruleId === 'response-time')).toBe(false)
  } finally {
    await f.close()
  }
})

const atomicQuestion = {
  phenomenon: 'Recovery might be permanently unavailable',
  basis: 'Observed recovery control',
  trigger: 'always',
  target: 'recovery',
  condition: 'element-actionable',
  durationMs: 500,
  severity: 'error',
  freshWindowReason: '',
}

it('native atomic investigation saves a bounded result once and reuses only unchanged targets', async () => {
  const f = await fixture('<button disabled>Retry</button>', true)
  try {
    let state = await f.inspection.observe()
    const run = () =>
      f.inspection.invoke('quality_investigation', {
        ...atomicQuestion,
        qualityRef: state.elements[0].qualityRef,
      }) as Promise<any>
    const first = await run()
    expect(first).toMatchObject({
      verdict: 'fail',
      validationStatus: 'supported',
      reused: false,
      evidenceIntegrity: { status: 'clean' },
    })
    expect(first.sampleCount).toBeGreaterThanOrEqual(3)
    state = await f.inspection.observe()
    const reused = await run()
    expect(reused).toMatchObject({
      hypothesisId: first.hypothesisId,
      reused: true,
      window: first.window,
    })
    expect(
      (await getEvents(f.run.id)).filter((e) => e.type === 'transition:observed'),
    ).toHaveLength(1)
    const findings = (await getFindings(f.run.id)).filter((f) => f.source === 'agent')
    expect(findings).toHaveLength(1)
    expect(findings[0].title).not.toContain('permanently')
    expect(findings[0].actual).toContain('bounded observation')
    expect(state.hypotheses[0].status).toBe('supported')
    await f.page.evaluate(() => {
      const node = document.querySelector('button')!
      node.replaceWith(node.cloneNode(true))
    })
    await expect(run()).rejects.toThrow('stale-target')
    state = await f.inspection.observe()
    const replaced = await run()
    expect(replaced.reused).toBe(false)
    expect(replaced.hypothesisId).not.toBe(first.hypothesisId)
    state = await f.inspection.observe()
    const fresh: any = await f.inspection.invoke('quality_investigation', {
      ...atomicQuestion,
      qualityRef: state.elements[0].qualityRef,
      freshWindowReason: 'Check whether recovery became available in a later window',
    })
    expect(fresh.reused).toBe(false)
    expect(fresh.window.startedAtMs).toBeGreaterThan(replaced.window.startedAtMs)
  } finally {
    await f.close()
  }
})

it('native atomic investigation distinguishes visibility from actionability and refutes healthy controls', async () => {
  const f = await fixture('<button disabled>Retry</button><button>Resume</button>', true)
  try {
    let state = await f.inspection.observe()
    await expect(
      f.inspection.invoke('quality_investigation', {
        ...atomicQuestion,
        trigger: 'retryable-failure',
        qualityRef: state.elements[0].qualityRef,
      }),
    ).rejects.toThrow('trigger-not-observed')
    expect((await f.inspection.observe()).hypotheses).toHaveLength(0)
    state = await f.inspection.observe()
    const visible: any = await f.inspection.invoke('quality_investigation', {
      ...atomicQuestion,
      condition: 'element-visible',
      qualityRef: state.elements.find((e) => e.text === 'Retry')!.qualityRef,
    })
    expect(visible).toMatchObject({
      verdict: 'pass',
      validationStatus: 'refuted',
      findingId: undefined,
    })
    state = await f.inspection.observe()
    const healthy: any = await f.inspection.invoke('quality_investigation', {
      ...atomicQuestion,
      qualityRef: state.elements.find((e) => e.text === 'Resume')!.qualityRef,
    })
    expect(healthy).toMatchObject({ verdict: 'pass', validationStatus: 'refuted' })
    expect((await getFindings(f.run.id)).filter((f) => f.source === 'agent')).toHaveLength(0)
  } finally {
    await f.close()
  }
})

it('native write intervention invalidates atomic reuse, legacy claims and clean completion without erasing prior findings', async () => {
  const f = await fixture(
    `<button onclick="fetch('/order',{method:'POST'})">Pay</button><button disabled>Retry</button>`,
    true,
  )
  try {
    await f.page.getByText('Pay', { exact: true }).click()
    let state = await f.inspection.observe()
    const question = { ...atomicQuestion, trigger: 'retryable-failure' }
    const first: any = await f.inspection.invoke('quality_investigation', {
      ...question,
      qualityRef: state.elements.find((e) => e.text === 'Retry')!.qualityRef,
    })
    expect(first.verdict).toBe('fail')
    const count = (await getFindings(f.run.id)).length
    // Programmatic site request: no user input and no DOM mutation. Integrity alone invalidates reuse.
    await f.page.evaluate(() => fetch('/order', { method: 'POST' }).catch(() => null))
    expect(f.writes()).toBe(1)
    expect(f.inspection.stats().deniedWrites).toBe(1)
    expect(await f.inspection.afterStep()).toEqual({ changed: true })
    state = await f.inspection.observe()
    expect(state.evidenceIntegrity.status).toBe('intervened')
    expect(state.gaps).toHaveLength(1)
    const second: any = await f.inspection.invoke('quality_investigation', {
      ...question,
      qualityRef: state.elements.find((e) => e.text === 'Retry')!.qualityRef,
    })
    expect(second).toMatchObject({
      verdict: 'unknown',
      validationStatus: 'inconclusive',
      reused: false,
      sampleCount: 0,
    })
    state = await f.inspection.observe()
    const legacy: any = await f.inspection.invoke('quality_hypothesis', hypothesis)
    const measured: any = await f.inspection.invoke('quality_measure', {
      hypothesisId: legacy.hypothesisId,
      qualityRef: state.elements.find((e) => e.text === 'Retry')!.qualityRef,
    })
    expect(measured.evidenceIntegrity.status).toBe('intervened')
    await expect(
      f.inspection.invoke('quality_resolve', { ...claim, hypothesisId: legacy.hypothesisId }),
    ).rejects.toThrow('measurement')
    expect(await f.inspection.finish({ reason: 'scope-covered' })).toMatchObject({
      status: 'blocked',
      stopReason: 'finish-incomplete',
    })
    expect(await getFindings(f.run.id)).toHaveLength(count)
    await f.page.reload()
    expect((await f.inspection.observe()).evidenceIntegrity.status).toBe('intervened')
  } finally {
    await f.close()
  }
})

it('native atomic investigation cannot save a claim after concurrent browser input', async () => {
  const f = await fixture('<button disabled>Retry</button><button>Other</button>', true)
  try {
    const state = await f.inspection.observe()
    const result = f.inspection.invoke('quality_investigation', {
      ...atomicQuestion,
      qualityRef: state.elements[0].qualityRef,
    })
    const assertion = expect(result).rejects.toThrow('measurement-interrupted')
    await f.page.waitForTimeout(180)
    await f.page.getByText('Other', { exact: true }).click()
    await assertion
    expect((await getFindings(f.run.id)).filter((f) => f.source === 'agent')).toHaveLength(0)
    await expect(f.inspection.finish({ reason: 'scope-covered' })).rejects.toThrow('unresolved')
  } finally {
    await f.close()
  }
})
