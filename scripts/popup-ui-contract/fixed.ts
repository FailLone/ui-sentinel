import { choices, installPopupDecision } from '../../src/agent/popup/contract.ts'
installPopupDecision(() => async (packet, signal) => {
  signal.throwIfAborted()
  if (packet.stage === 'target') throw Error('TARGET is forbidden by popup-viewport-2 contract')
  const choice =
    packet.candidates.find((c) => /Open details|More options|Try details/.test(c.description))
      ?.id ?? 'none'
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
