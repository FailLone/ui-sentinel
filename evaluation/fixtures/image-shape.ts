import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import type { ImageShapeContract } from '../../src/rules/image-shape.ts'

// Synthetic fixture: a circular mark with transparent margins in a 120x60 PNG canvas.
// This is not the unavailable Jira 028 image, QR code or a recovered design attachment.
function chunk(type: string, bytes: Buffer) {
  const body = Buffer.concat([Buffer.from(type), bytes])
  let crc = 0xffffffff
  for (const byte of body) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  const size = Buffer.alloc(4),
    checksum = Buffer.alloc(4)
  size.writeUInt32BE(bytes.length)
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([size, body, checksum])
}
const header = Buffer.alloc(13)
header.writeUInt32BE(120, 0)
header.writeUInt32BE(60, 4)
header[8] = 8
header[9] = 6
const pixels = Buffer.alloc(60 * (120 * 4 + 1))
for (let y = 0; y < 60; y++)
  for (let x = 0; x < 120; x++) {
    const at = y * 481 + 1 + x * 4
    pixels[at] = 25
    pixels[at + 1] = 90
    pixels[at + 2] = 210
    pixels[at + 3] = (x - 60) ** 2 + (y - 30) ** 2 <= 24 ** 2 ? 255 : 0
  }
export const imagePng = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(pixels)),
  chunk('IEND', Buffer.alloc(0)),
])
export const imageDataUrl = `data:image/png;base64,${imagePng.toString('base64')}`
export function imageContract(
  pageUrl = 'about:blank',
  resourceUrl = imageDataUrl,
): ImageShapeContract {
  return {
    id: 'synthetic-brand-shape',
    pageUrl,
    selector: 'img',
    resourceUrl,
    resourceSha256: createHash('sha256').update(imagePng).digest('hex'),
    viewport: { width: 1280, height: 768 },
    intent: 'preserve',
    basis: {
      reference: 'evaluation/fixtures/image-shape.ts',
      confirmedBy: 'synthetic fixture author',
      statement:
        'For this synthetic design, preserve the circular mark in this exact raster; cropping is permitted. Not Jira evidence.',
    },
  }
}
export function imageHtml(
  style = '',
  resourceUrl = imageDataUrl,
  outer = '',
  alt = 'Brand emblem',
) {
  return `<!doctype html><html><head><title>Synthetic image shape fixture</title></head><body style="margin:80px"><div style="${outer}"><img alt="${alt}" src="${resourceUrl}" style="width:240px;height:120px;${style}"></div></body></html>`
}
