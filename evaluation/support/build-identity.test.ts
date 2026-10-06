import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { buildIdentity } from './build-identity.ts'
it('B06 detects independently changed web, arenas, scorer and protocol bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'p3-build-'))
  const files = [
    'dist/web/app.js',
    'dist/server/index.js',
    'arena/checkout/dist/app.js',
    'arena/export/dist/app.js',
    'evaluation/private/scorer.ts',
    'scripts/validation/protocol.ts',
    'pnpm-lock.yaml',
  ]
  try {
    for (const f of files) {
      await mkdir(join(directory, f, '..'), { recursive: true })
      await writeFile(join(directory, f), 'original')
    }
    const before = await buildIdentity(directory)
    for (const f of files) {
      await writeFile(join(directory, f), 'changed')
      const after = await buildIdentity(directory)
      expect(after.hash, f).not.toBe(before.hash)
      expect(after.files[f], f).not.toBe(before.files[f])
      await writeFile(join(directory, f), 'original')
    }
    expect((await buildIdentity(directory)).hash).toBe(before.hash)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
