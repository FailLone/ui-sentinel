import { describe, expect, it, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  getArenaState,
  getVisualPresent,
  publicVisualToken,
  resetState,
  setVisualPresent,
  VISUAL_PRESENTS,
  type VisualPresent,
} from './state.ts'

beforeEach(() => resetState('C0'))

describe('arena visual presence (presentation only, no case identity)', () => {
  it('starts with no search region so C0-C5 behave exactly as before', () => {
    expect(getVisualPresent()).toBeNull()
  })

  it('accepts each presence the focus cases need', () => {
    for (const present of VISUAL_PRESENTS) {
      setVisualPresent(present)
      expect(getVisualPresent()).toBe(present)
    }
  })

  it('carries only presentation: no case name, truth or target geometry', () => {
    setVisualPresent('search-padded-narrow-input')
    // Exposed through the public variant-config, so it must not describe a case or its answer.
    const serialized = JSON.stringify(getVisualPresent())
    expect(serialized).not.toMatch(/\bD[0-9]\b|\bH[0-9]\b|groundTruth|targetBox|case/i)
  })

  it('exposes an opaque public token for every presentation, and never the presentation name', () => {
    // The page may learn how its own search area is drawn; it must not learn which case it is, and
    // the token must not read as "the healthy one". Opaque indices keep any behavioural difference
    // out of the public vocabulary, so a token can never be the answer.
    const tokens = VISUAL_PRESENTS.map((present) => publicVisualToken(present))
    expect(new Set(tokens).size).toBe(VISUAL_PRESENTS.length)
    for (const [index, token] of tokens.entries()) {
      expect(token).toBeTruthy()
      expect(token).not.toMatch(
        /\bD[0-9]\b|\bH[0-9]\b|proxied|delegat|focus|narrow|padded|bounded/i,
      )
      expect(VISUAL_PRESENTS[index]).not.toBe(token)
    }
  })

  it('answers for a presentation it does not know rather than guessing one', () => {
    // A future presentation added without a token would otherwise silently inherit another case's
    // drawing and the two would be conflated on the page.
    expect(() => publicVisualToken('not-a-presentation' as VisualPresent)).toThrow()
  })

  it('is cleared when the arena resets to a variant', () => {
    setVisualPresent('search-padded-narrow-input')
    resetState('C0')
    expect(getVisualPresent()).toBeNull()
  })

  it('is reported through the arena state readout', () => {
    setVisualPresent('search-padded-narrow-input')
    expect(getArenaState().visualPresent).toBe('search-padded-narrow-input')
  })

  it('reports no presence for a plain variant run', () => {
    expect(getArenaState().visualPresent).toBeNull()
  })
})

describe('every presentation has a drawing, and the twins share one', () => {
  const source = () => readFile(new URL('../pages/ProductSearch.tsx', import.meta.url), 'utf8')

  it('gives every presentation a layout entry', async () => {
    // A presentation with no entry silently falls back to the default drawing, which would make two
    // different cases render identically and quietly invalidate any comparison between them.
    const text = await source()
    for (const [index, present] of VISUAL_PRESENTS.entries()) {
      const token = publicVisualToken(present)
      expect(token).toBe(`v${index + 1}`)
      expect(text).toMatch(new RegExp(`^\\s*${token}: \\{`, 'm'))
    }
  })

  it('draws the defect and its healthy twin from the same field and input boxes', async () => {
    // Plan 4.2 requires the broken and repaired pages to look the same, so the screenshot can only
    // propose a hypothesis and the interaction has to decide it. v1/v2, v5/v6 and v3/v5's twins must
    // not drift apart: each pair shares one style object rather than repeating the values.
    const text = await source()
    // Each layout is a multi-line object, so the entry is read as a block rather than a line: the
    // pair must agree on the field and input they draw, however the object happens to be wrapped.
    const entry = (token: string) => {
      const start = text.indexOf(`\n  ${token}: {`)
      expect(`${token} present: ${start >= 0}`).toBe(`${token} present: true`)
      const end = text.indexOf('\n  },', start)
      return text.slice(start, end < 0 ? undefined : end)
    }
    for (const [broken, healthy] of [
      ['v1', 'v2'],
      ['v5', 'v6'],
    ]) {
      const names = (block: string) => ({
        field: block.match(/field: FIELD\.(\w+)/)?.[1],
        input: block.match(/input: \{ \.\.\.INPUT\.(\w+)/)?.[1],
      })
      const defect = names(entry(broken!))
      const twin = names(entry(healthy!))
      expect(defect.field).toBeTruthy()
      expect(defect).toEqual(twin)
      // They must differ in the one thing a screenshot cannot show.
      expect(entry(broken!)).toContain("proxy: 'none'")
      expect(entry(healthy!)).not.toContain("proxy: 'none'")
    }
  })

  it('never renders a marker that names the behaviour', async () => {
    // The token identifies the drawing to the component; nothing in the DOM may report which
    // presentation is active, because "label proxy" versus "no proxy" is the case's whole answer.
    // Comments are stripped first: the claim is about what the page renders, and the file's own
    // comment explains this rule by naming the very attribute it forbids.
    const code = (await source())
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n')
    expect(code).not.toMatch(/data-(proxy|present|case|visual|behaviour|behavior)/)
  })
})

describe('visual presence vocabulary', () => {
  it('names the presentations the six cases differ by', () => {
    expect(VISUAL_PRESENTS).toContain('search-padded-narrow-input')
    expect(VISUAL_PRESENTS).toContain('search-proxied-wide-region')
    // The holdouts need their own drawings: a bounded input with card decoration beside it, an
    // offset field drawn in a different palette, a labelled field with a glyph inside its padding,
    // and the labelled field whose delegate works. The last two must be separate entries: one is the
    // defect and the other is its healthy twin, and sharing an entry would make them the same page.
    expect(VISUAL_PRESENTS).toContain('search-bounded-line-card')
    expect(VISUAL_PRESENTS).toContain('search-warm-offset-field')
    expect(VISUAL_PRESENTS).toContain('search-label-icon-field')
    expect(VISUAL_PRESENTS).toContain('search-labelled-proxy-field')
  })

  it('keeps the defect and its healthy twin as distinct presentations', () => {
    // A single entry for both would render one page for two cases and silently delete the comparison.
    expect(VISUAL_PRESENTS.filter((p) => p.startsWith('search-label'))).toHaveLength(2)
  })
})
