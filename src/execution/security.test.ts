import { describe, it, expect } from 'vitest'
import { isAllowedPageUrl, isAllowedNavigationUrl } from './browser.ts'

describe('browser environment boundary', () => {
  const entry = 'http://localhost:4173/'
  it('allows pages and public business endpoints in the environment', () => {
    expect(isAllowedPageUrl('http://localhost:4173/api/cart', entry)).toBe(true)
  })
  it('blocks private controls including encoded paths and foreign ports/protocols', () => {
    for (const url of [
      'http://localhost:4173/__control/state',
      'http://localhost:4173/%5f%5fcontrol/state',
      'http://localhost:4175/state',
      'http://localhost:4111/api/runs',
      'https://example.com/',
      'file:///etc/passwd',
      'javascript:alert(1)',
    ])
      expect(isAllowedPageUrl(url, entry)).toBe(false)
  })
})

/**
 * P08 for the export environment.
 *
 * The boundary is derived from the run's own entry, so a checkout entry passing proves the *checkout*
 * boundary and nothing about export. Export runs on its own origin, ports and private control, and
 * the plan requires that boundary to be checked in its own right rather than assumed to follow.
 */
it('blocks the export arena private control, its ports and foreign origins', () => {
  const entry = 'http://localhost:4183/'
  // The public business API on the export origin is reachable; that is the run's own environment.
  expect(isAllowedPageUrl('http://localhost:4183/api/exports', entry)).toBe(true)
  for (const url of [
    'http://localhost:4183/__control/state',
    'http://localhost:4183/%5f%5fcontrol/state',
    'http://localhost:4183/__control/reset',
    // The export private control port and the export API port are both outside the page's origin.
    'http://localhost:4185/state',
    'http://localhost:4185/__control/state',
    'http://localhost:4184/api/exports',
    // And so is the other business's arena, which must not become reachable from here.
    'http://localhost:4173/api/checkout',
    'https://example.com/',
    'file:///etc/passwd',
    'javascript:alert(1)',
  ])
    expect(isAllowedPageUrl(url, entry)).toBe(false)
  // The same rule under the export entry as under the checkout one: a relative private-control path
  // is refused, and the export app's own source is not a page.
  expect(isAllowedPageUrl(new URL('/__control/state', entry).href, entry)).toBe(false)
  expect(isAllowedPageUrl(new URL('/src/main.tsx', entry).href, entry)).toBe(true)
})

it('separates application document navigation from Vite script loading', () => {
  const entry = 'http://localhost:4173/'
  expect(isAllowedNavigationUrl(entry + '#checkout', entry)).toBe(true)
  for (const path of [
    '/src/server/state.ts',
    '/src/pages/Checkout.tsx',
    '/@fs/etc/passwd',
    '/node_modules/react/index.js',
    '/api/variant-config',
  ])
    expect(isAllowedNavigationUrl(new URL(path, entry).href, entry)).toBe(false)
  expect(isAllowedPageUrl(new URL('/src/server/state.ts', entry).href, entry)).toBe(false)
  expect(isAllowedPageUrl(new URL('/src/main.tsx', entry).href, entry)).toBe(true)
})
