/** Existing 373abc8 browser counterexamples; private outcomes never served. */
export const popupEffectCases = [
  {
    name: 'fixed-button-text-change',
    html: `<button style="position:fixed;background:white;border:1px solid;top:20px" onclick="this.textContent='Details overview'">Open details</button>`,
    outcome: 'unverified',
  },
  {
    name: 'insert-before-surviving-sibling',
    html: `<button onclick="const p=document.createElement('div');p.textContent='Details overview';p.style.cssText='position:fixed;background:white;border:1px solid;top:100px;width:200px;height:100px';document.body.insertBefore(p,document.querySelector('div'))">Open details</button><div>Existing content</div>`,
    outcome: 'verified',
  },
  {
    name: 'replace-hidden-original-target',
    html: `<button onclick="const old=document.getElementById('panel');const p=old.cloneNode(true);p.hidden=false;old.replaceWith(p)">Open details</button><div id="panel" hidden style="position:fixed;background:white;border:1px solid;top:100px;width:200px;height:100px">Details overview</div>`,
    outcome: 'unverified',
  },
  {
    name: 'native-dialog-appears',
    html: `<button onclick="document.querySelector('dialog').showModal()">Open details</button><dialog>Details overview</dialog>`,
    outcome: 'verified',
  },
] as const
