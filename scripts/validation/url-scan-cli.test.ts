import { describe, it, expect } from 'vitest'
import { CliUsageError, parseUrlScanCli } from './cli-args.ts'

/**
 * The `validate:url-scan` entry's argument parser (plan 8 B4, 10.1).
 *
 * The URL scan gets its own entry rather than a flag on the business or visual one, so a URL
 * preflight can never be reached by a mistyped flag on a paid script. This parser is the gate: no
 * arguments means the free preflight, the free preflight takes no options, and anything it does not
 * recognise - an unknown flag, a repeated one, a stray positional, a missing value - is a refusal
 * with exit code 2, decided before any browser starts or any credential is read.
 */
describe('the url-scan CLI accepts the free preflight', () => {
  it('defaults to the preflight when given no arguments', () => {
    expect(parseUrlScanCli([])).toEqual({ mode: 'preflight' })
  })

  it('accepts an explicit --preflight', () => {
    expect(parseUrlScanCli(['--preflight'])).toEqual({ mode: 'preflight' })
  })

  it('ignores the bare -- separator a package script forwards', () => {
    expect(parseUrlScanCli(['--', '--preflight'])).toEqual({ mode: 'preflight' })
  })

  it('accepts a --sample selector so a single sample can be run', () => {
    expect(parseUrlScanCli(['--preflight', '--sample', 'healthy-catalog'])).toEqual({
      mode: 'preflight',
      sample: 'healthy-catalog',
    })
  })
})

describe('the url-scan CLI refuses a malformed command line', () => {
  const refuse = (argv: string[], match: RegExp) => {
    let error: unknown
    try {
      parseUrlScanCli(argv)
    } catch (thrown) {
      error = thrown
    }
    expect(error).toBeInstanceOf(CliUsageError)
    expect((error as CliUsageError).exitCode).toBe(2)
    expect((error as Error).message).toMatch(match)
  }

  it('refuses an unknown option before anything runs', () => {
    refuse(['--preflight', '--paid'], /unknown option/)
  })

  it('refuses a repeated option', () => {
    refuse(['--preflight', '--sample', 'a', '--sample', 'b'], /repeated/)
  })

  it('refuses an option with a missing value', () => {
    refuse(['--preflight', '--sample'], /requires a value/)
  })

  it('refuses a stray positional argument', () => {
    refuse(['--preflight', 'healthy-catalog'], /positional/)
  })

  it('refuses two modes at once', () => {
    refuse(['--preflight', '--diagnostic'], /exactly one|unknown option/)
  })

  it('refuses a paid mode that this entry does not yet expose', () => {
    // The paid entries are added in B5 with their own dry-run discipline; naming one now must not
    // silently become a free run under a paid-looking name.
    refuse(['--formal'], /unknown option|exactly one/)
  })
})
