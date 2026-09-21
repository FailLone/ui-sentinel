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
  })

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
