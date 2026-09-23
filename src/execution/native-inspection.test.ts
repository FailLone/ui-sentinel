import { it, expect } from 'vitest'
import { createServer } from 'node:http'
import { rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { launchBrowser } from './browser.ts'
import { createRun, getEvents, getFindings } from './run-manager.ts'
import { createNativeInspection } from '../../scripts/experiments/native-inspection.ts'

async function fixture(html: string) {
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
  const inspection = await createNativeInspection(worker.page, run.id, ac.signal, url)
  await worker.page.goto(url)
  return {
    ...worker,
    run,
    ac,
    inspection,
    writes: () => writes,
    async close() {
      inspection.close()
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

it('native browser writes share a single-order boundary and cancellation prevents late evidence', async () => {
  const f = await fixture(
    "<button onclick=\"fetch('/order',{method:'POST'})\">Pay</button><button disabled>Retry</button>",
  )
  try {
    await f.page.getByText('Pay', { exact: true }).click()
    await f.inspection.observe()
    await f.page.getByText('Pay', { exact: true }).click()
    await f.page.waitForTimeout(50)
    expect(f.writes()).toBe(1)
    expect(f.inspection.stats().deniedWrites).toBe(1)
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
