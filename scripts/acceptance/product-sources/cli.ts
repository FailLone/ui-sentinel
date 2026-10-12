/** Default is an offline dry-run. Paid mode requires a new, hash-bound human approval. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { digest } from '../../../src/agent/exploration/integration/host.ts'
import { manifest, quoteUrl, validateQuote, authorize } from './policy.ts'
const [mode = '--dry-run', path, ...args] = process.argv.slice(2)
if (!['--dry-run', '--freeze', '--free', '--run'].includes(mode)) throw Error('unknown-mode')
const current = await manifest()
if (mode === '--dry-run') {
  console.log(
    JSON.stringify(
      { mode, realRequests: 0, manifestHash: digest(current), manifest: current },
      null,
      2,
    ),
  )
} else if (mode === '--freeze') {
  if (!path) throw Error('manifest-path-required')
  if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
    throw Error('clean-tree-required')
  writeFileSync(path, JSON.stringify(current, null, 2) + '\n', { flag: 'wx' })
  console.log(
    JSON.stringify({ path, manifestHash: digest(current), maxRequests: 120, maxCostUsd: 7.56 }),
  )
} else {
  if (!path) throw Error('output-required')
  const output = resolve(path)
  if (!output.startsWith(resolve('data/product-sources-acceptance') + '/') || existsSync(output))
    throw Error('fresh-isolated-output-required')
  mkdirSync(resolve('data/product-sources-acceptance'), { recursive: true })
  const free = mode === '--free'
  let key = 'local-only',
    quote: unknown = { mode: 'free-no-network' },
    frozen = current,
    approval: unknown
  if (!free) {
    if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
      throw Error('clean-tree-required')
    frozen = JSON.parse(readFileSync(args[0], 'utf8'))
    approval = JSON.parse(readFileSync(args[1], 'utf8'))
    authorize(frozen, approval, current)
    // Public metadata only; no credential access or inference until the frozen quote is rechecked.
    const res = await fetch(quoteUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw Error('public-price-check-failed')
    quote = {
      url: quoteUrl,
      checkedAt: new Date().toISOString(),
      endpoint: validateQuote(await res.json()),
    }
    key = process.env.R2_ACCEPTANCE_API_KEY ?? ''
    if (!key || /[\r\n]/.test(key)) throw Error('explicit-R2_ACCEPTANCE_API_KEY-required')
    const claims = resolve(
      execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(),
      'r2-product-acceptance-claims',
    )
    mkdirSync(claims, { recursive: true })
    writeFileSync(
      join(claims, digest(frozen) + '.json'),
      JSON.stringify({ output, approval, at: new Date().toISOString() }),
      { flag: 'wx', flush: true },
    )
  }
  const { run } = await import('./run.ts')
  await run(output, free, frozen, key, quote, approval)
}
