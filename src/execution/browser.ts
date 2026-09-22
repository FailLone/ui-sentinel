import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'

const ARTIFACTS_DIR = path.resolve('data/artifacts')

export interface BrowserWorker {
  readonly browser: Browser
  readonly context: BrowserContext
  readonly page: Page
  close(): Promise<void>
}

export async function launchBrowser(options?: {
  headless?: boolean
  viewport?: { width: number; height: number }
}): Promise<BrowserWorker> {
  const browser = await chromium.launch({
    headless: options?.headless ?? true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })

  const context = await browser.newContext({
    viewport: options?.viewport ?? { width: 1280, height: 768 },
    serviceWorkers: 'block',
  })

  // tsx compiles with esbuild keepNames:true, injecting __name() wrappers
  // around named functions. The helper lives at module scope in Node but is
  // absent inside Playwright's browser evaluate context. String form avoids
  // the same transform being applied to this polyfill.
  await context.addInitScript('if(typeof __name==="undefined"){window.__name=function(fn){return fn}}')


  const page = await context.newPage()

  return {
    browser,
    context,
    page,
    async close() {
      await context.close()
      await browser.close()
    },
  }
}

export async function saveScreenshot(
  page: Page,
  runId: string,
  label: string,
): Promise<string> {
  const dir = path.join(ARTIFACTS_DIR, runId)
  await fs.mkdir(dir, { recursive: true })

  const filename = `${label}-${Date.now()}.png`
  const filepath = path.join(dir, filename)

  await page.screenshot({ path: filepath, fullPage: false })

  return filepath
}

export async function saveFullPageScreenshot(
  page: Page,
  runId: string,
  label: string,
): Promise<string> {
  const dir = path.join(ARTIFACTS_DIR, runId)
  await fs.mkdir(dir, { recursive: true })

  const filename = `${label}-full-${Date.now()}.png`
  const filepath = path.join(dir, filename)

  await page.screenshot({ path: filepath, fullPage: true })

  return filepath
}

/** Persist an artifact ID; the API resolves paths from the database, never model input. */
export async function saveEvidence(runId: string, type: string, data: Buffer | string, metadata: Record<string, unknown> = {}): Promise<string> {
  const { randomUUID } = await import('node:crypto')
  const { getDbClient } = await import('../storage/database.ts')
  const id = `${randomUUID()}.${type === 'screenshot' ? 'png' : 'json'}`
  const dir = path.join(ARTIFACTS_DIR, runId)
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, id)
  await fs.writeFile(file, data)
  await getDbClient().execute({ sql: 'INSERT INTO artifacts (id,run_id,type,file_path,metadata) VALUES (?,?,?,?,?)', args: [id, runId, type, file, JSON.stringify(metadata)] })
  return id
}

export function isAllowedPageUrl(raw: string, entryUrl: string): boolean {
  try {
    const u = new URL(raw)
    const pathname = decodeURIComponent(u.pathname)
    return u.origin === new URL(entryUrl).origin && /^https?:$/.test(u.protocol)
      && !pathname.includes('__control') && !pathname.includes('/evaluation')
      && !pathname.includes('/src/server')
      && !pathname.includes('/.git') && !pathname.includes('/.env')
  } catch { return false }
}

export async function observePage(page: Page, runId: string) {
  const screenshotPath = await saveEvidence(runId, 'screenshot', await page.screenshot({ fullPage: false }), { url: page.url(), viewport: page.viewportSize(), capturedAt: new Date().toISOString() })
  const observation = await page.evaluate(() => {
    function selector(el: Element): string {
      const parts: string[] = []
      for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
        const tag = n.tagName.toLowerCase()
        const siblings: Element[] = Array.from(n.parentElement?.children ?? []).filter(s => s.tagName === n!.tagName)
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(n) + 1})`)
      }
      return 'html > ' + parts.join(' > ')
    }
    const elements = Array.from(document.querySelectorAll('button,a,input,select,textarea,[role="button"],[role="dialog"],[role="alert"],h1,h2,p')).slice(0, 180).map(el => {
      const b = el.getBoundingClientRect(), style = getComputedStyle(el)
      const visible = b.width > 0 && b.height > 0 && style.visibility !== 'hidden' && style.display !== 'none'
      const bounds = { x: b.x, y: b.y, width: b.width, height: b.height }
      const points = [[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]]
      const hitSamples = points.map(([px,py]) => {
        const x = b.x + b.width * px, y = b.y + b.height * py
        const hit = document.elementFromPoint(x,y)
        const relation = !hit ? 'none' : hit === el ? 'self' : el.contains(hit) ? 'descendant' : hit.contains(el) ? 'ancestor' : 'unrelated'
        const hb = hit?.getBoundingClientRect()
        return { x,y,hitSelector:hit ? selector(hit) : null,relation, ...(hb ? { blockerBounds: { x:hb.x,y:hb.y,width:hb.width,height:hb.height } } : {}) }
      })
      return { selector:selector(el),tag:el.tagName.toLowerCase(),text:(el.textContent ?? '').trim().slice(0,700),visible,bounds,enabled: !('disabled' in el && el.disabled) && el.getAttribute('aria-disabled') !== 'true',attributes:Object.fromEntries(Array.from(el.attributes).filter(a => ['role','type','aria-label','aria-disabled','disabled','href'].includes(a.name)).map(a => [a.name,a.value])),hitSamples }
    })
    return { url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight},elements,text:document.body.innerText.slice(0,12000),observedAt:new Date().toISOString() }
  })
  const snapshot = { ...observation, screenshotPath }
  const snapshotRef = await saveEvidence(runId, 'snapshot', JSON.stringify(snapshot))
  return { snapshot, evidenceRefs: [screenshotPath,snapshotRef] }
}

/** Render a derived red-box copy in an isolated page; the inspected page is untouched. */
export async function annotateEvidence(browser: Browser, runId: string, sourceId: string, rectangles: readonly {x:number;y:number;width:number;height:number}[], viewport: {width:number;height:number}): Promise<string> {
  const { getDbClient }=await import('../storage/database.ts')
  const result=await getDbClient().execute({sql:'SELECT file_path FROM artifacts WHERE id=? AND run_id=? AND type=?',args:[sourceId,runId,'screenshot']})
  if(!result.rows.length)throw new Error('Original screenshot missing')
  const png=await fs.readFile(String(result.rows[0].file_path))
  const context=await browser.newContext({viewport,serviceWorkers:'block'})
  try {
    await context.route('**/*',r=>r.abort())
    const page=await context.newPage()
    const rects=rectangles.filter(r=>Object.values(r).every(Number.isFinite)&&r.width>0&&r.height>0)
    await page.setContent(`<style>body{margin:0}img,svg{position:absolute;inset:0}</style><img src="data:image/png;base64,${png.toString('base64')}"><svg width="${viewport.width}" height="${viewport.height}">${rects.map(r=>`<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="rgba(255,0,0,0.12)" stroke="red" stroke-width="3"/>`).join('')}</svg>`)
    await page.locator('img').evaluate((img:HTMLImageElement)=>img.decode())
    return saveEvidence(runId,'screenshot',await page.screenshot(),{annotation:true,sourceRef:sourceId,coordinateSource:'DOM hit-test',rectangles:rects})
  } finally {await context.close()}
}

export async function captureA11yTree(page: Page): Promise<string> {
  return page.locator('body').ariaSnapshot()
}

export function isAllowedNavigationUrl(raw: string, entryUrl: string): boolean {
  if(!isAllowedPageUrl(raw,entryUrl))return false
  const path=decodeURIComponent(new URL(raw).pathname)
  const entryPath=decodeURIComponent(new URL(entryUrl).pathname)
  return (path==='/'||path===entryPath) && !/\.(?:[cm]?[jt]sx?|json|map|md|ya?ml|toml)$/i.test(path) && !/^\/(?:api|src|node_modules|@)/.test(path)
}
