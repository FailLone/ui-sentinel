/** NEW public fixtures only. Old arenas, sample goals and historical truth are untouched. */
import { UI_V2_FIXTURE_REVISION } from './ui-default-checks-v2.ts'
export { UI_V2_FIXTURE_REVISION }
export type UiV2FixtureId = 'H0' | 'H1' | 'H2' | 'A1' | 'A2' | 'B1'
export const PUBLIC_NUMERIC_DECLARATION =
  'Synchronously after clicking this button, numbers in its controlled list must be ascending.'
export const PUBLIC_TEXT_DECLARATION = 'Synchronously after clicking "Reveal", show text "Ready".'
export function uiV2FixtureHtml(id: UiV2FixtureId, route = '/') {
  if (route === '/next')
    return '<!doctype html><html><body><h1>Next public page</h1><p>Static read-only content.</p></body></html>'
  const number = id === 'H1' || id === 'A1',
    dynamic = id === 'H2'
  const body = number
    ? `<p id="spec">${PUBLIC_NUMERIC_DECLARATION}</p><button type="button" id="sort" aria-controls="numbers" aria-describedby="spec">Sort</button><ol id="numbers"><li>8</li><li>3</li><li>5</li></ol>`
    : dynamic
      ? `<p>${PUBLIC_TEXT_DECLARATION}</p><button type="button" id="reveal">Reveal</button>`
      : '<button type="button" id="reveal">Reveal</button><button type="button" id="quiet">Quiet</button><label>Choice<select aria-label="Choice"><option value="a">Alpha</option><option value="b">Beta</option></select></label>'
  const numericScript = number
    ? `document.querySelector('#sort').addEventListener('click',()=>{document.querySelector('#numbers').innerHTML=${JSON.stringify(id === 'A1' ? '<li>8</li><li>3</li><li>5</li>' : '<li>3</li><li>5</li><li>8</li>')}});`
    : ''
  const textScript = !number
    ? "document.querySelector('#reveal').addEventListener('click',()=>{const n=document.createElement('section');n.setAttribute('role','region');n.textContent='Ready';document.body.append(n)});"
    : ''
  const boundary =
    id === 'B1'
      ? "fetch('/read-only-forbidden',{method:'POST',body:'not-authorized'}).catch(()=>{});"
      : ''
  const overlay =
    id === 'A2'
      ? '<div style="position:fixed;inset:0;z-index:10;background:rgba(250,250,250,.2)">Public blocking layer</div>'
      : ''
  return `<!doctype html><html><head><style>body{padding:32px;font:18px sans-serif}button,select{padding:12px;margin:8px}</style></head><body><h1>Public bounded UI sample</h1>${body}<a href="/next">Next</a>${overlay}<script>${numericScript}${textScript}${boundary}</script></body></html>`
}
/** Unexecuted future matrix: no approval, pricing claim, active ledger or paid capability. */
export const UI_V2_MANIFEST_DRAFT = {
  schemaVersion: 1,
  status: 'draft-not-executed-not-authorized',
  paid: false,
  protocol: 'ui-default-checks-3',
  fixtureRevision: UI_V2_FIXTURE_REVISION,
  diagnostic: ['H0', 'H1', 'H2', 'A1', 'A2', 'B1'],
  formal: ['H0', 'H1', 'H2', 'A1', 'A2'].flatMap((id) =>
    [1, 2, 3].map((repeat) => ({ id, repeat })),
  ),
  retainedThresholds: {
    uiFormal: 15,
    healthy: 9,
    anomaly: 6,
    anomaliesRequireIndependentValidFinding: true,
    businessDiagnostic: 5,
    businessFormal: 45,
  },
  semanticChange:
    'H0 permits genuinely unspecified functionality only after every generic obligation; H1/H2/A1 require publicly declared effects; old results never recalculated',
  blockedBy: [
    'original persistence fault open',
    'independent free delivery review',
    'new final build/config/source/fixture freeze',
    'new explicit paid authorization with original cumulative ledger',
  ],
  originalModels: {
    agent: 'deepseek/deepseek-v4.1-flash',
    vision: 'qwen/qwen3.7-plus',
    provider: 'Alibaba',
    reasoning: 'low',
    maxOutputTokens: 4096,
  },
  budgets: {
    totalTimeoutMs: 300000,
    maxActions: 20,
    maxModelCalls: 30,
    toolTimeoutMs: 15000,
    modelTimeoutMs: 60000,
    retries: 1,
  },
  smoke: 'same existing three groups; not authorized or executed here',
} as const
