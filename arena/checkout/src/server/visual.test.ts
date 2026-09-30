import { beforeEach, describe, expect, it } from 'vitest'
import { getVisualPresent, resetState, setVisualPresent, VISUAL_PRESENTS } from './state.ts'
import { createCheckoutApp } from './app.ts'

beforeEach(() => resetState('C0'))

describe('private visual presentations', () => {
  it('starts absent and is cleared by an ordinary reset', () => {
    expect(getVisualPresent()).toBeNull()
    setVisualPresent('search-proxied-wide-region')
    resetState('C0')
    expect(getVisualPresent()).toBeNull()
  })

  it.each(VISUAL_PRESENTS)('only returns the current markup for %s', async (present) => {
    setVisualPresent(present)
    const { app } = createCheckoutApp({ controlToken: 'test-only' })
    const config = await (await app.request('/api/variant-config')).json()
    expect(Object.keys(config.search)).toEqual(['html'])
    expect(config.search.html).toContain('<input')
    expect(config.search.html).not.toMatch(
      /<script|data-(proxy|present|case)|groundTruth|expectSupported|v[1-6]/,
    )
    for (const other of VISUAL_PRESENTS) expect(config.search.html).not.toContain(other)
  })
})
