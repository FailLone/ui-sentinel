import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  )
}

// S3 pure modules are the roots; S4 integration is a consumer and cannot be imported back.
const plannerSources = () =>
  walk('src/agent/exploration').filter(
    (p) => p.endsWith('.ts') && !p.endsWith('.test.ts') && !p.includes('/integration/'),
  )

const importGraph = (entries: string[]) => {
  const seen = new Set<string>()
  const visit = (file: string) => {
    const absolute = resolve(file)
    if (seen.has(absolute)) return
    seen.add(absolute)
    const text = readFileSync(absolute, 'utf8')
    for (const match of text.matchAll(/(?:from\s*|import\s*\(|require\s*\()(['"])([^'"]+)\1/g))
      if (match[2].startsWith('.')) visit(resolve(dirname(absolute), match[2]))
  }
  entries.forEach(visit)
  return seen
}

describe('exploration planner boundaries', () => {
  it('ships at least the four planning modules plus the shared contract it reuses', () => {
    const names = plannerSources().map((p) => p.split('/').pop())
    for (const module of [
      'facts.ts',
      'trajectory.ts',
      'frontier.ts',
      'strategies.ts',
      'scheduler.ts',
    ])
      expect(names).toContain(module)
  })

  it('never reaches the real provider, the campaign scripts or the offline stubs', () => {
    const seen = importGraph(plannerSources())
    expect(seen.size).toBeGreaterThan(5)
    for (const file of seen) {
      const modulePath = relative(process.cwd(), file).split('\\').join('/')
      expect(modulePath).not.toMatch(/^src\/agent\/decisions\/jev-provider\//)
      expect(modulePath).not.toMatch(/^src\/agent\/exploration\/integration\//)
      expect(modulePath).not.toMatch(/^scripts\//)
      expect(modulePath).not.toMatch(/^evaluation\//)
      expect(modulePath).not.toMatch(/^arena\//)
    }
  })

  it('imports no browser, database, network or environment surface', () => {
    for (const file of plannerSources()) {
      const text = readFileSync(file, 'utf8')
      expect(text).not.toMatch(/process\.env|dotenv/)
      expect(text).not.toMatch(/\bfetch\s*\(/)
      expect(text).not.toMatch(/from\s+['"](?:node:)?(?:http|https|net|tls|dns|child_process)['"]/)
      expect(text).not.toMatch(/from\s+['"](?:node:)?(?:fs|fs\/promises)['"]/)
      expect(text).not.toMatch(/playwright|midscene|@libsql|@mastra/)
    }
  })

  it('does not import the executor, inspection host, ledger or report layer it must not bind to', () => {
    // S3 is a domain module. Wiring it to the real executor is S4's job, behind a frozen contract.
    const seen = importGraph(plannerSources())
    for (const file of seen) {
      const modulePath = relative(process.cwd(), file).split('\\').join('/')
      expect(modulePath).not.toMatch(/^src\/execution\//)
      expect(modulePath).not.toMatch(/^src\/inspection\//)
      expect(modulePath).not.toMatch(/^src\/storage\//)
      expect(modulePath).not.toMatch(/^src\/server\//)
      expect(modulePath).not.toMatch(/^src\/business\//)
    }
  })

  it('reuses the committed exploration contract instead of restating candidate and budget shapes', () => {
    // A second copy of the candidate/budget schema is how planner and executor drift apart.
    const facts = readFileSync('src/agent/exploration/facts.ts', 'utf8')
    expect(facts).toMatch(/parseExplorationInput/)
    expect(facts).not.toMatch(/schemaVersion: z\.literal\('r1-exploration-input/)
    for (const file of plannerSources()) {
      // Only the reused contract file may declare a schema version literal.
      if (file.endsWith('facts.ts')) continue
      expect(readFileSync(file, 'utf8')).not.toMatch(/z\.literal\('r1-exploration-input/)
    }
  })
})
