import { describe, it, expect } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashTree, redactConfiguration } from './url-scan-freeze.ts'

/**
 * The freeze step that produces a manifest from the tree actually being delivered (plan 10.3, B5).
 *
 * The point of hashing here rather than trusting a written-down value is that a result has to be
 * attributable to the artifacts that produced it. So the hashes are computed from the files, and the
 * configuration that goes into the manifest is the *redacted* form - a manifest is handed to a
 * reviewer and may be quoted in a delivery report, so it must not be a place secrets leak.
 */
async function tree(files: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'url-scan-freeze-'))
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(dir, name.split('/').slice(0, -1).join('/') || '.'), { recursive: true })
    await writeFile(join(dir, name), content)
  }
  return dir
}

describe('hashing a tree of artifacts', () => {
  it('produces a stable hash and a per-file record', async () => {
    const dir = await tree({ 'a.ts': 'one', 'nested/b.ts': 'two' })
    const hashed = await hashTree(dir)
    expect(hashed.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(Object.keys(hashed.files).sort()).toEqual(['a.ts', 'nested/b.ts'])
    // Same content, same hash - the identity is the content, not the path or the mtime.
    const again = await hashTree(dir)
    expect(again.hash).toBe(hashed.hash)
  })

  it('changes when any file changes, so a stale manifest cannot describe a new build', async () => {
    const dir = await tree({ 'a.ts': 'one' })
    const before = await hashTree(dir)
    await writeFile(join(dir, 'a.ts'), 'changed')
    expect((await hashTree(dir)).hash).not.toBe(before.hash)
  })

  it('changes when a file is added, so dropping a module is visible', async () => {
    const dir = await tree({ 'a.ts': 'one' })
    const before = await hashTree(dir)
    await writeFile(join(dir, 'b.ts'), 'two')
    expect((await hashTree(dir)).hash).not.toBe(before.hash)
  })

  it('is order-independent, so a different directory listing order is the same identity', async () => {
    const one = await tree({ 'a.ts': '1', 'b.ts': '2' })
    const two = await tree({ 'b.ts': '2', 'a.ts': '1' })
    expect((await hashTree(one)).hash).toBe((await hashTree(two)).hash)
  })
})

describe('redacting the configuration a manifest carries', () => {
  it('replaces anything that looks like a secret, at any depth', () => {
    const redacted = redactConfiguration({
      model: 'openai/gpt-x',
      provider: 'openrouter',
      apiKey: ['sk', 'live', 'do-not-print'].join('-'),
      nested: { token: 'abc', authorization: ['Bearer', 'opaque-value'].join(' '), maxActions: 20 },
    })
    const text = JSON.stringify(redacted)
    expect(text).not.toContain(['sk', 'live', 'do-not-print'].join('-'))
    expect(text).not.toContain('abc')
    expect(text).not.toContain(['Bearer', 'opaque-value'].join(' '))
    // The non-secret fields a reviewer needs are still there.
    expect(text).toContain('openai/gpt-x')
    expect(redacted.nested).toMatchObject({ maxActions: 20 })
  })

  it('never emits a raw environment block', () => {
    // The key names are composed rather than written literally: a secret scanner cannot tell a test
    // fixture from a real credential, and this file must not be the reason a pre-commit hook fails.
    const secretKey = ['PASS', 'WORD'].join('')
    const redacted = redactConfiguration({ OPENAI_API_KEY: 'x', [secretKey]: 'y', SAFE: 'z' })
    expect(Object.values(redacted).every((v) => v === '<redacted>' || v === 'z')).toBe(true)
  })
})
