/** Public resettable application. Scoring lives separately; no oracle is sent to the agent. */
export function complexFixtureHtml(broken: boolean): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Research workspace</title>
<style>body{font:16px system-ui;padding:24px}button,input{margin:6px;padding:8px}dialog{width:580px}section{border:1px solid #aaa;padding:8px;margin:8px}p{max-width:650px}</style>
<main></main><script>(()=>{
let query='';
const main=document.querySelector('main');
const button=(name,target,heading,extra='')=>'<button aria-description="Displays the heading '+heading+'. '+extra+'" data-target="'+target+'">'+name+'</button>';
const home=()=>'<h1>Research workspace</h1><section aria-label="Shelves">'+Array.from({length:28},(_,i)=>button('Shelf '+String(i+1).padStart(2,'0'),'library','Shared library')).join('')+'</section>'+button('Search','search','Search records')+button('Load reports','loading','Reports')+button('Usage guide','guide','Usage guide')+button('Delete workspace','delete','Deleted');
const screens={
 library:()=>'<h2>Shared library</h2><section aria-label="Alpha record"><h3>Alpha</h3>'+button('Open','alpha','Record details','The result identifies Record Alpha.')+'</section><section aria-label="Beta record"><h3>Beta</h3>'+button('Open','beta','Record details','The result identifies Record Beta.')+'</section>'+button('Advanced','advanced','Advanced chooser')+button('Close','home','Research workspace'),
 alpha:()=>'<h2>Record details</h2><p>Record Alpha</p>'+button('Back','library','Shared library'),
 beta:()=>'<h2>Record details</h2><p>Record Beta</p>'+button('Back','library','Shared library'),
 advanced:()=>'<h2>Advanced chooser</h2>'+button('Preview','preview','Export preview')+button('Back','library','Shared library'),
 preview:()=>'<h2>Export preview</h2>'+button('Back','advanced','Advanced chooser'),
 search:()=>'<h2>Search records</h2><label>Query <input aria-label="Query" aria-description="Editing keeps the heading Search records." value="'+query+'"></label>'+button('Apply','results','Search results')+button('Cancel','home','Research workspace'),
 results:()=>'<h2>Search results</h2><p>'+(query ? 'Matching Alpha' : 'All records')+'</p>'+button('Back','search','Search records'),
 loading:()=>'<h2>Loading reports</h2><p aria-busy="true">Waiting for report service</p>',
 reports:()=>'<h2>Reports</h2>'+button('Open summary','summary','Report summary')+button('Back','home','Research workspace'),
 summary:()=>'<h2>Report summary</h2><p>Ready for review</p>'+button('Back','reports','Reports'),
 guide:()=>'<h2>Usage guide</h2><p>'+('Reference material about workspace operations. '.repeat(60))+'</p><p>Usage rules: Continue opens the heading Receipt verified and displays Received via support.</p><button aria-description="Read the Usage rules in the full page text to find the destination heading and required receipt text." data-target="receipt">Continue</button>'+button('Back','home','Research workspace'),
 receipt:()=>'<h2>Receipt verified</h2><p>Received via support</p>'+button('Back','home','Research workspace'),
};
function show(screen){
 document.querySelectorAll('dialog').forEach(d=>d.remove());
 if(screen==='home'){query='';main.innerHTML=home();return;}
 main.innerHTML=home();
 const chain=screen==='preview'?['library','advanced','preview']:screen==='advanced'?['library','advanced']:[screen];
 for(const key of chain){const d=document.createElement('dialog');d.innerHTML=screens[key]();document.body.append(d);d.showModal();}
 if(screen==='loading')setTimeout(()=>show('reports'),240);
}
document.addEventListener('input',event=>{if(event.target.matches('input'))query=event.target.value});
document.addEventListener('click',event=>{const b=event.target.closest('button');if(!b)return;let target=b.dataset.target;if(${JSON.stringify(broken)}&&b.textContent==='Shelf 28')return;if(${JSON.stringify(broken)}&&target==='beta')target='alpha';show(target)});
show('home');
})();</script></html>`
}

export function historyFixtureHtml(): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>Session</title><main></main>
<script>(()=>{let armed=false;window.explorationContext=()=>JSON.stringify({armed});
const main=document.querySelector('main');
const home=()=>{main.innerHTML='<h1>Session</h1><button aria-description="Arms the session and retains the heading Session." data-action="prepare">Prepare</button><button aria-description="Opens heading Ready after Prepare, otherwise heading Not ready. Use the journey to determine which." data-action="continue">Continue</button>'};
document.addEventListener('click',event=>{const action=event.target.dataset.action;if(action==='prepare'){armed=true;home()}else if(action==='continue'){main.innerHTML='<h1>'+(armed?'Ready':'Not ready')+'</h1><button aria-description="Resets the session and returns to heading Session." data-action="reset">Reset</button>'}else if(action==='reset'){armed=false;home()}});home()})();</script></html>`
}
