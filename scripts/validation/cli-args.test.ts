import { describe, expect, it } from 'vitest'
import { parseBusinessCli, parseVisualCli } from './cli-args.ts'

describe('visual CLI parsing (R01)', () => {
  it('defaults to the free preflight with no arguments', () => {
    expect(parseVisualCli([])).toEqual({ mode: 'preflight' })
    expect(parseVisualCli(['--'])).toEqual({ mode: 'preflight' })
  })

  it('never treats a bare paid flag as the default', () => {
    // --diagnostic without a campaign is refused rather than silently downgraded to free.
    expect(() => parseVisualCli(['--diagnostic'])).toThrow(/requires --campaign/)
    expect(() => parseVisualCli(['--formal', '--campaign', 'c'])).toThrow(
      /requires --campaign and --diagnostic-source/,
    )
  })

  it('refuses unknown options', () => {
    expect(() => parseVisualCli(['--preflight', '--bogus'])).toThrow(/unknown option/)
  })

  it('refuses repeated options', () => {
    expect(() => parseVisualCli(['--diagnostic', '--campaign', 'a', '--campaign', 'b'])).toThrow(
      /repeated option/,
    )
  })

  it('refuses a missing value', () => {
    expect(() => parseVisualCli(['--diagnostic', '--campaign'])).toThrow(/requires a value/)
    expect(() => parseVisualCli(['--formal', '--campaign', 'c', '--diagnostic-source'])).toThrow(
      /requires a value/,
    )
  })

  it('refuses conflicting modes', () => {
    expect(() => parseVisualCli(['--preflight', '--formal'])).toThrow(/exactly one of/)
    expect(() => parseVisualCli(['--diagnostic', '--campaign', 'c', '--p2-smoke'])).toThrow(
      /exactly one of/,
    )
  })

  it('refuses positional arguments', () => {
    expect(() => parseVisualCli(['--diagnostic', '--campaign', 'c', 'extra'])).toThrow(
      /unexpected positional/,
    )
  })

  it('validates a --cases list', () => {
    expect(parseVisualCli(['--p2-smoke', '--cases', 'D0,H0'])).toEqual({
      mode: 'p2-smoke',
      cases: ['D0', 'H0'],
    })
    expect(() => parseVisualCli(['--p2-smoke', '--cases', 'D0,D0'])).toThrow(/invalid --cases/)
    expect(() => parseVisualCli(['--p2-smoke', '--cases', 'ZZ'])).toThrow(/invalid --cases/)
  })

  it('accepts a well-formed diagnostic and formal invocation', () => {
    expect(parseVisualCli(['--diagnostic', '--campaign', 'data/campaigns/x'])).toEqual({
      mode: 'diagnostic',
      campaign: 'data/campaigns/x',
    })
    expect(parseVisualCli(['--formal', '--campaign', 'c', '--diagnostic-source', 'd'])).toEqual({
      mode: 'formal',
      campaign: 'c',
      diagnosticSource: 'd',
    })
  })

  it('refuses options on the free preflight', () => {
    expect(() => parseVisualCli(['--preflight', '--campaign', 'c'])).toThrow(/takes no options/)
  })
})

describe('business CLI parsing (R01)', () => {
  it('defaults to free preflight', () => {
    expect(parseBusinessCli([])).toEqual({ mode: 'preflight' })
  })
  it('requires a campaign for diagnostic and a source for formal', () => {
    expect(() => parseBusinessCli(['--diagnostic'])).toThrow(/requires --campaign/)
    expect(() => parseBusinessCli(['--formal', '--campaign', 'c'])).toThrow(
      /requires --campaign and --diagnostic-source/,
    )
  })
  it('parses groups', () => {
    expect(
      parseBusinessCli([
        '--formal',
        '--campaign',
        'c',
        '--diagnostic-source',
        'd',
        '--groups',
        'A,C',
      ]),
    ).toEqual({ mode: 'formal', campaign: 'c', diagnosticSource: 'd', groups: ['A', 'C'] })
  })
  it('refuses unknown and repeated options', () => {
    expect(() => parseBusinessCli(['--preflight', '--nope'])).toThrow(/unknown option/)
    expect(() =>
      parseBusinessCli([
        '--formal',
        '--campaign',
        'a',
        '--campaign',
        'b',
        '--diagnostic-source',
        'd',
      ]),
    ).toThrow(/repeated option/)
  })
})
