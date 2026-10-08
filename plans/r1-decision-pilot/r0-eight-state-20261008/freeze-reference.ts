/** One-off material mapping; no execution, model or historical evaluation reads. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { parseExplorationInput } from '../../../src/agent/decisions/exploration/contracts.ts'
import { exportSchema } from '../../../scripts/r1-decision-pilot/pilot.ts'
const root = 'plans/r1-decision-pilot/r0-eight-state-20261008'
const json = (p: string) => JSON.parse(readFileSync(join(root,p),'utf8'))
const put = (p: string,v: unknown) => writeFileSync(join(root,p),JSON.stringify(v,null,2)+'\n',{flag:'wx'})
const sha = (s: string|Buffer) => createHash('sha256').update(s).digest('hex')
const index = json('source-public/index.json')
const states = index.states.map((entry: any) => {
 const input = json(`source-public/inputs/${entry.stateId}.json`)
 const p = json(`source-public/public/${entry.stateId}.json`)
 const valid = parseExplorationInput(input)
 if (!valid.ok) throw new Error(`${entry.stateId}:${valid.detail}`)
 return {id:entry.stateId,provenance:{sourceSha:index.sourceCandidate,artifactSha256:entry.publicSha256,
   stateRef:`source-public/public/${entry.stateId}.json`,decisionCutoff:`seq:${p.eventCutoffSeq}@${p.at}`},
 input,criticalInformationMissing:true,
 facts:input.candidates.map((c:any) => {
  const ctx=JSON.parse(c.context)
  // Scope is offline advice eligibility, explicitly NOT live permission.
  // Cost is effort, not USD. Missing action-time/cost bounds remain null.
  return {candidateId:c.id,obligationId:c.id,obligation:ctx.status==='verified'?'completed':ctx.status==='pending'?'pending':'unknown',
   required:ctx.selected,permission:'unknown',preconditions:'unknown',
   action:c.allowedActions.includes('click')?'click':'inspect',estimatedMs:null,estimatedActionCostUsd:null,
   lastCheckedState:null,recheckReason:null,evidenceRef:`source-public/public/${entry.stateId}.json`}
 })}
})
const data=exportSchema.parse({version:'r1-decision-pilot-input-1',kind:'r0-real-export',states})
put('mapped-public.json',data)
const cases = states.map((s:any) => ({id:s.id,historicalChoice:{kind:'unmapped'},
 acceptableChoices:[{kind:'handoff',reason:'insufficient-information'}],advancesObligation:[],unjustifiedRepeat:[],
 missingPrerequisite:true,handoffRequired:true,acceptedHandoffReasons:['insufficient-information'],
 rationale:'Development-only admission reference: live binding permission/preconditions and per-action time/USD bounds are missing. Handoff only establishes safe abstention, not task progress or superiority over the historical Agent.'}))
const ref={version:'r1-decision-pilot-labels-1',inputSha256:sha(JSON.stringify(data)),review:'development-only',
 reviewer:'Codex primary agent; no human or independent reviewer',frozenAt:new Date().toISOString(),cases}
put('reference.frozen.json',ref)
const bounds=states.map((s:any)=>{
 const p=json(`source-public/public/${s.id}.json`)
 const cs=s.input.candidates.map((c:any)=>({...c,ctx:JSON.parse(c.context)}))
 return {id:s.id,currentCandidates:cs.length,
  pendingSelected:cs.filter((c:any)=>c.ctx.selected&&c.ctx.status==='pending').map((c:any)=>({id:c.id,text:c.text,nativeAction:c.ctx.nativeAction,ref:c.ctx.ref})),
  clickObligationsBeforeAdmission:cs.filter((c:any)=>c.ctx.selected&&c.ctx.status==='pending'&&c.ctx.nativeAction==='click').map((c:any)=>({id:c.id,text:c.text,ref:c.ctx.ref,hitRelations:c.ctx.observedHitTests.relations})),
  fillObligationsOutsideContract:cs.filter((c:any)=>c.ctx.selected&&c.ctx.status==='pending'&&c.ctx.nativeAction==='fill').map((c:any)=>c.id),
  completedNotReopened:cs.filter((c:any)=>c.ctx.status==='verified').map((c:any)=>c.id),
  unselected:cs.filter((c:any)=>!c.ctx.selected).map((c:any)=>c.id),
  selectedUnfinishedNotCandidate:p.registeredChecks.filter((c:any)=>c.selected&&c.status!=='verified'&&!cs.some((v:any)=>v.id===c.itemId)),
  missing:['live-binding-authorization','action-preconditions','action-time-bound','action-usd-bound'],
  inspectionCoverage:'No new bounded read objective or expected information delta supplied. Existing reads do not justify generic inspect as fill replacement.',
  diagnosticOnly:true}
})
put('coverage-before-baseline.json',bounds)
put('freeze.json',{at:ref.frozenAt,labelsSha256:sha(readFileSync(join(root,'reference.frozen.json'))),mappedPublicSha256:sha(readFileSync(join(root,'mapped-public.json'))),
 archiveSha256:json('source-receipt.json').archiveSha256,sourceBaseline:'0b4755798c557777b3c85b1ef959792156baa7b5',
 historicalEvaluationOpened:false,baselineExecuted:false,realJevOutputs:0,humanReferenceStatus:'not supplied; development reference frozen only',
 rules:['Do not equate safe handoff with obligation progress.','Do not map fill, broad selector reads or missing original choices to candidate inspect.','Do not treat prefix or observation counter changes alone as relevant state changes.','Only count exact current candidate ref plus click as direct mapped historical choice; multi-call sets preserved.','Metric denominators separate admission consistency, candidate selection, original-choice mapping, and real executed progress.']})
console.log(JSON.stringify({states:states.length,labelsFrozen:ref.frozenAt,baselineExecuted:false,historicalEvaluationOpened:false,humanReview:false}))
