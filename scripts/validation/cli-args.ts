import { isVisualCaseId, type VisualCaseId } from '../../evaluation/fixtures/visual.ts'

/**
 * Strict argument parsing for the validation CLIs (plan P3.2, acceptance R01).
 *
 * The earlier dispatchers used `includes()`/`some()`, which let an unknown flag sit beside a known one
 * and be silently ignored. A paid entry point must not tolerate that: an unrecognised or repeated
 * argument, a missing value, a conflicting mode or a malformed list is a refusal with a clear message,
 * decided before any credential is read or any request is sent.
 *
 * No arguments is never a paid mode - the default is the free preflight, and a paid mode must be asked
 * for explicitly.
 */
/**
 * An invalid command line or configuration. It carries exit code 2 so the process can distinguish it
 * from a quality/gate failure (1): "you asked for the wrong thing" is not "the product failed".
 */
export class CliUsageError extends Error {
  readonly exitCode = 2
  constructor(message: string) {
    super(message)
    this.name = 'CliUsageError'
  }
}

export type VisualMode = 'preflight' | 'p2-smoke' | 'diagnostic' | 'formal'

export interface VisualCliOptions {
  readonly mode: VisualMode
  readonly campaign?: string
  readonly diagnosticSource?: string
  readonly cases?: readonly VisualCaseId[]
  readonly spendingSource?: string
}

const VALUE_FLAGS = ['--campaign', '--diagnostic-source', '--cases', '--spending-source'] as const

/** Parse argv for the visual-focus entry. Throws a `cli:`-prefixed error on any invalid shape. */
export function parseVisualCli(argv: readonly string[]): VisualCliOptions {
  const args = argv.filter((a) => a !== '--')
  if (args.length === 0) return { mode: 'preflight' }

  const modes = args.filter(
    (a) =>
      a.startsWith('--') && ['--preflight', '--p2-smoke', '--diagnostic', '--formal'].includes(a),
  )
  if (modes.length !== 1)
    throw new CliUsageError(
      `cli: expected exactly one of --preflight, --p2-smoke, --diagnostic, --formal (got ${modes.length})`,
    )
  const mode = modes[0]!.slice(2) as VisualMode

  const options: {
    campaign?: string
    diagnosticSource?: string
    cases?: readonly VisualCaseId[]
    spendingSource?: string
  } = {}
  const seen = new Set<string>()
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === modes[0]) continue
    if (!arg.startsWith('--'))
      throw new CliUsageError(`cli: unexpected positional argument "${arg}"`)
    if (!(VALUE_FLAGS as readonly string[]).includes(arg))
      throw new CliUsageError(`cli: unknown option "${arg}"`)
    if (seen.has(arg)) throw new CliUsageError(`cli: repeated option "${arg}"`)
    seen.add(arg)
    const value = args[i + 1]
    if (value === undefined || value.startsWith('--'))
      throw new CliUsageError(`cli: option "${arg}" requires a value`)
    i++
    if (arg === '--campaign') options.campaign = value
    else if (arg === '--diagnostic-source') options.diagnosticSource = value
    else if (arg === '--spending-source') options.spendingSource = value
    else {
      const ids = value.split(',')
      if (!ids.length || !ids.every(isVisualCaseId) || new Set(ids).size !== ids.length)
        throw new CliUsageError(`cli: invalid --cases list "${value}"`)
      options.cases = ids as VisualCaseId[]
    }
  }

  if (mode === 'preflight' && (options.campaign || options.diagnosticSource || options.cases))
    throw new CliUsageError('cli: --preflight takes no options')
  if (mode === 'diagnostic' && !options.campaign)
    throw new CliUsageError('cli: --diagnostic requires --campaign')
  if (mode === 'formal' && (!options.campaign || !options.diagnosticSource))
    throw new CliUsageError('cli: --formal requires --campaign and --diagnostic-source')
  if (mode === 'p2-smoke' && (options.campaign || options.diagnosticSource))
    throw new CliUsageError('cli: --p2-smoke takes only --cases')

  if (mode !== 'p2-smoke' && (options.cases || options.spendingSource))
    throw new CliUsageError('cli: cases/spending-source require p2-smoke')
  if (mode === 'diagnostic' && options.diagnosticSource)
    throw new CliUsageError('cli: diagnostic cannot inherit a diagnostic-source')
  return { mode, ...options }
}

/** Parse argv for the business entry, mirroring the visual parser's strictness. */
export type BusinessMode = 'preflight' | 'diagnostic' | 'formal'
export interface BusinessCliOptions {
  readonly mode: BusinessMode
  readonly campaign?: string
  readonly diagnosticSource?: string
  readonly approvedSource?: string
  readonly groups?: readonly string[]
}

export function parseBusinessCli(argv: readonly string[]): BusinessCliOptions {
  const args = argv.filter((a) => a !== '--')
  if (args.length === 0) return { mode: 'preflight' }
  const modes = args.filter((a) => ['--preflight', '--diagnostic', '--formal'].includes(a))
  if (modes.length !== 1)
    throw new CliUsageError(
      `cli: expected exactly one of --preflight, --diagnostic, --formal (got ${modes.length})`,
    )
  const mode = modes[0]!.slice(2) as BusinessMode
  const options: {
    campaign?: string
    diagnosticSource?: string
    approvedSource?: string
    groups?: readonly string[]
  } = {}
  const seen = new Set<string>()
  const valueFlags = ['--campaign', '--diagnostic-source', '--approved-source', '--groups']
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === modes[0]) continue
    if (!arg.startsWith('--'))
      throw new CliUsageError(`cli: unexpected positional argument "${arg}"`)
    if (!valueFlags.includes(arg)) throw new CliUsageError(`cli: unknown option "${arg}"`)
    if (seen.has(arg)) throw new CliUsageError(`cli: repeated option "${arg}"`)
    seen.add(arg)
    const value = args[i + 1]
    if (value === undefined || value.startsWith('--'))
      throw new CliUsageError(`cli: option "${arg}" requires a value`)
    i++
    if (arg === '--campaign') options.campaign = value
    else if (arg === '--diagnostic-source') options.diagnosticSource = value
    else if (arg === '--approved-source') options.approvedSource = value
    else options.groups = value.split(',')
  }
  if (mode === 'preflight' && seen.size) throw new CliUsageError('cli: preflight takes no options')
  if (
    mode === 'diagnostic' &&
    (options.diagnosticSource || options.approvedSource || options.groups)
  )
    throw new CliUsageError('cli: diagnostic takes only campaign')
  if (
    options.groups &&
    (!options.groups.length ||
      new Set(options.groups).size !== options.groups.length ||
      options.groups.some((g) => !['A', 'B', 'C', 'D'].includes(g)))
  )
    throw new CliUsageError('cli: invalid groups')
  if (mode === 'formal' && !options.diagnosticSource)
    throw new CliUsageError('cli: formal requires diagnostic-source')
  return { mode, ...options }
}
