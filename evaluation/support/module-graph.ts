import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * Resolving what a module really depends on, re-exports included.
 *
 * The scorer's independence rule is "must not call the product's verdict, directly or indirectly".
 * A check that greps the scorer's own source answers only the direct half: a helper that re-exports a
 * forbidden function under another name would be imported by name and never match the grep. That is
 * not a hypothetical - `witness.ts` is itself a re-export module, so the shape already exists in this
 * tree. This walks the real import graph instead, so a dependency is found however it was renamed on
 * the way in.
 */

/** `import ... from '<spec>'`, `export ... from '<spec>'` and bare `import '<spec>'`. */
const SPECIFIER =
  /(?:^|\n)\s*(?:import|export)\b[^'"\n]*from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g

/** The module specifiers one source file names, in order, without resolving them. */
export function importSpecifiers(source: string): string[] {
  const found: string[] = []
  for (const match of source.matchAll(SPECIFIER))
    if (match[1] ?? match[2]) found.push((match[1] ?? match[2])!)
  return found
}

/**
 * Every file reachable from `entry` through relative imports, including the entry itself.
 *
 * Only relative specifiers are followed; a bare package name is not part of this repo's boundary and
 * is left to the reader. Unreadable or unresolvable targets are skipped rather than thrown, so a
 * stray type-only path cannot make the check unusable.
 */
export function reachableModules(entry: string): Map<string, string> {
  const seen = new Map<string, string>()
  const queue = [resolve(entry)]
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file)) continue
    let source: string
    try {
      source = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    seen.set(file, source)
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue
      // The repo writes `.ts` extensions explicitly; a specifier without one would resolve to a
      // directory import, which Node's ESM loader refuses anyway.
      queue.push(resolve(dirname(file), specifier))
    }
  }
  return seen
}

/**
 * Which reachable module defines or re-exports each forbidden identifier, if any.
 *
 * Returns the offender per identifier so a failure names the file and not just the symbol, and finds
 * it whether the identifier is defined there or merely passed through.
 */
export function findForbiddenReachability(
  entry: string,
  forbidden: readonly string[],
): { identifier: string; file: string }[] {
  const found: { identifier: string; file: string }[] = []
  for (const [file, source] of reachableModules(entry))
    for (const identifier of forbidden) {
      const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`\\b${escaped}\\b`).test(source)) found.push({ identifier, file })
    }
  return found
}
