import { readFile } from 'node:fs/promises'
import type { Browser } from 'playwright'
import { getDbClient } from '../storage/database.ts'
import { saveEvidence } from './browser.ts'
import type { Rect } from './focus-geometry.ts'
import type { FocusReceipt } from './focus-receipt.ts'

/** Derived evidence only. This page never runs in the inspected browser context. */
export async function annotateFocus(
  browser: Browser,
  runId: string,
  region: Rect,
  input: Rect,
  receipt: FocusReceipt,
  guard: () => void,
) {
  const rows = await getDbClient().execute({
    sql: 'SELECT file_path,metadata FROM artifacts WHERE run_id=? AND id=? AND type=?',
    args: [runId, receipt.screenshotRef, 'screenshot'],
  })
  if (!rows.rows.length) throw Error('original-screenshot-missing')
  const png = await readFile(String(rows.rows[0].file_path))
  const context = await browser.newContext({ viewport: receipt.viewport, serviceWorkers: 'block' })
  try {
    const page = await context.newPage()
    await context.route('**/*', (r) => r.abort())
    const rect = (r: Rect, style: string) =>
      `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" ${style}/>`
    const points = [receipt.positiveControl, ...receipt.samples]
      .map((s, i) => {
        const color = !s.stable ? '#a16207' : s.focusedWithinMs === null ? '#dc2626' : '#15803d'
        return `<circle cx="${s.x}" cy="${s.y}" r="5" fill="${color}" stroke="white"/><text x="${s.x + 7}" y="${s.y - 7}" fill="${color}" font-size="14">${i === 0 ? 'C' : i}</text>`
      })
      .join('')
    await page.setContent(
      `<style>body{margin:0}img,svg{position:absolute;inset:0}</style><img src="data:image/png;base64,${png.toString('base64')}"><svg width="${receipt.viewport.width}" height="${receipt.viewport.height}">${rect(region, 'stroke="#7c3aed" stroke-dasharray="6 4" stroke-width="2"')}${rect(input, 'stroke="#0369a1" stroke-width="2"')}${points}<rect x="4" y="4" width="760" height="25" fill="white"/><text x="10" y="22" font-size="13">Dashed: perceived region | Blue: input | Green: focus | Red: no focus | Amber: unknown | C: control</text></svg>`,
    )
    await page.locator('img').evaluate((img: HTMLImageElement) => img.decode())
    const image = await page.screenshot({ scale: 'css' })
    guard()
    return await saveEvidence(
      runId,
      'screenshot',
      image,
      {
        ...JSON.parse(String(rows.rows[0].metadata)),
        annotation: true,
        kind: 'focus-annotation',
        sourceRef: receipt.screenshotRef,
        candidateId: receipt.candidateId,
        coordinateSource: 'CSS viewport sampled points',
      },
      guard,
    )
  } finally {
    await context.close()
  }
}
