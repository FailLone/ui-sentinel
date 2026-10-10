import { choices, installPopupDecision } from '../../src/agent/popup/contract.ts'
installPopupDecision(() => async (packet, signal) => {
  signal.throwIfAborted()
  const candidate =
    packet.stage === 'target'
      ? packet.candidates.find((c) => /Custom panel/.test(c.description))
      : packet.candidates.find((c) => /Open details|More options|Try details/.test(c.description))
  const choice = candidate?.id ?? (packet.revision === 'popup-semantic-2' ? 'none' : 'handoff')
  return {
    binding: packet.binding,
    choice,
    confidence: 1,
    probabilities: Object.fromEntries(
      Object.keys(choices(packet)).map((id) => [id, id === choice ? 1 : 0]),
    ),
  }
})
await import('../../src/server/index.ts')
