/** Private evaluation fixtures, never imported by production execution or agent policy. */
export const investigationCases = [
  'menu-broken',
  'menu-healthy',
  'feedback-broken',
  'feedback-healthy',
  'layout-broken',
  'layout-healthy',
] as const
export type InvestigationCase = (typeof investigationCases)[number]
export const inspectionGoal =
  'Explore the available local controls and inspect the interface against its published requirements. Investigate observed anomalies and retain measured evidence. Do not make purchases or other network writes. Finish with an honest account of the inspected scope.'
export function investigationHtml(id: InvestigationCase) {
  const healthy = id.endsWith('healthy')
  const content = id.startsWith('menu')
    ? `
    <p>Choose a delivery time. Every offered time must be readable and selectable when the list is open.</p>
    <button id="open" onclick="document.querySelector('#choices').hidden=false">Delivery times</button>
    <div id="choices" hidden style="width:240px;height:${healthy ? 180 : 54}px;overflow:hidden;border:1px solid #ccc">
      <div role="listbox" aria-label="Delivery time">
        <button role="option" style="display:block;height:52px;width:220px" onclick="document.querySelector('#selection').textContent=this.textContent">Morning</button>
        <button role="option" style="display:block;height:52px;width:220px" onclick="document.querySelector('#selection').textContent=this.textContent">Afternoon</button>
        <button role="option" style="display:block;height:52px;width:220px" onclick="document.querySelector('#selection').textContent=this.textContent">Evening</button>
      </div>
    </div><p id="selection" aria-live="polite"></p>`
    : id.startsWith('feedback')
      ? `
    <p>Check your delivery address. If it is incomplete, an explanation must appear in the current viewport without scrolling.</p>
    <label>Address <input aria-label="Address"></label>
    <button id="check" onclick="document.querySelector('#message').hidden=false">Check address</button>
    <p id="message" role="alert" hidden style="${healthy ? '' : 'position:absolute;top:1100px'}">Address incomplete: provide a street and house number.</p>`
      : `
    <p>Load delivery details before continuing. Continue must remain in the current viewport while details load and after loading; no scrolling should be required.</p>
    <button id="load" onclick="setTimeout(()=>{document.querySelector('#details').style.height='${healthy ? 80 : 900}px';document.querySelector('#details').textContent='Delivery details loaded'},150)">Load details</button>
    <div id="details" aria-live="polite"></div><button id="continue" onclick="document.querySelector('#done').textContent='Ready'">Continue</button><p id="done"></p>`
  return `<!doctype html><html><head><title>Delivery preferences</title><style>body{font:16px sans-serif;margin:32px}button,input{font:inherit;padding:10px}p{max-width:650px}</style></head><body><h1>Delivery preferences</h1>${content}</body></html>`
}
