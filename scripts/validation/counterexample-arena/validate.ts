/** Bundle browser callbacks once: direct tsx transforms can inject Node-only closure helpers. */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
const root = resolve('data/counterexample-arena', new Date().toISOString().replace(/[:.]/g, '-'))
await mkdir(root, { recursive: true })
const outfile = resolve(root, 'verify.mjs')
const built = await build({
  metafile: true,
  entryPoints: ['scripts/validation/counterexample-arena/verify.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
})
const inputs = await Promise.all(
  Object.keys(built.metafile.inputs).map(async (path) => ({
    path,
    sha256: createHash('sha256')
      .update(await readFile(path))
      .digest('hex'),
  })),
)
await writeFile(
  resolve(root, 'source-manifest.json'),
  JSON.stringify(
    {
      inputs,
      bundleSha256: createHash('sha256')
        .update(await readFile(outfile))
        .digest('hex'),
    },
    null,
    2,
  ) + '\n',
)
const child = spawn(process.execPath, [outfile, root], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { PATH: process.env.PATH, HOME: process.env.HOME, DOTENV_CONFIG_PATH: '/dev/null' },
})
process.exitCode = await new Promise<number>((resolve, reject) => {
  child.once('error', reject)
  child.once('exit', (code) => resolve(code ?? 1))
})
