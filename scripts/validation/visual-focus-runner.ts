import 'dotenv/config'
import { parseVisualCli } from './cli-args.ts'
import { runVisualStage } from './visual-stage.ts'
try {
  const args = process.argv.slice(2).filter((a) => a !== '--')
  const modeIndex = args.indexOf('--mode')
  if (modeIndex < 0) throw Error('runner requires --mode')
  const mode = args[modeIndex + 1]
  args.splice(modeIndex, 2, '--' + mode)
  const options = parseVisualCli(args)
  if (options.mode !== 'diagnostic' && options.mode !== 'formal') throw Error('paid stage required')
  process.exitCode = await runVisualStage({
    mode: options.mode,
    campaignDir: options.campaign!,
    diagnosticSource: options.diagnosticSource,
  })
} catch (error) {
  console.error(String(error))
  process.exitCode = 2
}
