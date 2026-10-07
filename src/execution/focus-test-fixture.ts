import { createFocusReceipt, type FocusReceipt, type FocusSample } from './focus-receipt.ts'
/** Valid bounded measurement shared by persistence/gate regression tests. Not a browser oracle. */
export function focusTestReceipt(
  candidateId = 'candidate-1',
  over: Partial<FocusReceipt> = {},
): FocusReceipt {
  const clean = { version: 1 as const, status: 'clean' as const, interventionIds: [] }
  const sample = (side: FocusSample['side'], x: number): FocusSample => ({
    side,
    x,
    y: 220,
    hit: { ref: 'wrapper', tag: 'div', relation: 'ancestor' },
    focusBefore: null,
    focusAfter: null,
    focusedWithinMs: null,
    observedWindowMs: 520,
    valueChanged: false,
    stable: true,
    documentEpoch: 'epoch-1',
    integrity: clean,
    ...(side === 'retest' ? { retestOf: 'left' as const } : {}),
  })
  return createFocusReceipt({
    candidateId,
    screenshotRef: 'shot-1',
    screenshotSha: 'a'.repeat(64),
    documentEpoch: 'epoch-1',
    url: 'http://localhost:4173/',
    scroll: { x: 0, y: 0 },
    viewport: { width: 1280, height: 768 },
    binding: { elementRef: 'e1', nodeIdentity: 'node-1', reason: 'unique input' },
    positiveControl: {
      ...sample('left', 300),
      focusAfter: 'node-1',
      focusedWithinMs: 20,
      ok: true,
    },
    samples: [sample('left', 148), sample('right', 452), sample('retest', 148)],
    resets: [{ x: 10, y: 10, introducedChange: false, integrity: clean }],
    actionCost: 5,
    integrity: clean,
    algorithmVersion: 'visual-focus-2',
    ...over,
  })
}
