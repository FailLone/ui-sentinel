/** Small variations of r0-default-check-v2's Reveal/Other/late/unfinished fixture. No remote assets. */
export const cases = [
  { id: 'healthy', goal: 'Inspect public local controls.', actions: 6 },
  { id: 'semantic', goal: 'Inspect Reveal first, then the remaining public controls.', actions: 6 },
  {
    id: 'expanded',
    goal: 'Inspect public local controls including newly revealed controls.',
    actions: 6,
  },
  { id: 'recovery', goal: 'After clicking "Reveal", show text "Ready".', actions: 6 },
  { id: 'late', goal: 'Inspect public local controls.', actions: 6 },
  {
    id: 'budget',
    goal: 'Inspect public local controls including newly revealed controls.',
    actions: 1,
  },
] as const
export function html(id: string) {
  const expand = ['expanded', 'budget'].includes(id)
  const handler = expand
    ? `const b=document.createElement('button');b.textContent='Continue';b.onclick=()=>{document.querySelector('#result').textContent='Wrong'};document.body.append(b);document.querySelector('#result').textContent='Continue is now available';this.disabled=true;`
    : id === 'recovery'
      ? `document.querySelector('#result').textContent='Loading';setTimeout(()=>document.querySelector('#result').textContent='Ready',1800)`
      : `document.querySelector('#result').textContent='Ready';` +
        (id === 'late'
          ? `const p=document.createElement('p');p.textContent='Synchronously after clicking "Reveal", show text "Late".';document.body.append(p);`
          : '')
  return `<!doctype html><html><head><title>Public bounded inspection</title><style>body{padding:30px;font:18px sans-serif}button{padding:12px;margin:10px}</style></head><body><h1>Public bounded inspection</h1>${id === 'semantic' ? '<button id="other" onclick="this.textContent=\'Other checked\'">Other</button>' : ''}<button id="control" onclick="${handler.replaceAll('"', '&quot;')}">Reveal</button>${expand ? '<p>Synchronously after clicking "Continue", show text "Ready".</p>' : ''}<section id="result" role="region"></section><p>Unrelated stable text</p></body></html>`
}
