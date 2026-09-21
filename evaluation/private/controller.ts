import { chromium } from 'playwright'
import type { VariantId } from './answers.ts'

const controlUrl = () => `http://127.0.0.1:${process.env.ARENA_CONTROL_PORT ?? 4175}`
export const arenaUrl = () => process.env.ARENA_URL ?? `http://localhost:${process.env.ARENA_PORT ?? 4173}`
export async function controlRequest(path: string, body?: unknown): Promise<any> {
  const token = process.env.ARENA_CONTROL_TOKEN
  if (!token) throw new Error('ARENA_CONTROL_TOKEN required for private evaluation controller')
  const response = await fetch(`${controlUrl()}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization:`Bearer ${token}`, 'content-type':'application/json' }, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`Private controller ${path}: ${response.status}`)
  return response.json()
}
export async function assertIdle(): Promise<void> {
  const response = await fetch(`http://localhost:${process.env.PORT ?? 4111}/api/health`, {signal:AbortSignal.timeout(5000)})
  if (!response.ok) throw new Error('Cannot verify execution queue idle')
  const health = await response.json() as { activeRuns?: number; queuedRuns?: number }
  if (health.activeRuns !== 0 || health.queuedRuns !== 0) throw new Error('Queue must be explicitly idle before reset')
}
export async function resetAndVerify(variant: VariantId): Promise<Record<string, unknown>> {
  await assertIdle()
  await controlRequest('/__control/reset',{variant})
  const browser = await chromium.launch({headless:true})
  const page = await browser.newPage({viewport:{width:1280,height:720}})
  try {
    await page.goto(arenaUrl())
    await page.getByRole('button',{name:'Add to Cart',exact:true}).first().click()
    await page.getByRole('link',{name:/Cart/}).click()
    await page.getByRole('button',{name:'Proceed to Checkout'}).click()
    const button = page.getByTestId('pay-button')
    await button.waitFor({state:'visible'})
    if (['C1','C2'].includes(variant)) await page.getByTestId('checkout-overlay').waitFor({state:'visible'})
    const intercepted = await button.evaluate(el => {const r=el.getBoundingClientRect(); const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return !!hit && hit!==el && !el.contains(hit)})
    if (intercepted !== ['C1','C2'].includes(variant)) throw new Error('Overlay hit-test fixture mismatch')
    if (variant === 'C2') {
      if (await page.getByRole('button',{name:'Close',exact:true}).count()) throw new Error('Unexpected close path')
      return { valid:true, intercepted:true, closeAvailable:false }
    }
    if (variant === 'C1') await page.getByRole('button',{name:'Close',exact:true}).click()
    if (variant === 'C3') {
      if(await button.innerText() !== 'Complete Purchase') throw new Error('Renamed button missing')
      const bounds=await button.boundingBox(), back=await page.getByRole('button',{name:'Back',exact:true}).boundingBox()
      if(!bounds||!back||bounds.x<=back.x||bounds.x<0||bounds.y<0||bounds.x+bounds.width>1280||bounds.y+bounds.height>720)throw new Error('Moved button must remain reasonably visible')
    }
    await button.click()
    await page.locator('.payment-result').waitFor()
    const state = await controlRequest('/__control/state')
    const order = state.orders[0]
    const expected = variant==='C4'?'rejected':variant==='C5'?'failed':'paid'
    if (state.orders.length !== 1 || order.status !== expected || !(await page.locator('.payment-result').innerText()).includes(order.id)) throw new Error('Backend and visible result mismatch')
    if (variant === 'C4' || variant === 'C5') {
      const retry=page.getByTestId('retry-button')
      const start=Date.now()
      do {
        if (await retry.isEnabled() !== (variant === 'C4')) throw new Error('Retry availability fixture mismatch')
        await page.waitForTimeout(200)
      } while(Date.now()-start < 5250)
    }
    return {valid:true,intercepted,backendStatus:order.status,orderVisible:true,retryWindowVerified:['C4','C5'].includes(variant)}
  } finally {
    await browser.close()
    // Verification writes are erased before handing the neutral environment to the tested Agent.
    await controlRequest('/__control/reset',{variant})
    const clean=await controlRequest('/__control/state')
    if(clean.orderCount !== 0 || clean.cartSize !== 0) throw new Error('Reset did not clear verification side effects')
  }
}
