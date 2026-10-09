/**
 * A minimal PNG reader for evaluation code.
 *
 * The visual-focus fixtures make claims about what a screenshot shows - in particular that a search
 * field is visibly distinct from the page. Those claims have to be checked against the pixels that
 * were actually rendered, not against the CSS that was supposed to produce them, so the tests read
 * the real screenshot back.
 *
 * Deliberately narrow: 8-bit, non-interlaced, RGB or RGBA, which is what Chromium's
 * `page.screenshot` produces and what the checks below need. Anything else is refused rather than
 * approximated, because a silently mis-decoded image would produce a confident wrong colour.
 */
import { inflateSync } from 'node:zlib'

export interface Png {
  readonly width: number
  readonly height: number
  /** The RGB triple at an integer pixel. Throws when the coordinate is outside the image. */
  at(x: number, y: number): readonly [number, number, number]
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export function readPng(bytes: Uint8Array): Png {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (buffer.length < 8 || buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not-a-png')

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat: Buffer[] = []
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]!
      colorType = data[9]!
      if (data[12] !== 0) throw new Error('interlaced-png-unsupported')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (bitDepth !== 8) throw new Error(`png-bit-depth-unsupported:${bitDepth}`)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels) throw new Error(`png-color-type-unsupported:${colorType}`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  if (raw.length < height * (stride + 1)) throw new Error('png-truncated')
  const out = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[y * stride + x - channels]! : 0
      const up = y > 0 ? out[(y - 1) * stride + x]! : 0
      const upLeft = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels]! : 0
      let value = line[x]!
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) value += paeth(left, up, upLeft)
      else if (filter !== 0) throw new Error(`png-filter-unsupported:${filter}`)
      out[y * stride + x] = value & 0xff
    }
  }
  return {
    width,
    height,
    at(x, y) {
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        x >= width ||
        y >= height
      )
        throw new Error(`png-coordinate-outside-image:${x},${y}`)
      const i = y * stride + x * channels
      return [out[i]!, out[i + 1]!, out[i + 2]!]
    },
  }
}

/**
 * The largest per-channel difference between two colours.
 *
 * A maximum rather than a mean: a shape whose border differs sharply but whose fill does not is
 * still visible, and averaging would report it as faint. This is the same measure the visual-focus
 * fixture's perceivability check is stated in.
 */
export function channelDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}
