import { describe,it,expect } from 'vitest'
import { isAllowedPageUrl, isAllowedNavigationUrl } from './browser.ts'

describe('browser environment boundary',()=>{
  const entry='http://localhost:4173/'
  it('allows pages and public business endpoints in the environment',()=>{
    expect(isAllowedPageUrl('http://localhost:4173/api/cart',entry)).toBe(true)
  })
  it('blocks private controls including encoded paths and foreign ports/protocols',()=>{
    for(const url of ['http://localhost:4173/__control/state','http://localhost:4173/%5f%5fcontrol/state','http://localhost:4175/state','http://localhost:4111/api/runs','https://example.com/','file:///etc/passwd','javascript:alert(1)'])expect(isAllowedPageUrl(url,entry)).toBe(false)
  })
})

it('separates application document navigation from Vite script loading',()=>{
  const entry='http://localhost:4173/'
  expect(isAllowedNavigationUrl(entry+'#checkout',entry)).toBe(true)
  for(const path of ['/src/server/state.ts','/src/pages/Checkout.tsx','/@fs/etc/passwd','/node_modules/react/index.js','/api/variant-config'])expect(isAllowedNavigationUrl(new URL(path,entry).href,entry)).toBe(false)
  expect(isAllowedPageUrl(new URL('/src/server/state.ts',entry).href,entry)).toBe(false)
  expect(isAllowedPageUrl(new URL('/src/main.tsx',entry).href,entry)).toBe(true)
})
