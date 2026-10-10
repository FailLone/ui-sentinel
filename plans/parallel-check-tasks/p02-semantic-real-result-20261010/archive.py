import pathlib,json,hashlib,shutil,sqlite3,datetime
root=pathlib.Path.cwd();base=root/'plans/parallel-check-tasks/p02-semantic-real-result-20261010';src=root/'data/parallel-popup-real/approved-p02-semantic-purpose-01'
assert (base/'execution-status.json').exists(),'batch still running'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(name,value):(base/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
shutil.copytree(src,base/'evidence')
claim=root/'data/parallel-popup-real/.claims/bce6785d7cfb8b9fb877d4003d159110d3e3c603a33fd50a7605cfbc0dae08d6.json'
if claim.exists():shutil.copyfile(claim,base/'approval-claim.json')
result=json.loads((src/'result.json').read_text());reports=[json.loads(p.read_text()) for p in src.glob('P02-*.json') if 'runId' in json.loads(p.read_text())]
index=[];runs=[]
db=sqlite3.connect(src/'runs.db')
for d in reports:
 runid=d['runId'];target=base/'evidence/artifacts'/runid;shutil.copytree(root/'data/artifacts'/runid,target)
 for a in d['artifacts']:
  p=target/a['id'];index.append({'runId':runid,'id':a['id'],'type':a['type'],'path':str(p.relative_to(base)),'sha256':sha(p),'bytes':p.stat().st_size,'metadata':a.get('metadata')})
 spec=json.loads(db.execute('SELECT spec FROM runs WHERE id=?',(runid,)).fetchone()[0]);ev=d['events'];pc=d.get('uiScan',{}).get('popupCheck');decisions=[]
 for e in ev:
  if e['type']!='popup:decision':continue
  packet=json.loads((target/e['payload']['packetRef']).read_text());ad=e['payload'].get('adoption');decisions.append({'seq':e['seq'],'stage':e['payload']['stage'],'packet':packet,'adoption':ad,'proposal':e['payload']['proposal']})
 geometries=[]
 for e in ev:
  if e['type'] not in ['popup:candidate-geometry','popup:measurement']:continue
  receipt=json.loads((target/e['payload']['receiptRef']).read_text());geometries.append({'type':e['type'],'seq':e['seq'],'event':e['payload'],'receipt':receipt})
 runs.append({'runId':runid,'viewport':spec.get('viewport'),'status':d['status'],'coverage':d.get('uiScan',{}).get('inspection',{}).get('coverage'),'scopeCounts':d.get('uiScan',{}).get('inspection',{}).get('counts'),'gaps':d.get('uiScan',{}).get('inspection',{}).get('gaps'),'persistence':d.get('persistence'),'usage':d.get('usage'),'popup':pc,'decisions':decisions,'geometry':geometries,'actionEvents':[e for e in ev if e['type'] in ['action:executing','action:completed','action:denied']],'resourceEvents':[e for e in ev if e['type'].startswith('run:delegated-resource')],'findings':d.get('findings')})
db.close()
account=sqlite3.connect(src/'account/campaign.db');counts={n:account.execute('SELECT count(*) FROM '+n).fetchone()[0] for n in ['campaign_lease','ledger_stop_events']};account.close()
pre=json.loads((base/'preflight.json').read_text());changed=[p for p,h in pre['oldArchiveHashes'].items() if sha(root/p)!=h];assert not changed,changed
write('artifact-index.json',index)
write('summary.json',{'executedOnce':True,'execution':json.loads((base/'execution-status.json').read_text()),'free':result['free'],'problem':result.get('problem'),'stop':result['batch']['stopped'],'spending':result['spending'],'requests':result['requests'],'mainRequests':sum(r['provider']=='Wafer' for r in result['requests']),'jevRequests':sum(r['provider']=='TypeSafe' for r in result['requests']),'accountRows':counts,'feeProofMatched':json.loads((src/'P02-fee-proof.json').read_text())['matched'] if (src/'P02-fee-proof.json').exists() else None,'artifactCount':len(index),'payloadCount':len(list((base/'evidence/artifacts').rglob('*.*'))),'oldArchiveChanges':changed,'runs':runs})
print(json.dumps({'requests':len(result['requests']),'spending':result['spending'],'stop':result['batch']['stopped'],'accountRows':counts,'artifacts':len(index),'runs':[{'runId':r['runId'],'viewport':r['viewport'],'status':r['status'],'popup':r['popup']['verdict'] if r['popup'] else None} for r in runs]},ensure_ascii=False,indent=2))
