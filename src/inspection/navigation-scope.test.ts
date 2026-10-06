import { describe, expect, it } from 'vitest'
import { decideUiNavigation, normalizePageUrl } from './navigation-scope.ts'

/**
 * The bounded navigation rule of a `ui-scan` run (plan 4.1, 5.1).
 *
 * The contract has carried `maxPages`/`maxDepth` since B1 with nothing enforcing them, so a run could
 * have walked an entire same-origin site. This module is the missing half: the entry origin is fixed,
 * the page count is bounded, and depth is measured from where the user actually landed.
 */
const entry = 'https://shop.example.org/catalog?category=books&sort=price#items'
const base = { entryUrl: entry, maxPages: 3, maxDepth: 1, visited: [entry] }

describe('ui navigation scope', () => {
  it('allows a same-origin sibling path one level from the entry', () => {
    expect(decideUiNavigation({ ...base, url: 'https://shop.example.org/detail?id=1' })).toEqual({
      allow: true,
      normalized: 'https://shop.example.org/detail?id=1',
    })
  })

  it('keeps repeated query parameters and their order as identity', () => {
    // The run's own entry already carries a repeated parameter; a target that repeats one must be
    // judged as written rather than normalized into a different address (plan 4.1).
    const decision = decideUiNavigation({
      ...base,
      url: 'https://shop.example.org/detail?x=1&x=2&sort=asc',
    })
    expect(decision.allow && decision.normalized).toBe(
      'https://shop.example.org/detail?x=1&x=2&sort=asc',
    )
  })

  it('refuses a destination outside the entry origin', () => {
    expect(decideUiNavigation({ ...base, url: 'https://other.example.org/detail' })).toEqual({
      allow: false,
      reasonCode: 'outside-entry-origin',
    })
    // A declared CDN is not a page, so the same rule holds for an origin the run may load resources
    // from - this function has no CDN list to consult, and that is the point.
    expect(decideUiNavigation({ ...base, url: 'https://cdn.example.org/app' })).toMatchObject({
      allow: false,
      reasonCode: 'outside-entry-origin',
    })
  })

  it('refuses a scheme a browser navigation could not treat as a page', () => {
    for (const url of ['mailto:ops@shop.example.org', 'javascript:void(0)', 'file:///etc/hosts'])
      expect(decideUiNavigation({ ...base, url })).toMatchObject({
        allow: false,
        reasonCode: 'unsupported-scheme',
      })
  })

  it('refuses the service control surface even on the entry origin', () => {
    expect(
      decideUiNavigation({ ...base, url: 'https://shop.example.org/evaluation/report' }),
    ).toMatchObject({ allow: false, reasonCode: 'control-surface' })
    expect(
      decideUiNavigation({ ...base, url: 'https://shop.example.org/__control/reset' }),
    ).toMatchObject({ allow: false, reasonCode: 'control-surface' })
  })

  it('refuses a depth beyond the contract before dispatch', () => {
    expect(decideUiNavigation({ ...base, url: 'https://shop.example.org/about/team' })).toEqual({
      allow: false,
      reasonCode: 'depth-exceeded',
    })
    // The entry's own document and one step from it are both depth 0/1 under this run's contract.
    expect(decideUiNavigation({ ...base, url: 'https://shop.example.org/catalog' })).toMatchObject({
      allow: true,
    })
    expect(
      decideUiNavigation({ ...base, url: 'https://shop.example.org/catalog/detail' }),
    ).toMatchObject({ allow: true })
  })

  it('confines a maxDepth of 0 to the entry document', () => {
    const scope = { ...base, maxDepth: 0 }
    expect(
      decideUiNavigation({ ...scope, url: 'https://shop.example.org/catalog?page=2' }),
    ).toMatchObject({ allow: true })
    expect(decideUiNavigation({ ...scope, url: 'https://shop.example.org/detail' })).toEqual({
      allow: false,
      reasonCode: 'depth-exceeded',
    })
  })

  it('spends the page budget on new documents only, and re-allows a visited one', () => {
    const url = 'https://shop.example.org/third'
    const spent = [
      entry,
      'https://shop.example.org/detail?id=1',
      'https://shop.example.org/detail?id=2',
    ]
    expect(decideUiNavigation({ ...base, visited: spent, url })).toEqual({
      allow: false,
      reasonCode: 'page-budget-exhausted',
    })
    // Returning to a page this run already paid for is not a new page, so a bounded run can go back.
    expect(
      decideUiNavigation({ ...base, visited: spent, url: 'https://shop.example.org/detail?id=1' }),
    ).toMatchObject({ allow: true })
  })

  it('does not treat a fragment as a distinct page', () => {
    // The fragment never reaches the server and a fragment-only change does not load a document, so
    // it is not a second page against the budget - but it is preserved on the normalized address.
    expect(normalizePageUrl('https://shop.example.org/catalog#panel')).toBe(
      'https://shop.example.org/catalog',
    )
    const spent = [entry, 'https://shop.example.org/a', 'https://shop.example.org/b']
    // Same document, different fragment: the address the run would execute keeps the fragment, but
    // it is the page it already visited, so no budget is spent.
    expect(
      decideUiNavigation({
        ...base,
        visited: spent,
        url: 'https://shop.example.org/catalog?category=books&sort=price#panel',
      }),
    ).toMatchObject({ allow: true })
  })

  it('refuses a malformed address rather than guessing at it', () => {
    expect(decideUiNavigation({ ...base, url: 'not a url' })).toMatchObject({
      allow: false,
      reasonCode: 'malformed-url',
    })
  })
})
