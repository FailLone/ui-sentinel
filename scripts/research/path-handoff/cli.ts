/** Offline by default. Only --run may read an explicit R3 key after new approval and quote checks. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { digest } from '../../../src/agent/exploration/integration/host.ts'
import { manifest, policy, quoteUrl, validateQuote, authorize } from './policy.ts'
const [mode = '--dry-run', path, ...args] = process.argv.slice(2)
if (!['--dry-run', '--freeze', '--free', '--run'].includes(mode)) throw Error('unknown-mode')
const current = await manifest()
const clean = () => {
  if (execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim())
    throw Error('clean-tree-required')
}
if (mode === '--dry-run')
  console.log(
    JSON.stringify(
      { mode, realRequests: 0, manifestHash: digest(current), manifest: current },
      null,
      2,
    ),
  )
else if (mode === '--freeze') {
  if (!path) throw Error('manifest-path-required')
  clean()
  writeFileSync(path, JSON.stringify(current, null, 2) + '\n', { flag: 'wx' })
  console.log(JSON.stringify({ manifestHash: digest(current), path, policy }))
} else {
  if (!path) throw Error('fresh-output-required')
  const output = resolve(path),
    base = resolve('data/r3-handoff-recheck')
  if (!output.startsWith(base + '/') || existsSync(output))
    throw Error('fresh-isolated-output-required')
  mkdirSync(base, { recursive: true })
  const free = mode !== '--run'
  let frozen = current,
    approval: unknown,
    key = 'local-only',
    quote: unknown = { mode: 'free-no-network' }
  if (!free) {
    clean()
    if (args.length !== 2) throw Error('manifest-and-new-D-approval-required')
    frozen = JSON.parse(readFileSync(args[0]!, 'utf8'))
    approval = JSON.parse(readFileSync(args[1]!, 'utf8'))
    authorize(frozen, approval, current)
    // Metadata only. Preserve the response even on a pricing rejection, before credential access.
    const response = await fetch(quoteUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    })
    const raw = await response.text()
    const checkedAt = new Date().toISOString()
    writeFileSync(
      output + '-quote.json',
      JSON.stringify({ url: quoteUrl, checkedAt, status: response.status, raw }, null, 2) + '\n',
      { flag: 'wx' },
    )
    if (!response.ok) throw Error('public-price-check-failed')
    quote = { url: quoteUrl, checkedAt, endpoint: validateQuote(JSON.parse(raw)) }
    key = process.env.R3_ACCEPTANCE_API_KEY ?? ''
    if (!key || /[\r\n]/.test(key)) throw Error('explicit-R3_ACCEPTANCE_API_KEY-required')
    const claims = resolve(
      execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim(),
      'r3-handoff-recheck-claims',
    )
    mkdirSync(claims, { recursive: true })
    writeFileSync(
      join(claims, digest(frozen) + '.json'),
      JSON.stringify({ output, approval, at: checkedAt }) + '\n',
      { flag: 'wx', flush: true },
    )
  }
  const { run } = await import('./run.ts')
  await run(output, free, frozen, key, quote, approval)
}
