import { lstatSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'
export function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
}
export function safeFile(root: string, path: string) {
  if (
    isAbsolute(path) ||
    path.split(/[\\/]/).some((p) => p === '..' || p === '') ||
    path.includes('\\')
  )
    throw new Error('unsafe-path')
  const full = resolve(root, path)
  const rel = relative(resolve(root), full)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('unsafe-path')
  let part = resolve(root)
  for (const piece of path.split('/')) {
    part = join(part, piece)
    if (lstatSync(part).isSymbolicLink()) throw new Error('symlink-evidence')
  }
  if (!lstatSync(full).isFile()) throw new Error('not-file')
  return full
}
function files(root: string, dir = root): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name)
      const st = lstatSync(path)
      if (st.isSymbolicLink()) throw new Error('symlink-evidence')
      return st.isDirectory() ? files(root, path) : [relative(root, path).split('\\').join('/')]
    })
}
export function sealEvidence(root: string) {
  const index = files(root)
    .filter((p) => p !== 'manifest.json')
    .map((path) => ({ path, sha256: sha256(readFileSync(join(root, path))) }))
  writeJson(join(root, 'manifest.json'), { version: 'r1-jev-evidence-1', files: index })
}
export function verifyEvidence(root: string) {
  const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
  if (manifest.version !== 'r1-jev-evidence-1' || !Array.isArray(manifest.files))
    throw new Error('manifest-invalid')
  const expected: string[] = []
  for (const item of manifest.files) {
    if (
      typeof item.path !== 'string' ||
      expected.includes(item.path) ||
      item.path === 'manifest.json'
    )
      throw new Error('manifest-entry')
    expected.push(item.path)
    if (sha256(readFileSync(safeFile(root, item.path))) !== item.sha256)
      throw new Error('evidence-hash')
  }
  const actual = files(root)
    .filter((p) => p !== 'manifest.json')
    .sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected.sort()))
    throw new Error('evidence-index-incomplete')
  return { status: 'evidence-integrity-passed', files: actual.length }
}
