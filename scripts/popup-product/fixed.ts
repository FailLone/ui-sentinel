import { installPopupDecision } from '../../src/agent/popup/contract.ts'
installPopupDecision(() => async (packet, signal) => {
  signal.throwIfAborted()
  const candidate =
    packet.stage === 'target'
      ? packet.candidates.find((c) => /Custom panel/.test(c.description))
      : packet.candidates.find((c) => /Open details|More options|Try details/.test(c.description))
  return { binding: packet.binding, choice: candidate?.id ?? 'handoff', confidence: 1 }
})
await import('../../src/server/index.ts')
