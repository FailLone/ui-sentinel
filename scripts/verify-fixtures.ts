import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp,rm,mkdir,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
async function port(){const s=createServer();await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const p=(s.address() as {port:number}).port;await new Promise<void>(r=>s.close(()=>r()));return p}
const dir=await mkdtemp(join(tmpdir(),'sentinel-fixtures-'))
const env={...process.env,PORT:String(await port()),ARENA_PORT:String(await port()),ARENA_API_PORT:String(await port()),ARENA_CONTROL_PORT:String(await port()),ARENA_CONTROL_TOKEN:randomBytes(32).toString('hex'),DATABASE_URL:`file:${join(dir,'runs.db')}`,AGENT_MODEL:'',VISION_MODEL:'',ARENA_STATIC:'1'}
Object.assign(process.env,env)
const children=[spawn(process.execPath,['dist/server/index.js'],{env,stdio:['ignore','pipe','pipe']}),spawn(process.execPath,['dist/arena/index.js'],{env,stdio:['ignore','pipe','pipe']})]
let logs='';for(const c of children){c.stdout.on('data',s=>logs+=String(s));c.stderr.on('data',s=>logs+=String(s))}
try{
  const base=`http://127.0.0.1:${env.PORT}`,arena=`http://localhost:${env.ARENA_PORT}`
  let ready=false
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok&&(await fetch(arena)).ok){ready=true;break}}catch{};await new Promise(r=>setTimeout(r,100))}
  if(!ready)throw new Error('Services did not become ready: '+logs)
  if(!(await fetch(base)).ok)throw new Error('Production workbench missing')
  const deny=await fetch(base+'/api/runs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({goal:'inspect'})})
  if(deny.status!==503)throw new Error('Missing model must fail explicitly')
  const privateResponse=await fetch(`http://127.0.0.1:${env.ARENA_CONTROL_PORT}/__control/state`)
  if(privateResponse.status!==401)throw new Error('Private control must reject unauthenticated access')
  for(const path of ['/__control/state','/src/server/state.ts','/evaluation/private/answers.ts'])if((await fetch(arena+path)).status!==404)throw new Error('Private/source route exposed: '+path)
  const {resetAndVerify}=await import('../evaluation/private/controller.ts')
  const checks=[]
  for(const variant of ['C0','C1','C2','C3','C4','C5'] as const){const result=await resetAndVerify(variant);checks.push({variant,...result});console.log(`${variant}: fixture verified`)}
  await mkdir('data/verification',{recursive:true})
  await writeFile('data/verification/fixtures.json',JSON.stringify({realModel:false,at:new Date().toISOString(),checks},null,2))
  console.log('Production boot, private isolation and all six fixtures passed; this is not an Agent/model evaluation.')
}catch(error){console.error(error);process.exitCode=1}finally{
  for(const c of children)c.kill('SIGTERM')
  await Promise.all(children.map(c=>new Promise<void>(r=>{if(c.exitCode!==null)return r();c.once('exit',()=>r());setTimeout(()=>{c.kill('SIGKILL');r()},2000).unref()})))
  await rm(dir,{recursive:true,force:true})
}
