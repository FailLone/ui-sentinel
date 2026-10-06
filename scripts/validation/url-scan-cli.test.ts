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

describe('the url-scan CLI refuses a malformed command line', () => {
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

  it('refuses a paid mode without the manifest its batch must be frozen against', () => {
    // The paid entries exist now, but they cannot run on a bare word: a batch that is not tied to a
    // frozen manifest and a named batch id is exactly the "dirty tree acceptance" the plan forbids.
    refuse(['--formal'], /requires --manifest/)
    refuse(['--diagnostic'], /requires --manifest/)
    refuse(['--formal', '--manifest', '/tmp/frozen/manifest.json'], /requires --batch/)
  })
})

describe('the url-scan CLI exposes the paid modes for a frozen batch', () => {
  it('accepts a formal batch named against a frozen manifest', () => {
    expect(
      parseUrlScanCli([
        '--formal',
        '--manifest',
        '/tmp/frozen/manifest.json',
        '--batch',
        'ui-r0-c1',
      ]),
    ).toEqual({
      mode: 'formal',
      manifest: '/tmp/frozen/manifest.json',
      batch: 'ui-r0-c1',
    })
  })

  it('accepts a diagnostic batch and an explicit sample filter', () => {
    expect(
      parseUrlScanCli([
        '--diagnostic',
        '--manifest',
        '/tmp/frozen/manifest.json',
        '--batch',
        'ui-r0-d1',
        '--samples',
        'healthy-catalog,overlay-defect',
      ]),
    ).toEqual({
      mode: 'diagnostic',
      manifest: '/tmp/frozen/manifest.json',
      batch: 'ui-r0-d1',
      samples: ['healthy-catalog', 'overlay-defect'],
    })
  })

  it('plans without spending when asked, so a dry run is its own mode', () => {
    // A dry run must be reachable without naming a paid mode at all: it is the way an operator checks
    // the plan and the cost ceiling *before* asking for authorisation to spend.
    expect(
      parseUrlScanCli([
        '--dry-run',
        '--manifest',
        '/tmp/frozen/manifest.json',
        '--batch',
        'ui-r0-d1',
      ]),
    ).toEqual({
      mode: 'dry-run',
      manifest: '/tmp/frozen/manifest.json',
      batch: 'ui-r0-d1',
    })
  })

  it('refuses a paid mode on a dirty tree, before any credential is read', () => {
    refuse(
      ['--formal', '--manifest', '/tmp/frozen/manifest.json', '--batch', 'b', '--dirty'],
      /unknown option/,
    )
  })
})
