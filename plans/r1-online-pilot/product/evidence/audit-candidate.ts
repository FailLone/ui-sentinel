import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {evaluateProduct} from '../../../scripts/r1-product/evaluate.ts';
import {CASES} from '../../../scripts/r1-product/manifest.ts';
const base='data/r1-product/2026-10-09T10-44-06-535Z';
const late='data/r1-product/2026-10-09T10-50-44-484Z';
const rows=CASES.map(([caseId,scenario])=>{
 const dir=['view-context-healthy','boundary-input'].includes(scenario)?late:base;
 const report=JSON.parse(readFileSync(`${dir}/${scenario}-report.json`,'utf8'));
 const refs=JSON.parse(readFileSync(`${dir}/${scenario}-evidence-index.json`,'utf8'));
 const readable=new Set<string>(refs.filter((e:any)=>{const p=`${dir}/evidence/${scenario}/${e.id}`;if(!existsSync(p))throw Error(p); const b=readFileSync(p);if(b.length!==e.bytes||createHash('sha256').update(b).digest('hex')!==e.sha256)throw Error('hash:'+p);return true}).map((e:any)=>e.id));
 const evaluation=evaluateProduct(report,scenario,readable);
 if(!evaluation.passed)throw Error(JSON.stringify({caseId,scenario,evaluation}));
 return {caseId,scenario,report:`${dir}/${scenario}-report.json`,artifacts:refs.length,status:report.status,actions:report.usage.actions,checks:report.uiScan.checkCounts,evaluation};
});
writeFileSync('data/r1-product/checks/offline-candidate-evaluation.json',JSON.stringify({sourceSha:'ddf1dd943f238dc71c2d3e4e6ef327e1ba44c2db',realCalls:0,passed:true,rows},null,2)+'\n');
console.log(JSON.stringify({passed:rows.length,totalArtifacts:rows.reduce((s,r)=>s+r.artifacts,0)}));
