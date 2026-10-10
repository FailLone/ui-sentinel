/** Operator-only catalog. Never expose it, IDs, expected outcomes or module source over HTTP. */
import { documentFor } from '../../../scripts/parallel-popup-real/fixtures.ts'
import { brandPage, layoutPage, popupPage } from '../../fixtures/counterexample-arena/pages.ts'
import { popupEffectCases } from './popup-effects.ts'

const wide = { width: 640, height: 480 }
const desktop = { width: 1280, height: 768 }
export const cases = [
  {
    id: 'CA01',
    family: 'popup',
    viewport: wide,
    html: () => documentFor('/p/two')!,
    actions: ['More options', 'Details'],
    expected: 'pass',
  },
  {
    id: 'CA02',
    family: 'popup',
    viewport: { width: 320, height: 480 },
    html: () => documentFor('/p/two')!,
    actions: ['More options', 'Details'],
    expected: 'fail',
  },
  {
    id: 'CA03',
    family: 'popup',
    viewport: wide,
    html: () => popupPage(popupEffectCases[0].html),
    actions: ['Open details'],
    expected: 'absent',
    effect: 'unverified',
  },
  {
    id: 'CA04',
    family: 'popup',
    viewport: wide,
    html: () => popupPage(popupEffectCases[2].html),
    actions: ['Open details'],
    expected: 'pass',
    effect: 'unverified',
  },
  {
    id: 'CA05',
    family: 'popup',
    viewport: wide,
    html: () => popupPage(popupEffectCases[3].html),
    actions: ['Open details'],
    expected: 'pass',
    effect: 'verified',
  },
  {
    id: 'CA06',
    family: 'image',
    viewport: desktop,
    html: () => brandPage('height:240px;object-fit:contain', true),
    fit: 'contain',
    height: 240,
    contracted: true,
    expected: 'pass',
  },
  {
    id: 'CA07',
    family: 'image',
    viewport: desktop,
    html: () => brandPage('height:240px;object-fit:cover', true),
    fit: 'cover',
    height: 240,
    contracted: true,
    expected: 'pass',
  },
  {
    id: 'CA08',
    family: 'image',
    viewport: desktop,
    html: () => brandPage('height:60px', true),
    fit: 'fill',
    height: 60,
    contracted: true,
    expected: 'fail',
  },
  {
    id: 'CA09',
    family: 'image',
    viewport: desktop,
    html: () => brandPage('height:60px', false),
    fit: 'fill',
    height: 60,
    contracted: false,
    expected: 'unknown',
  },
  {
    id: 'CA10',
    family: 'text',
    viewport: desktop,
    html: () => layoutPage('healthy'),
    mode: 'healthy',
    expected: ['pass', 'pass'],
  },
  {
    id: 'CA11',
    family: 'text',
    viewport: desktop,
    html: () => layoutPage('clipped'),
    mode: 'clipped',
    expected: ['fail', 'unknown'],
  },
  {
    id: 'CA12',
    family: 'text',
    viewport: desktop,
    html: () => layoutPage('overlap'),
    mode: 'overlap',
    expected: ['unknown', 'fail'],
  },
  {
    id: 'CA13',
    family: 'text',
    viewport: desktop,
    html: () => layoutPage('scroll'),
    mode: 'scroll',
    expected: ['unknown', 'unknown'],
  },
  {
    id: 'CA14',
    family: 'text',
    viewport: desktop,
    html: () => layoutPage('unknown'),
    mode: 'unknown',
    expected: ['unknown', 'unknown'],
  },
] as const
export type ArenaCase = (typeof cases)[number]
export function caseById(id: string): ArenaCase {
  const entry = cases.find((c) => c.id === id)
  if (!entry) throw Error('Unknown operator case ID')
  return entry
}
