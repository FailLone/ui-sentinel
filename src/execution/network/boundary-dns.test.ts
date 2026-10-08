import { it, expect, vi } from 'vitest'
import type { RunNetworkBoundaryDeps } from './boundary.ts'
import type { UiContractSnapshot } from '../../inspection/contract.ts'
import type { NetworkDecisionRecord, UiNetworkSessionOptions } from './session.ts'
const harness = vi.hoisted(() => ({ options: null as UiNetworkSessionOptions | null }))
vi.mock('./session.ts', () => ({
  installUiNetworkSession: async (options: UiNetworkSessionOptions) => {
    harness.options = options
    return { settle: async () => {}, seal: () => {}, navigation: {} }
  },
}))
import { installRunNetworkBoundary } from './boundary.ts'
it.each(['resolution-failed', 'transport-error'] as const)(
  'persists %s as network execution failure and prevents successful settlement',
  async (reasonCode) => {
    const appendEvent = vi.fn(async () => {})
    const recordIntervention = vi.fn(async () => {})
    const boundary = await installRunNetworkBoundary({
      uiScan: {
        entryUrl: 'https://entry.invalid',
        access: { resourceOrigins: [], dataOrigins: [] },
        scope: { maxPages: 3, maxDepth: 1 },
        unsupportedCapabilities: [],
      } as unknown as UiContractSnapshot,
      appendEvent,
      recordIntervention,
      recordUnsupported: async () => {},
      signal: new AbortController().signal,
    } as unknown as RunNetworkBoundaryDeps)
    harness.options!.onDecision!({
      allow: false,
      reasonCode,
      url: 'https://entry.invalid',
      method: 'GET',
      destination: 'document',
      dnsMode: 'doh',
      networkStage: 'resolution',
    } as NetworkDecisionRecord)
    await expect(boundary.settle()).rejects.toThrow(`ui-network-${reasonCode}`)
    expect(appendEvent).toHaveBeenCalledWith(
      'network:decision',
      expect.objectContaining({ reasonCode, dnsMode: 'doh' }),
    )
    expect(recordIntervention).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'network-denied' }),
    )
  },
)
