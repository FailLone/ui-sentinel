import { it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
  )
}
it('offline import graph cannot reach the real provider or CLI, recursively', () => {
  const files = [...walk('src/agent/decisions/exploration'), ...walk('scripts/r1-jev')].filter(
    (p) => p.endsWith('.ts') && !p.endsWith('.test.ts'),
  )
  const seen = new Set<string>()
  function visit(file: string) {
    file = resolve(file)
    if (seen.has(file)) return
    seen.add(file)
    expect(file).not.toContain('/jev-provider/')
    expect(file).not.toContain('/r1-jev-real/')
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:from\s*|import\s*\(|require\s*\()(['"])([^'"]+)\1/g)) {
      if (match[2].startsWith('.')) visit(resolve(dirname(file), match[2]))
    }
  }
  files.forEach(visit)
  expect(seen.size).toBeGreaterThan(10)
})
it('only the explicit CLI reads credentials; provider runtime has no fixture dependency', () => {
  for (const file of walk('src/agent/decisions/jev-provider').filter(
    (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
  )) {
    const text = readFileSync(file, 'utf8')
    expect(text).not.toMatch(/process\.env|dotenv|from\s+['"][^'"]*(?:scripts|evaluation)\//)
    if (!file.endsWith('/http.ts')) expect(text).not.toMatch(/\bfetch\s*\(/)
  }
})
it('verification preload actually rejects external fetch and TCP before connection', async () => {
  const { spawnSync } = await import('node:child_process')
  const script = `const net=require('node:net');let denied=0;try{fetch('https://example.invalid')}catch(e){if(e.message==='external-network-forbidden')denied++}try{net.connect({host:'example.invalid',port:443})}catch(e){if(e.message==='external-network-forbidden')denied++}if(denied!==2)process.exit(1)`
  const result = spawnSync(
    process.execPath,
    ['--require', resolve('scripts/r1-jev-real/loopback-trap.cjs'), '-e', script],
    { encoding: 'utf8' },
  )
  expect(result.status, result.stderr).toBe(0)
})
