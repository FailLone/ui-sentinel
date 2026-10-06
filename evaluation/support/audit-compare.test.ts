import { describe, expect, it } from 'vitest'
import {
  compareEventHistory,
  compareFindings,
  compareHypotheses,
  evaluateHashes,
} from './audit-compare.ts'

/**
 * The comparisons a post-shutdown audit makes (acceptance E01-E03).
 *
 * E01 is about coverage: the API reads the whole history, so a tail-only comparison would call a
 * truncated log "matching". E02 is about content: a deleted middle row, a reused seq, a rewritten
 * payload or evidence list must each fail on their own. These are pure functions over what the two
 * sides read, so each failure mode can be produced without a real database.
 */

const event = (seq: number, over: Record<string, unknown> = {}) => ({
  id: `e${seq}`,
  seq,
  type: 'step:completed',
  payload: { step: seq },
  evidenceRefs: [`a${seq}`],
  ...over,
})

describe('event history comparison (E01, E02)', () => {
  it('matches equal, ordered, gapless histories', () => {
    const result = compareEventHistory(
      [event(0), event(1), event(2)],
      [event(0), event(1), event(2)],
    )
    expect(result.passed).toBe(true)
    expect(result.failedAssertions).toEqual([])
  })

  it('fails when the database lost a middle row', () => {
    const result = compareEventHistory([event(0), event(1), event(2)], [event(0), event(2)])
    expect(result.passed).toBe(false)
    expect(result.failedAssertions).toContain('events-missing')
  })

  it('fails when a seq is repeated', () => {
    // Reusing a seq means a row was written twice under one position; the tail would still line up.
    const result = compareEventHistory(
      [event(0), event(1), event(2)],
      [event(0), event(1), event(1), event(2)],
    )
    expect(result.passed).toBe(false)
    expect(result.failedAssertions).toContain('events-seq-duplicated')
  })

  it('fails when a payload differs even though the count and tail agree', () => {
    const result = compareEventHistory(
      [event(0), event(1), event(2)],
      [event(0), event(1, { payload: { step: 99 } }), event(2)],
    )
    expect(result.passed).toBe(false)
    expect(result.failedAssertions).toContain('events-changed')
  })

  it('fails when evidenceRefs differ', () => {
    const result = compareEventHistory(
      [event(0), event(1)],
      [event(0), event(1, { evidenceRefs: [] })],
    )
    expect(result.passed).toBe(false)
    expect(result.failedAssertions).toContain('events-changed')
  })

  it('fails when a sequence number is missing from the stored history', () => {
    const result = compareEventHistory([event(0), event(1)], [event(0), event(5)])
    expect(result.failedAssertions).toContain('events-seq-gap')
  })

  it('reports an empty stored history against a non-empty API history as a failure', () => {
    // An empty set must not pass by vacuous truth - that is the "empty collection passes silently"
    // shape E03 names.
    const result = compareEventHistory([event(0)], [])
    expect(result.passed).toBe(false)
  })

  it('accepts two empty histories as matching', () => {
    expect(compareEventHistory([], []).passed).toBe(true)
  })

  it('fails when the API history itself is missing a middle page (E01)', () => {
    // A paginated read that skipped a page leaves a gap on the API side; the tail would still line up
    // with the store, so only a full-history check catches it.
    const result = compareEventHistory(
      [event(0), event(1), event(3)],
      [event(0), event(1), event(3)],
    )
    expect(result.passed).toBe(false)
    expect(result.failedAssertions).toContain('events-api-incomplete')
  })
})

describe('findings and hypotheses comparison (E02)', () => {
  const finding = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    validationStatus: 'supported',
    evidenceRefs: [`r-${id}`],
    ...over,
  })

  it('matches identical findings', () => {
    expect(compareFindings([finding('f1')], [finding('f1')]).passed).toBe(true)
  })

  it('fails when a finding was added on either side', () => {
    expect(compareFindings([finding('f1')], [finding('f1'), finding('f2')]).passed).toBe(false)
    expect(compareFindings([finding('f1'), finding('f2')], [finding('f1')]).passed).toBe(false)
  })

  it('fails when a validation status or evidence list changed', () => {
    expect(
      compareFindings([finding('f1')], [finding('f1', { validationStatus: 'refuted' })])
        .failedAssertions,
    ).toContain('findings-changed')
    expect(
      compareFindings([finding('f1')], [finding('f1', { evidenceRefs: [] })]).failedAssertions,
    ).toContain('findings-changed')
  })

  it('compares hypotheses by status and evidence, not only by id', () => {
    const h = { id: 'h1', status: 'open', evidenceRefs: ['a'] }
    expect(compareHypotheses([h], [h]).passed).toBe(true)
    expect(compareHypotheses([h], [{ ...h, status: 'supported' }]).passed).toBe(false)
    expect(compareHypotheses([h], [{ ...h, evidenceRefs: ['b'] }]).passed).toBe(false)
  })
})

describe('artifact hash evaluation (E03)', () => {
  it('fails when the index has no entry for a stored artifact', () => {
    const result = evaluateHashes([
      { artifactId: 'a1', hashesMatch: true, indexed: false, exists: true },
      { artifactId: 'a2', hashesMatch: true, indexed: true, exists: true },
    ])
    expect(result.passed).toBe(false)
    expect(result.failedAssertions).toContain('artifact-not-indexed:a1')
  })

  it('fails when the original and downloaded bytes differ', () => {
    const result = evaluateHashes([
      { artifactId: 'a1', hashesMatch: false, indexed: true, exists: true },
    ])
    expect(result.passed).toBe(false)
    expect(result.failedAssertions).toContain('artifact-bytes-changed:a1')
  })

  it('does not pass an empty artifact set silently when the run recorded artifacts', () => {
    expect(evaluateHashes([]).passed).toBe(true)
    expect(evaluateHashes([], { expectedCount: 2 }).passed).toBe(false)
    expect(evaluateHashes([], { expectedCount: 2 }).failedAssertions).toContain(
      'artifact-index-incomplete',
    )
  })
})

it('E02 rejects exchanging sequence numbers while keeping event ids and payloads', () => {
  const api = [
    { id: 'a', seq: 1, type: 'x', payload: {}, evidenceRefs: [] },
    { id: 'b', seq: 2, type: 'y', payload: {}, evidenceRefs: [] },
  ]
  expect(
    compareEventHistory(api, [
      { ...api[1]!, seq: 1 },
      { ...api[0]!, seq: 2 },
    ]).failedAssertions,
  ).toContain('events-changed')
})
it('E02 rejects rewritten finding titles and hypothesis reasoning with unchanged statuses', () => {
  const finding = { id: 'f', validationStatus: 'supported', evidenceRefs: ['r'], title: 'original' }
  expect(
    compareFindings([finding], [{ ...finding, title: 'changed' }] as (typeof finding)[])
      .failedAssertions,
  ).toContain('findings-changed')
  const hypothesis = { id: 'h', status: 'refuted', evidenceRefs: ['r'], basis: 'original' }
  expect(
    compareHypotheses([hypothesis], [{ ...hypothesis, basis: 'changed' }] as (typeof hypothesis)[])
      .failedAssertions,
  ).toContain('hypotheses-changed')
})
