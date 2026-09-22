import { build } from 'esbuild'
import { build as viteBuild } from 'vite'
import { rm } from 'node:fs/promises'
await rm('dist', { recursive: true, force: true })
await build({
  entryPoints: ['src/server/index.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
})
await build({
  entryPoints: ['arena/checkout/src/server/index.ts'],
  outfile: 'dist/arena/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
})
await viteBuild({ configFile: 'src/web/vite.config.ts' })
await viteBuild({ configFile: 'arena/checkout/vite.config.ts', root: 'arena/checkout' })
console.log('Built server, workbench and arena. Start with pnpm start.')
