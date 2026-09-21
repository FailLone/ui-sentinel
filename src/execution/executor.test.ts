import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { createServer } from 'node:http'
import { rm } from 'node:fs/promises'

const harness=vi.hoisted(()=>({handler:null as any,models:0}))
vi.mock('../shared/config.ts',()=>({config:{databaseUrl:':memory:',agentModel:'openai/test-explicit-mock',visionModel:'test',budget:{totalTimeoutMs:20000,maxActions:10,maxModelCalls:10,toolTimeoutMs:15000}},checkModelConfig:()=>({ready:true,missing:[]})}))
vi.mock('@mastra/core/agent',()=>({Agent:class {options:any;constructor(options:any){this.options=options}async generate(prompt:string){harness.models++;await harness.handler(this.options.tools,prompt);return {text:'test model',toolResults:[],usage:{inputTokens:1,outputTokens:1}}}}}))
vi.mock('./vision.ts',()=>({createVisionLocator:()=>({aiLocate:async()=>{throw new Error('vision not used by deterministic fixture')}})}))
import { createRun,getRun,getEvents,getFindings } from './run-manager.ts'
import { startRunExecution,cancelRunExecution,executionBusy,acknowledgeReconciliation } from './executor.ts'
import { initDatabase,getDbClient } from '../storage/database.ts'
import { clearRules, registerRule } from '../rules/engine.ts'

import { overlayBlockingRule } from '../rules/builtin/overlay-blocking.ts'
let url='',writes=0,responseDelay=0
const ids:string[]=[]
const server=createServer((req,res)=>{
  if(req.url==='/purchase'){writes++;res.setHeader('content-type','application/json');setTimeout(()=>res.end(JSON.stringify({success:true,status:'success',orderId:'order-1'})),responseDelay);return}
  if(req.url==='/uncertain'){writes++;res.writeHead(500,{'content-type':'application/json'});res.end('{}');return}
  if(req.url==='/uncertain-page'){res.setHeader('content-type','text/html');res.end(`<button onclick="fetch('/uncertain',{method:'POST'})">Submit</button>`);return}
  if(req.url==='/overlay'){res.setHeader('content-type','text/html');res.end('<button style="position:absolute;left:40px;top:40px;width:200px;height:60px">Pay</button><div style="position:fixed;inset:0;background:#ccc;z-index:100">Campaign</div>');return}
  res.setHeader('content-type','text/html');res.end(`<h1>Store</h1><button onclick="document.querySelector('h1').textContent='Processing...';fetch('/purchase',{method:'POST'}).then(r=>r.json()).then(()=>document.querySelector('h1').textContent='Order Confirmed successfully order-1')">Buy</button>`)
})
beforeAll(async()=>{await initDatabase();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${(server.address() as any).port}`})
afterAll(async()=>{server.close();await Promise.all(ids.map(id=>rm(`data/artifacts/${id}`,{recursive:true,force:true})))})
beforeEach(()=>{clearRules();writes=0;responseDelay=0;harness.models=0})
async function makeRun(){const r=await createRun({goal:'buy',environmentId:'test',entryUrl:url});ids.push(r.id);return r}
const call=(tools:any,name:string,input:any={})=>tools[name].execute(input,{})

describe('executor with deterministic model and real browser (not model evaluation)',()=>{
  it('supplies real DOM, executes schema tools, records evidence and verifies public business outcome',async()=>{
    let phase=0
    harness.handler=async(tools:any,prompt:string)=>{
      const packet=JSON.parse(prompt)
      expect(packet.observation.snapshot.text).toContain(phase?'Confirmed':'Buy')
      if(phase++===0){const button=packet.observation.snapshot.elements.find((e:any)=>e.tag==='button');await call(tools,'page_act',{type:'click',selector:button.selector})}
      else await call(tools,'run_finish',{businessResult:'success',blocked:false,summary:'visible and response agree'})
    }
    const run=await makeRun();await startRunExecution(run.id)
    expect((await getRun(run.id))?.status).toBe('completed')
    expect(writes).toBe(1)
    const events=await getEvents(run.id)
    expect(events.some(e=>e.type==='business:response')).toBe(true)
    expect(events.some(e=>e.type==='response:observed')).toBe(true)
    expect(events.filter(e=>e.type==='page:observed').every(e=>e.evidenceRefs.length===2)).toBe(true)
    expect(new Set(events.map(e=>e.seq)).size).toBe(events.length)
  })
  it('does not dispatch a late action after cancellation while model is pending',async()=>{
    let release!:()=>void,entered!:()=>void
    const ready=new Promise<void>(r=>entered=r),waiting=new Promise<void>(r=>release=r)
    harness.handler=async(tools:any)=>{entered();await waiting;await call(tools,'page_act',{type:'click',selector:'button'})}
    const run=await makeRun(),done=startRunExecution(run.id)
    await ready;expect(await cancelRunExecution(run.id)).toBe(true);release();await done
    expect(writes).toBe(0);expect((await getRun(run.id))?.status).toBe('cancelled')
  })
  it('queues a second run and cancelling it never starts a browser/model',async()=>{
    let release!:()=>void,entered!:()=>void
    const ready=new Promise<void>(r=>entered=r),waiting=new Promise<void>(r=>release=r)
    harness.handler=async(tools:any)=>{entered();await waiting;await call(tools,'run_finish',{businessResult:'unknown',blocked:true,summary:'stopped'})}
    const a=await makeRun(),b=await makeRun(),first=startRunExecution(a.id),second=startRunExecution(b.id)
    await ready;expect(executionBusy()).toBe(true);expect((await getRun(b.id))?.status).toBe('queued')
    await cancelRunExecution(b.id);release();await Promise.all([first,second]);expect(harness.models).toBe(1)
    expect((await getRun(b.id))?.status).toBe('cancelled');expect(executionBusy()).toBe(false)
  })
  it('persists hypothesis/evidence and rejects forged supported evidence',async()=>{
    harness.handler=async(tools:any,prompt:string)=>{
      const packet=JSON.parse(prompt)
      const hyp=await call(tools,'hypotheses_record',{phenomenon:'test observation',basis:'visible UI',verificationPlan:'inspect snapshot'})
      await expect(call(tools,'findings_submit',{hypothesisId:hyp.id,validationStatus:'supported',severity:'info',title:'test',expected:'test',actual:'test',evidenceRefs:['forged.png']})).rejects.toThrow('invalid evidence')
      await call(tools,'findings_submit',{hypothesisId:hyp.id,validationStatus:'candidate',severity:'info',title:'test',expected:'test',actual:'test',evidenceRefs:packet.observation.evidenceRefs})
      await call(tools,'run_finish',{businessResult:'unknown',blocked:true,summary:'test'})
    }
    const run=await makeRun();await startRunExecution(run.id)
    expect((await getFindings(run.id))).toHaveLength(1)
    expect((await getDbClient().execute({sql:'SELECT * FROM hypotheses WHERE run_id=?',args:[run.id]})).rows).toHaveLength(1)
  })
})

it('hard deadline settles even if a model provider ignores cancellation',async()=>{
  harness.handler=async()=>new Promise(()=>{})
  const run=await createRun({goal:'test deadline',environmentId:'test',entryUrl:url,budget:{totalTimeoutMs:600}});ids.push(run.id)
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.status).toBe('timed-out')
  expect((await getRun(run.id))?.usage.modelInputTokens).toBeNull()
  expect(writes).toBe(0)
  expect(executionBusy()).toBe(false)
})

it('preserves an original screenshot plus a DOM-based red annotation for actual interception',async()=>{
  registerRule(overlayBlockingRule)
  harness.handler=async(tools:any)=>call(tools,'run_finish',{businessResult:'unknown',blocked:true,summary:'intercepted'})
  const run=await createRun({goal:'inspect',environmentId:'test',entryUrl:url+'/overlay'});ids.push(run.id)
  await startRunExecution(run.id)
  const findings=await getFindings(run.id)
  expect(findings.some(f=>f.ruleId==='overlay-blocking'&&f.validationStatus==='supported')).toBe(true)
  const artifacts=await getDbClient().execute({sql:'SELECT metadata FROM artifacts WHERE run_id=?',args:[run.id]})
  const annotated=artifacts.rows.map(r=>JSON.parse(String(r.metadata))).find(m=>m.annotation)
  expect(annotated.sourceRef).toBeTruthy()
  expect(annotated.rectangles[0]).toMatchObject({x:40,y:40,width:200,height:60})
})

it('measures real delayed feedback at 0.5 and 12 seconds without any model request',async()=>{
  for(const delay of [500,12000]) {
    responseDelay=delay;let phase=0
    harness.handler=async(tools:any)=>{
      if(phase++===0)await call(tools,'page_act',{type:'click',selector:'button'})
      else await call(tools,'run_finish',{businessResult:'success',blocked:false,summary:'measured fixture'})
    }
    const run=await makeRun();await startRunExecution(run.id)
    expect((await getRun(run.id))?.status).toBe('completed')
    const timing=(await getEvents(run.id)).find(e=>e.type==='response:observed')!.payload
    expect(Number(timing.durationMs)).toBeGreaterThanOrEqual(delay-25)
    expect(Number(timing.durationMs)).toBeLessThan(delay+1000)
    expect(timing.method).toBe('browser-mutation-feedback')
  }
},25000)

it('latches shared resources after an uncertain write until explicit reconciliation',async()=>{
  harness.handler=async(tools:any)=>call(tools,'page_act',{type:'click',selector:'button'})
  const run=await createRun({goal:'inspect',environmentId:'test',entryUrl:url+'/uncertain-page'});ids.push(run.id)
  await startRunExecution(run.id)
  expect((await getRun(run.id))?.stopReason).toBe('reconciliation-required')
  expect(executionBusy()).toBe(true)
  const next=await makeRun();await startRunExecution(next.id)
  expect((await getRun(next.id))?.status).toBe('interrupted')
  expect(writes).toBe(1)
  await acknowledgeReconciliation()
  expect(executionBusy()).toBe(false)
})
