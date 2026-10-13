/** Public UI fixture. Case labels/oracle are never included in model input. */
export function fixtureHtml(broken: boolean): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Item chooser</title>
<style>body{font:18px system-ui;padding:40px}dialog{min-width:460px}button{display:block;margin:12px;padding:12px}</style>
<h1>Workspace</h1><button aria-description="Opens a dialog titled Choose a source." onclick="show('chooser')">Add item</button>
<dialog></dialog><script>(()=>{
const dialog=document.querySelector('dialog');
const screens={
 chooser:{heading:'Choose a source',buttons:[['Saved items','list','Available items'],['Recent items','list','Available items'],['New item','form','New item preview'],['Close','home','Workspace']]},
 list:{heading:'Available items',buttons:[['Choose Alpha','selected','Selected Alpha'],['Back','chooser','Choose a source']]},
 form:{heading:'New item preview',buttons:[['Preview Alpha','selected','Selected Alpha'],['Back','chooser','Choose a source']]},
 selected:{heading:'Selected Alpha',buttons:[['Details','details','Item details'],['Done','home','Workspace']]},
 details:{heading:'Item details',buttons:[['Back','selected','Selected Alpha']]}
};
window.show=function show(screen){
 if(screen==='home'){dialog.close();dialog.replaceChildren();return;}
 const spec=screens[screen];dialog.replaceChildren();
 const h=document.createElement('h2');h.textContent=spec.heading;dialog.append(h);
 for(const [name,target,heading] of spec.buttons){
  const b=document.createElement('button');b.textContent=name;
  b.setAttribute('aria-description','Displays the heading '+heading+'.');
  b.onclick=()=>{if(${JSON.stringify(broken)}&&screen==='selected'&&name==='Details')return;show(target)};
  dialog.append(b);
 }
 if(!dialog.open)dialog.showModal();
}
})();</script></html>`
}

/** Independent scenario expectations, available to scoring only after exploration. */
export const expectedTransitions = [
  ['Workspace', 'Add item', 'Choose a source'],
  ['Choose a source', 'Saved items', 'Available items'],
  ['Choose a source', 'Recent items', 'Available items'],
  ['Choose a source', 'New item', 'New item preview'],
  ['Choose a source', 'Close', 'Workspace'],
  ['Available items', 'Choose Alpha', 'Selected Alpha'],
  ['Available items', 'Back', 'Choose a source'],
  ['New item preview', 'Preview Alpha', 'Selected Alpha'],
  ['New item preview', 'Back', 'Choose a source'],
  ['Selected Alpha', 'Details', 'Item details'],
  ['Selected Alpha', 'Done', 'Workspace'],
  ['Item details', 'Back', 'Selected Alpha'],
] as const
