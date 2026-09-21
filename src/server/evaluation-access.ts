import { Hono } from 'hono'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { getDbClient } from '../storage/database.ts'
import { getAllRules } from '../rules/engine.ts'
let lease:string|null=null
export function evaluationAuthorized(authorization?:string) {
  const token=process.env.ARENA_CONTROL_TOKEN
  if(!token||!authorization)return false
  const a=Buffer.from(authorization),b=Buffer.from(`Bearer ${token}`)
  return a.length===b.length&&timingSafeEqual(a,b)
}
export function isEvaluationActive(){ return lease !== null }
export function canCreateRun(authorization?:string) { return !lease || evaluationAuthorized(authorization) }
export const evaluationRoutes=new Hono()
evaluationRoutes.use('/api/evaluation/*',async(c,next)=>{if(!evaluationAuthorized(c.req.header('authorization')))return c.json({error:'unauthorized'},401);await next()})
evaluationRoutes.post('/api/evaluation/lease',async c=>withAdmission(async()=>{
  if(lease)return c.json({error:'evaluation already active'},409)
  const result=await getDbClient().execute("SELECT id FROM runs WHERE status IN ('running','queued') OR stop_reason='reconciliation-required'")
  if(result.rows.length)return c.json({error:'execution or reconciliation pending'},409)
  lease=randomUUID();return c.json({lease,rules:getAllRules().map(r=>({id:r.id,revision:r.revision,category:r.category}))})
}))
evaluationRoutes.post('/api/evaluation/release',async c=>{
  const body=await c.req.json<{lease:string}>()
  if(body.lease!==lease)return c.json({error:'lease mismatch'},409)
  lease=null;return c.json({released:true})
})

evaluationRoutes.post('/api/evaluation/reconcile',async c=>{
  const body=await c.req.json<{reason?:string;verified?:boolean}>()
  if(body.verified!==true||!body.reason?.trim())return c.json({error:'Explicit independent verification and reason required'},400)
  const { acknowledgeReconciliation }=await import('../execution/executor.ts')
  const { appendEvent }=await import('../execution/run-manager.ts')
  const rows=await getDbClient().execute("SELECT id FROM runs WHERE stop_reason='reconciliation-required'")
  await acknowledgeReconciliation()
  for(const row of rows.rows)await appendEvent(String(row.id),'run:reconciled',{reason:body.reason,verifiedBy:'private-controller'})
  return c.json({acknowledged:true})
})

let admissionTail:Promise<unknown>=Promise.resolve()
export function withAdmission<T>(operation:()=>Promise<T>):Promise<T>{const result=admissionTail.then(operation);admissionTail=result.catch(()=>{});return result}
