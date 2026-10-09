import { createHash } from 'node:crypto'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { writeJson } from './campaign-session.ts'
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

/** Seal actual on-disk bytes after shutdown. The manifest itself is covered, not trusted. */
export async function sealStage(directory: string) {
  const files: Record<string, string> = {}
  const visit = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = resolve(dir, entry.name)
      if (entry.isSymbolicLink()) throw Error('stage-symlink')
      if (entry.isDirectory()) await visit(path)
      else if (
        entry.isFile() &&
        entry.name !== 'evidence-seal.json' &&
        !entry.name.endsWith('.tmp')
      )
        files[relative(directory, path)] = hash(await readFile(path))
    }
  }
  await visit(resolve(directory))
  await writeJson(resolve(directory, 'evidence-seal.json'), { version: 1, files })
}
export async function verifyStageSeal(directory: string, required: readonly string[]) {
  try {
    const root = await realpath(directory)
    const seal = JSON.parse(await readFile(resolve(root, 'evidence-seal.json'), 'utf8'))
    if (seal.version !== 1 || !seal.files || required.some((name) => !seal.files[name]))
      return false
    for (const [name, sha] of Object.entries(seal.files)) {
      if (isAbsolute(name) || name.split(/[\\/]/).includes('..')) return false
      const file = await realpath(resolve(root, name))
      if (relative(root, file).startsWith('..')) return false
      if (hash(await readFile(file)) !== sha) return false
    }
    return true
  } catch {
    return false
  }
}
