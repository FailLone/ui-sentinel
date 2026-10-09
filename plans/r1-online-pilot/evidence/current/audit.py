import json, pathlib, hashlib, subprocess, datetime, shutil
R=pathlib.Path.cwd(); A=R/'artifacts/r1-online-pilot/closeout-current'; S=A/'integration-smoke'; T=pathlib.Path('/Users/xietian/.codex/worktrees/r1-recovery/ui-sentinel')
sha=lambda b:hashlib.sha256(b).hexdigest()
git=lambda *a:subprocess.check_output(['git',*a],cwd=R).decode().strip()
def info(p):
 b=p.read_bytes(); return {'path':str(p),'bytes':len(b),'sha256':sha(b)}
old=json.loads((R/'plans/r1-online-pilot/diagnosis-400/evidence/preservation-verification.json').read_text())
preserved=[]
for e in old['verifiedUnchangedFiles']:
 p=pathlib.Path(e['path']); assert sha(p.read_bytes())==e['sha256'],str(p); preserved.append({**e,'unchanged':True})
main='da7adc873ee2143843b7dbfc828551285b1f43b0'; source=git('rev-parse','HEAD'); prev='8d187a6'
mainFiles=git('diff','--name-only','60c315a04e30b84356381763e33dd976a3ace836',main).splitlines()
mainPreserved=[]
for name in mainFiles:
 if name in ['src/execution/executor.ts','package.json']:continue
 b=subprocess.check_output(['git','show',main+':'+name],cwd=R)
 assert (R/name).read_bytes()==b,name
 mainPreserved.append({'path':name,'sha256':sha(b)})
r=json.loads((S/'requests.jsonl').read_text().splitlines()[0]);b=r['body']
t=next(t for t in b['tools'] if t['function']['name']=='exploration_update')['function']['parameters']
span=next(x for x in t['properties']['sourceCandidates']['anyOf'] if x['type']=='array')['items']['properties']['sourceSpan']
def positional(o):
 if isinstance(o,dict):return isinstance(o.get('items'),list) or any(positional(v) for v in o.values())
 if isinstance(o,list):return any(map(positional,o))
 return False
assert not positional(b['tools']); assert span['items']['type']=='integer'; assert len(b['tools'])==16
original=json.loads((R/'evaluation/support/fixtures/r1-http400/request.json').read_text())
if 'body' in original:original=original['body']
params={k:v for k,v in b.items() if k not in ['messages','tools']}
assert params=={k:v for k,v in original.items() if k not in ['messages','tools']}
rows=json.loads((S/'results.json').read_text())
for r in rows:
 e=json.loads((S/r['row']/'evaluation.json').read_text());assert e['persistenceVerified'] and not e['falseSuccess'] and not e['repeatedTargetDispatches']
 report=json.loads((S/r['row']/'report.json').read_text());r['ruleObservationEvents']=sum(e['type']=='ui-rules:observed' for e in report['events']);assert r['ruleObservationEvents']>0
 r['evaluation']=e
risk=pathlib.Path('/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-online-claims/continued-0ddb03d5250db453759b72ee.claim')
assert not risk.exists();assert not (T/'data/r1-recovery/draft-rejection-probe').exists(); assert not (T/'data/r1-recovery/authorized-batch').exists()
assert 'online-authorization-required' in (A/'draft-rejection.log').read_text()
assert subprocess.check_output(['git','status','--porcelain'],cwd=T).decode().strip()==''
shutil.copy2(T/'data/r1-recovery/readiness.json',A/'readiness.json')
local=[info(p) for p in sorted(A.rglob('*')) if p.is_file() and p.name not in ['audit.json'] and not any(x in p.name for x in ['.db','.mjs','.map'])]
runtime=[info(p) for p in sorted((T/'data/r1-recovery').rglob('*')) if p.is_file()]
summary={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha':source,'mainSha':main,'mergeParents':git('show','-s','--format=%P','e3cfafebb3d9f795fae808973bdafaad427b05b3').split(),'scope':'pre-authorization engineering and free validation; R1 stage not accepted','realInferenceRequestsThisTurn':0,'externalMessages':0,'claimsCreated':0,'originalEvidencePreserved':preserved,'mainFilesPreservedByteForByte':mainPreserved,'mainConflict':'executor imports only; retained both experimental host and ui-rule observer','requestCompatibility':{'source':info(S/'requests.jsonl'),'tools':16,'positionalItemsRemaining':False,'topLevelParametersUnchanged':params,'sourceSpan':span,'providerAcceptance':'unverified; normalization is a compatibility candidate, not confirmed root cause'},'freeRows':rows,'tests':{'targeted':{'source':'8d187a6','passed':108,'files':4},'mainIntegration':{'source':'e3cfafebb3d9f795fae808973bdafaad427b05b3','passed':2,'files':1},'portableContinuation':{'source':source,'passed':5,'recheckOfExistingCases':True},'initialIssues':'Old-price contention test and injected I/O type failed first run; fixed and rechecked; logs retained'},'spending':{'thisTurnNewActualUsd':0,'oldOnlineKnownActualUsd':0,'oldOnlineUnknownReservedUsd':0.053,'oldOnlineActualTotalUsd':None,'newOnlineMaxUsd':4.554,'combinedOnlineAccountedLimitUsd':4.607,'priorSeparateRealFrameActualUsd':0.000250824,'includingPriorFrameAccountedLimitUsd':4.607250824,'accountedNotFinalBill':True},'preparedRuntime':str(T),'runtimeClean':True,'riskClaimAbsent':True,'draftRejectedBeforeOutput':True,'localFiles':local,'runtimeFiles':runtime}
(A/'audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'originalFilesPreserved':len(preserved),'mainFilesPreserved':len(mainPreserved),'browserRows':len(rows),'runtimeClean':True,'riskClaimAbsent':True}))
