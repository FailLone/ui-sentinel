import { validateSuggestion, type PopupQuestion, type PopupSuggestion } from './contract.ts'

/** Provisional engineering policy, not calibrated accuracy. Feature remains opt-in. */
export const POPUP_SEMANTIC_POLICY = Object.freeze({
  version: 'popup-purpose-policy-2',
  entry: 'strict-probability-majority-for-bounded-exploration',
  target: 'strict-majority-and-legacy-confidence-floor-with-original-evidence',
  targetConfidenceFloor: 0.65,
  candidateGeometry: 'observation-only-no-item-completion',
  maxCandidateMeasurements: 2,
  calibrated: false,
} as const)
export function adoptPopupSuggestion(packet: PopupQuestion, value: PopupSuggestion) {
  if (packet.revision !== 'popup-semantic-2' || packet.stage === 'recovery')
    throw Error('popup-unsupported-semantic-policy')
  const raw = validateSuggestion(packet, value)
  const probabilities = raw.probabilities!
  const selected = probabilities[raw.choice]!
  const others = Object.entries(probabilities)
    .filter(([id]) => id !== raw.choice)
    .map(([, p]) => p)
  const unique = others.every((p) => selected > p)
  const accepted =
    raw.choice !== 'none' &&
    unique &&
    (packet.stage === 'target'
      ? selected > others.reduce((a, b) => a + b, 0) &&
        raw.confidence >= POPUP_SEMANTIC_POLICY.targetConfidenceFloor
      : selected > others.reduce((a, b) => a + b, 0))
  const reason =
    raw.choice === 'none'
      ? 'no-semantic-match'
      : !unique
        ? 'semantic-tie'
        : accepted
          ? packet.stage === 'target'
            ? 'provisional-association-admitted'
            : 'bounded-exploration-majority'
          : packet.stage === 'target'
            ? 'association-below-provisional-floor'
            : 'exploration-without-majority'
  return {
    policy: POPUP_SEMANTIC_POLICY.version,
    calibrated: false,
    purpose: packet.stage === 'target' ? 'target-association' : 'entry-exploration',
    raw,
    n: Object.keys(probabilities).length,
    accepted,
    reason,
    proposal: { ...raw, choice: accepted ? raw.choice : 'handoff' },
  }
}
