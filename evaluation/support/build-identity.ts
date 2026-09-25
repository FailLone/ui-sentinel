import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Covers the workbench, both public arenas, server and the scoring/runner protocol. */
export async function buildIdentity() {
  const files: Record<string, string> = {}
  const visit = async (path: string): Promise<void> => {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') await visit(file)
      } else if (entry.isFile() && !file.endsWith('.map') && !file.endsWith('.test.ts'))
        files[file] = createHash('sha256')
          .update(await readFile(file))
          .digest('hex')
    }
  }
  for (const root of ['dist', 'arena/checkout/dist', 'arena/export/dist', 'evaluation', 'scripts'])
    await visit(root)
  files['pnpm-lock.yaml'] = createHash('sha256')
    .update(await readFile('pnpm-lock.yaml'))
    .digest('hex')
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  return { hash: createHash('sha256').update(JSON.stringify(sorted)).digest('hex'), files: sorted }
}
