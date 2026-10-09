import { controlLayoutFixture } from '../../evaluation/fixtures/control-layout.ts'
/** Public synthetic pages. Only the validator knows which document contains the defect. */
export const fixtures = {
  'menu-healthy': `<p>Synchronously after clicking "Open menu", show text "Ready".</p><button aria-expanded="false" onclick="this.setAttribute('aria-expanded','true');this.disabled=true;document.querySelector('#result').textContent='Ready'">Open menu</button><section id="result" role="region"></section>`,
  'layout-pair': controlLayoutFixture('clipped')
    .replace('text-align:right;', 'text-align:right;width:60px;overflow:auto;')
    .replace('>Next</button>', '>Scrollable action name</button>'),
  'three-step-defect': sequence('Wrong'),
  'three-step-healthy': sequence('Ready'),
  'view-context': `<p>Synchronously after clicking "Read panel", show text "Ready".</p><button onclick="document.querySelector('#result').textContent=document.querySelector('#view').getAttribute('aria-pressed')==='true'?'Wrong':'Ready'">Read panel</button><button id="view" aria-pressed="false" onclick="this.setAttribute('aria-pressed','true');this.disabled=true;document.querySelector('#result').textContent=''">Switch public view</button><section id="result" role="region"></section>`,
  'view-context-healthy': `<p>Synchronously after clicking "Read panel", show text "Ready".</p><button onclick="document.querySelector('#result').textContent=document.querySelector('#view').getAttribute('aria-pressed')==='true'?'Ready':'Ready'">Read panel</button><button id="view" aria-pressed="false" onclick="this.setAttribute('aria-pressed','true');this.disabled=true;document.querySelector('#result').textContent=''">Switch public view</button><section id="result" role="region"></section>`,
  'state-cycle': `<button id="switch" aria-pressed="false" onclick="this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')==='true'?'false':'true');document.querySelector('#state').textContent=this.getAttribute('aria-pressed')">Toggle view</button><p id="state">false</p>`,
  fairness: `<p>Synchronously after clicking "Primary", show text "Ready".</p><p>Synchronously after clicking "Secondary", show text "Ready".</p><p>Synchronously after clicking "Quiet control", show text "Ready".</p><button onclick="document.querySelector('#result').textContent='Wrong'">Primary</button><button onclick="document.querySelector('#result').textContent='Ready'">Secondary</button><button onclick="document.querySelector('#result').textContent='Unexpected'">Quiet control</button><section id="result" role="region"></section>`,
  'repeat-defect': `<p>Synchronously after clicking "Switch view", show text "Ready".</p><button aria-pressed="false" onclick="this.setAttribute('aria-pressed',this.getAttribute('aria-pressed')==='true'?'false':'true');document.querySelector('#result').textContent=this.getAttribute('aria-pressed')==='true'?'Ready':'Wrong'">Switch view</button><section id="result" role="region"></section>`,
  'tabs-defect': `<p>Synchronously after clicking "Details tab", show text "Details".</p><button role="tab" aria-selected="false" onclick="this.setAttribute('aria-selected','true');this.disabled=true;document.querySelector('#result').textContent='Overview'">Details tab</button><section id="result" role="region"></section>`,
  'boundary-input': `<label>Short label <input aria-label="Short label" type="text" maxlength="3"></label><p>The public field allows at most 3 characters. No form submission.</p>`,
  ambiguous: `<p>Two controls share their public name; their intended meaning is not declared.</p><button>Open</button><button>Open</button>`,
  recovery: `<p>Synchronously after clicking "Reveal", show text "Ready".</p><button onclick="this.disabled=true">Reveal</button>`,
  'refresh-unbindable': `<canvas></canvas><p>This public view has an unsupported drawing surface.</p>`,
  refresh: `<button onclick="this.disabled=true;document.querySelector('#result').textContent='Opened'">Open panel</button><section id="result"></section>`,
  'return-start': `<a href="/return-end">Visit details</a>`,
  'return-end': `<p>Public details page.</p>`,
  budget: sequence('Wrong'),
} as const
function sequence(value: string) {
  return `<h1>Three-stage public panel</h1><p>Synchronously after clicking "Confirm", show text "Ready".</p><section id="controls"><button id="reveal" onclick="this.disabled=true;document.querySelector('#controls').insertAdjacentHTML('beforeend', '&lt;button id=&quot;next&quot;&gt;Next&lt;/button&gt;');document.querySelector('#next').onclick=()=>{document.querySelector('#next').disabled=true;document.querySelector('#controls').insertAdjacentHTML('beforeend','&lt;button id=&quot;confirm&quot;&gt;Confirm&lt;/button&gt;');document.querySelector('#confirm').onclick=()=>{document.querySelector('#result').textContent='${value}';document.querySelector('#confirm').disabled=true}}">Reveal</button></section><section id="result" role="region"></section>`
}
export function page(body: string) {
  return `<!doctype html><html><head><title>Public UI inspection</title><style>body{padding:24px;font:16px Arial}button,input{margin:8px;padding:10px}section{min-height:20px}</style></head><body>${body}</body></html>`
}

export type FixtureName = keyof typeof fixtures
export function pathFor(name: string) {
  const index = Object.keys(fixtures).indexOf(name)
  if (index < 0) throw Error('unknown-fixture')
  return '/sample-' + String(index + 1).padStart(2, '0')
}
export function fixtureAt(path: string) {
  return (Object.keys(fixtures) as FixtureName[]).find((name) => pathFor(name) === path)
}
export function documentFor(name: FixtureName) {
  const body = fixtures[name].replaceAll('/return-end', pathFor('return-end'))
  return body.startsWith('<!doctype') ? body : page(body)
}
