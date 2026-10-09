import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findForbiddenReachability, importSpecifiers, reachableModules } from './module-graph.ts'

/**
 * The boundary checker's own behaviour, on a tree built for it.
 *
 * These use a temporary module tree rather than the repo, so the properties can be stated exactly:
 * a symbol behind a re-export must be found, and a symbol that is merely a substring must not be.
 */

function scratch(files: Record<string, string>): string {
  const dir = mkdtempSync(resolve(tmpdir(), 'module-graph-'))
  for (const [name, source] of Object.entries(files)) writeFileSync(resolve(dir, name), source)
  return dir
}

describe('importSpecifiers', () => {
  it('reads named, default, namespace, bare and re-export forms', () => {
    const source = [
      "import { a } from './a.ts'",
      "import b from './b.ts'",
      "import * as c from './c.ts'",
      "import './d.ts'",
      "export { e } from './e.ts'",
      "import type { F } from './f.ts'",
      "import x from 'some-package'",
    ].join('\n')
    expect(importSpecifiers(source)).toEqual([
      './a.ts',
      './b.ts',
      './c.ts',
      './d.ts',
      './e.ts',
      './f.ts',
      'some-package',
    ])
  })

  it('does not mistake a string literal in a body for an import', () => {
    expect(importSpecifiers("const s = 'from ./not-an-import.ts'")).toEqual([])
  })
})

describe('reachableModules', () => {
  it('follows a chain of relative imports', () => {
    const dir = scratch({
      'a.ts': "import { b } from './b.ts'\nexport const a = b\n",
      'b.ts': "import { c } from './c.ts'\nexport const b = c\n",
      'c.ts': 'export const c = 1\n',
    })
    const modules = reachableModules(resolve(dir, 'a.ts'))
    expect([...modules.keys()].map((f) => f.split('/').pop()).sort()).toEqual([
      'a.ts',
      'b.ts',
      'c.ts',
    ])
  })

  it('leaves package imports alone and tolerates a missing target', () => {
    const dir = scratch({
      'a.ts': "import 'some-package'\nimport { x } from './gone.ts'\nexport const a = 1\n",
    })
    const modules = reachableModules(resolve(dir, 'a.ts'))
    expect([...modules.keys()].map((f) => f.split('/').pop())).toEqual(['a.ts'])
  })

  it('terminates on a cycle rather than looping forever', () => {
    const dir = scratch({
      'a.ts': "import { b } from './b.ts'\nexport const a = b\n",
      'b.ts': "import { a } from './a.ts'\nexport const b = a ?? 1\n",
    })
    expect(reachableModules(resolve(dir, 'a.ts')).size).toBe(2)
  })
})

describe('findForbiddenReachability', () => {
  it('finds a symbol that is only reachable through a re-export', () => {
    // This is the evasion a single-file grep misses, and the reason this module exists.
    const dir = scratch({
      'entry.ts': "import { helper } from './facade.ts'\nexport const run = helper\n",
      'facade.ts': "export { focusReceiptVerdict as helper } from './impl.ts'\n",
      'impl.ts': 'export function focusReceiptVerdict() { return true }\n',
    })
    const found = findForbiddenReachability(resolve(dir, 'entry.ts'), ['focusReceiptVerdict'])
    // One hit per file that names it: the re-export facade and the definition behind it. Reporting
    // both is the point - the facade is where a single-file grep would have stopped.
    expect(found.map((f) => f.file.split('/').pop()).sort()).toEqual(['facade.ts', 'impl.ts'])
  })

  it('finds a symbol that is re-exported but defined nowhere in the tree', () => {
    const dir = scratch({
      'entry.ts': "import { h } from './facade.ts'\nexport const run = h\n",
      'facade.ts': "export { focusReceiptVerdict as h } from './impl.ts'\n",
      'impl.ts': 'export const other = 1\n',
    })
    expect(
      findForbiddenReachability(resolve(dir, 'entry.ts'), ['focusReceiptVerdict']),
    ).toHaveLength(1)
  })

  it('does not report a symbol that is merely a substring of another name', () => {
    const dir = scratch({ 'entry.ts': 'export const notFocusReceiptVerdictAtAll = 1\n' })
    expect(findForbiddenReachability(resolve(dir, 'entry.ts'), ['focusReceiptVerdict'])).toEqual([])
  })

  it('reports every offender with its file, not just the first', () => {
    const dir = scratch({
      'entry.ts': "import './a.ts'\nimport './b.ts'\n",
      'a.ts': 'export const focusReceiptVerdict = 1\n',
      'b.ts': 'export const evaluateFocusVerdict = 2\n',
    })
    const found = findForbiddenReachability(resolve(dir, 'entry.ts'), [
      'focusReceiptVerdict',
      'evaluateFocusVerdict',
    ])
    expect(found.map((f) => f.identifier).sort()).toEqual([
      'evaluateFocusVerdict',
      'focusReceiptVerdict',
    ])
  })
})
