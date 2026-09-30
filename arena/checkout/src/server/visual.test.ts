import { describe, expect, it, beforeEach } from 'vitest'
import { readFile } from 'node:fs/promises'
import {
  getArenaState,
  getVisualPresent,
  resetState,
  setVisualPresent,
  VISUAL_PRESENTS,
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

describe('the two presentations share one field style', () => {
  // Plan 4.2 requires the defective and the repaired page to look the same, so that the screenshot
  // can only propose a hypothesis and the interaction has to decide it. The styles now come from one
  // shared object, and this fails if they are ever split back into two that can drift apart.
  it('renders both presentations from the same style object', async () => {
    const source = await readFile(new URL('../pages/ProductSearch.tsx', import.meta.url), 'utf8')
    expect(source).toMatch(/one:\s*FIELD_STYLE/)
    expect(source).toMatch(/two:\s*FIELD_STYLE/)
  })
})

describe('visual presence vocabulary', () => {
  it('names the two presentations the D0 and H0 cases differ by', () => {
    expect(VISUAL_PRESENTS).toContain('search-padded-narrow-input')
    expect(VISUAL_PRESENTS).toContain('search-proxied-wide-region')
  })
})
