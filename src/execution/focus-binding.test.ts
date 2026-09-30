import { describe, expect, it } from 'vitest'
import { bindInputToRegion, type BindableElement } from './focus-binding.ts'

const region = { x: 100, y: 200, width: 400, height: 40 }

function input(over: Partial<BindableElement> = {}): BindableElement {
  return {
    ref: 'e1',
    tag: 'input',
    type: 'text',
    bounds: { x: 240, y: 200, width: 120, height: 40 },
    visible: true,
    enabled: true,
    ...over,
  }
}

const base = {
  region,
  excluded: [],
  elements: [input()],
  dangerous: [],
}

describe('binding a perceived region to a unique native input', () => {
  it('binds the one native input that sits inside the perceived region', () => {
    const result = bindInputToRegion(base)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.elementRef).toBe('e1')
      expect(result.nodeIdentity).toContain('e1')
      expect(result.reason).toMatch(/inside/)
    }
  })

  it('refuses when two native inputs are candidates', () => {
    const result = bindInputToRegion({
      ...base,
      elements: [input(), input({ ref: 'e2', bounds: { x: 380, y: 200, width: 100, height: 40 } })],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('ambiguous-targets')
  })

  it('refuses when no native input overlaps the region at all', () => {
    const result = bindInputToRegion({ ...base, elements: [] })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-target')
  })

  it('ignores an input that only partly overlaps the region edge', () => {
    // An input mostly outside the perceived region is not the thing the model pointed at.
    const result = bindInputToRegion({
      ...base,
      elements: [input({ bounds: { x: 460, y: 200, width: 120, height: 40 } })],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-target')
  })

  it('binds a region the model drew just inside the input borders', () => {
    // What the real model actually does. Vision models trace the visible edge, and at H1 the visible
    // edge is a 1px border, so the reported box came back five pixels inside the control: the region
    // covered only 79% of the input and the binding was refused. But a 250x30 box lying 93% within a
    // 260x34 input unambiguously refers to that input - refusing it rejects the model for being
    // slightly conservative about a border, which is the model being right.
    const result = bindInputToRegion({
      ...base,
      region: { x: 245, y: 204, width: 250, height: 30 },
      elements: [input({ bounds: { x: 240, y: 200, width: 260, height: 34 } })],
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.elementRef).toBe('e1')
  })

  it('still refuses a region that merely clips the input it overlaps', () => {
    // The containment path must not become a loophole: a large region that grazes an input is not a
    // region about that input, however much of the ORIGINAL region it happens to share.
    const result = bindInputToRegion({
      ...base,
      region: { x: 100, y: 200, width: 40, height: 40 },
      elements: [input({ bounds: { x: 128, y: 200, width: 120, height: 40 } })],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('no-target')
  })

  it('refuses a disabled or read-only input instead of treating it as the target', () => {
    expect(bindInputToRegion({ ...base, elements: [input({ enabled: false })] })).toMatchObject({
      ok: false,
      reason: 'target-not-editable',
    })
    expect(bindInputToRegion({ ...base, elements: [input({ readOnly: true })] })).toMatchObject({
      ok: false,
      reason: 'target-not-editable',
    })
  })

  it('refuses an invisible input', () => {
    expect(bindInputToRegion({ ...base, elements: [input({ visible: false })] })).toMatchObject({
      ok: false,
      reason: 'target-not-visible',
    })
  })

  it('refuses an input type that is not a supported native text or search input', () => {
    expect(bindInputToRegion({ ...base, elements: [input({ type: 'checkbox' })] })).toMatchObject({
      ok: false,
      reason: 'unsupported-target-type',
    })
    expect(bindInputToRegion({ ...base, elements: [input({ type: 'file' })] })).toMatchObject({
      ok: false,
      reason: 'unsupported-target-type',
    })
  })

  it('refuses when the region holds a dangerous control that is not excluded', () => {
    const result = bindInputToRegion({
      ...base,
      dangerous: [{ ref: 'e5', tag: 'button', bounds: { x: 110, y: 205, width: 40, height: 30 } }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('dangerous-control-in-region')
  })

  it('binds when the only dangerous control is inside an explicitly excluded area', () => {
    const button = { x: 110, y: 205, width: 40, height: 30 }
    const result = bindInputToRegion({
      ...base,
      excluded: [button],
      dangerous: [{ ref: 'e5', tag: 'button', bounds: button }],
    })

    expect(result.ok).toBe(true)
  })

  it('refuses a region that is a large container of several unrelated controls', () => {
    const result = bindInputToRegion({
      ...base,
      elements: [input()],
      dangerous: [
        { ref: 'b1', tag: 'button', bounds: { x: 110, y: 205, width: 30, height: 20 } },
        { ref: 'b2', tag: 'button', bounds: { x: 150, y: 205, width: 30, height: 20 } },
        { ref: 'a1', tag: 'a', bounds: { x: 190, y: 205, width: 30, height: 20 } },
      ],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('mixed-region')
  })

  it('reports the target identity from the element, not from the model description', () => {
    const result = bindInputToRegion({ ...base, elements: [input({ ref: 'e7', id: 'q' })] })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.nodeIdentity).not.toMatch(/search area/)
  })
})
