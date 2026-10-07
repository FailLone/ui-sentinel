/**
 * Test-only fixed-response transport.
 *
 * This is the DEFAULT transport and it performs zero network I/O. It exists so the wiring and the
 * defensive logic can be exercised without any provider access. A fixed response proves the
 * plumbing, NOT the semantic quality of a real Jev judgement.
 */
import { readFileSync } from 'node:fs'
import { parseStubReply, type NormalizedReceipt } from './receipt.ts'
import type { SendFn } from './transport.ts'

const STUB_DIR = 'evaluation/r1-jev-dev/stub'

export function readStubReply(scenario: string): NormalizedReceipt {
  const parsed = parseStubReply(JSON.parse(readFileSync(`${STUB_DIR}/${scenario}.json`, 'utf8')))
  if (!parsed.ok) throw new Error(`stub reply unusable: ${scenario}: ${parsed.detail}`)
  return parsed.value
}

/** Default transport: fixed reply, no fetch, no environment read, no implicit network. */
export function createStubTransport(scenario: string): SendFn {
  return async (_request, options) => {
    options.signal.throwIfAborted()
    return readStubReply(scenario)
  }
}
