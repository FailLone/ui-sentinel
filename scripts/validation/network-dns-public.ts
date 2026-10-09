/** Free, read-only fixed-page observation. No executor/model/rule imports. */
import { launchBrowser } from '../../src/execution/browser.ts'
import { installUiNetworkSession } from '../../src/execution/network/session.ts'
import { createNetworkPolicy } from '../../src/inspection/network-policy.ts'
import { config } from '../../src/shared/config.ts'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const samples = [
  {
    id: 'commons',
    url: 'https://commons.wikimedia.org/wiki/File:PNG_transparency_demonstration_1.png',
    resources: ['https://upload.wikimedia.org', 'https://meta.wikimedia.org'],
  },
  {
    id: 'mdn',
    url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images',
    resources: ['https://mdn.github.io', 'https://interactive-examples.mdn.mozilla.net'],
  },
  {
    id: 'github',
    url: 'https://github.com/python/cpython',
    resources: [
      'https://github.githubassets.com',
      'https://avatars.githubusercontent.com',
      'https://user-images.githubusercontent.com',
      'https://raw.githubusercontent.com',
      'https://camo.githubusercontent.com',
    ],
  },
]
const root = `data/network-dns-compat/public-${config.urlScan.dns.mode}`
await mkdir(root, { recursive: true })
const build = {
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  trackedDiffSha256: createHash('sha256')
    .update(execFileSync('git', ['diff', 'HEAD']))
    .digest('hex'),
  observerSha256: createHash('sha256')
    .update(await readFile(new URL(import.meta.url)))
    .digest('hex'),
  serverSha256: createHash('sha256')
    .update(await readFile('dist/server/index.js'))
    .digest('hex'),
  node: process.version,
  dnsMode: config.urlScan.dns.mode,
}
const results = []
for (const sample of samples) {
  const started = performance.now()
  const worker = await launchBrowser({ uiScan: true, headless: true })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 35000)
  const session = await installUiNetworkSession({
    context: worker.context,
    page: worker.page,
    signal: controller.signal,
    policy: createNetworkPolicy({
      entryUrl: sample.url,
      reachableOrigins: [],
      resourceOrigins: sample.resources,
      dataOrigins: [],
    }),
  })
  let observation: unknown = null,
    failure: string | null = null
  try {
    const response = await worker.page.goto(sample.url, {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    })
    await worker.page.waitForTimeout(1500)
    if (!response?.ok()) throw Error(`document-http-${response?.status() ?? 'missing'}`)
    observation = await worker.page.evaluate(() => ({
      url: location.href,
      title: document.title,
      text: document.body.innerText.slice(0, 2000),
      elements: document.querySelectorAll('*').length,
      images: document.images.length,
    }))
    await worker.page.screenshot({ path: `${root}/${sample.id}.png` })
  } catch {
    observation = null
    // Decisions carry precise, redacted network diagnostics; do not export raw exception configs.
    failure =
      session.decisions.find((d) => !d.allow && d.destination === 'document')?.networkStage ??
      'navigation-or-observation'
  } finally {
    clearTimeout(timer)
    session.seal()
    await session.settle()
    await worker.close()
  }
  results.push({
    ...sample,
    startedAt: new Date(Date.now() - (performance.now() - started)).toISOString(),
    elapsedMs: Math.round(performance.now() - started),
    observationComplete: observation !== null,
    observation,
    failure,
    decisions: session.decisions,
    modelCalls: 0,
    semanticChecks: 0,
    acceptanceClaim: false,
  })
}
await writeFile(`${root}/results.json`, JSON.stringify({ build, results }, null, 2))
console.log(
  JSON.stringify(
    {
      build,
      results: results.map(({ id, elapsedMs, observationComplete, failure, decisions }) => ({
        id,
        elapsedMs,
        observationComplete,
        failure,
        decisions,
      })),
    },
    null,
    2,
  ),
)
