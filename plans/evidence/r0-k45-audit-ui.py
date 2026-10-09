"""Independent archive audit; does not import production report/scorer code or change its verdict."""
import sys, json, pathlib, hashlib, sqlite3
root=pathlib.Path(sys.argv[1]).resolve()
rows=json.loads((root/'rows.json').read_text())
results=[]
for idx,row in enumerate(rows,1):
 p=root/f'row-{idx}'
 if row['status']!='finished':
  results.append({'sample':row['sampleId'],'status':row['status'],'complete':False});continue
 report=json.loads((p/'report.json').read_text());index=json.loads((p/'artifact-index.json').read_text())
 files={};issues=[]
 for a in index:
  q=(p/a['path']).resolve()
  if not q.is_relative_to(p): issues.append('path-escape');continue
  if not q.is_file(): issues.append('missing:'+a['artifactId']);continue
  raw=q.read_bytes();sha=hashlib.sha256(raw).hexdigest()
  if a['runId']!=row['runId'] or sha!=a['sha256'] or len(raw)!=a['bytes']: issues.append('artifact-mismatch:'+a['artifactId'])
  files[a['artifactId']]=q
 db=sqlite3.connect(f'file:{p}/runs.db?mode=ro',uri=True)
 storedArtifacts={a[0]:(a[1],a[2]) for a in db.execute('select id,run_id,type from artifacts where run_id=?',(row['runId'],))}
 for a in index:
  if storedArtifacts.get(a['artifactId'])!=(row['runId'],a['type']): issues.append('artifact-db-type-owner:'+a['artifactId'])
 stored=db.execute('select status,business_result,stop_reason from runs where id=?',(row['runId'],)).fetchone()
 if list(stored or [])!=[report['status'],report['businessResult'],report['stopReason']]: issues.append('terminal-mismatch')
 events=db.execute('select id,type,payload,evidence_refs,seq from run_events where run_id=? order by seq',(row['runId'],)).fetchall()
 for raw,reported in zip(events,report['events']):
  if raw[1]!=reported['type'] or json.loads(raw[2])!=reported['payload'] or json.loads(raw[3])!=reported['evidenceRefs'] or raw[4]!=reported['seq'] or reported['runId']!=row['runId']: issues.append('full-event-mismatch:'+raw[0])
 if [e[0] for e in events]!=[e['id'] for e in report['events']]: issues.append('event-history-mismatch')
 for eid,kind,payload,refs,seq in events:
  refs=json.loads(refs)
  if any(ref not in files for ref in refs): issues.append('unowned-event-ref:'+eid)
  body=json.loads(payload)
  if kind in ('program:measured','interaction:recovered','probe:measured') and body.get('receiptRef') and body.get('sha256'):
   q=files.get(body['receiptRef'])
   if not q or hashlib.sha256(q.read_bytes()).hexdigest()!=body['sha256']: issues.append('measurement-hash:'+eid)
  if kind=='probe:measured':
   q=files.get(body.get('receiptRef'))
   expected={k:v for k,v in body.items() if k not in ('receiptRef','sha256')}
   if not q or json.loads(q.read_text())!=expected: issues.append('probe-receipt-payload:'+eid)
   if body.get('runId')!=row['runId'] or storedArtifacts.get(body.get('receiptRef'))!=(row['runId'],'probe-measurement'): issues.append('probe-owner-type:'+eid)
   for ref in body.get('evidenceRefs',[]):
    shot=files.get(ref)
    if not shot or hashlib.sha256(shot.read_bytes()).hexdigest()!=body.get('evidenceHashes',{}).get(ref) or storedArtifacts.get(ref)!=(row['runId'],'screenshot'): issues.append('probe-screenshot-seal:'+eid)
 calls=json.loads((p/'page-requests.json').read_text())
 writes=[r for r in calls if r.get('method') not in ('GET','HEAD')]
 if writes: issues.append('fixture-write-reached-server')
 proof=report['uiScan'].get('proof')
 if proof:
  proof=dict(proof);claimed=proof.pop('hash',None)
  if hashlib.sha256(json.dumps(proof,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()!=claimed: issues.append('proof-hash-mismatch')
 elif report['status']=='completed': issues.append('completed-without-proof')
 projected={}
 for eid,kind,payload,refs,seq in events:
  e=json.loads(payload)
  if kind=='scope:item-created': projected[e['itemId']]=e
  elif kind=='scope:item-updated' and e.get('itemId') in projected: projected[e['itemId']].update(e)
 scope=report['uiScan']['inspection']
 for item in scope['items']:
  source=projected.get(item['itemId'],{})
  if any(source.get(k)!=item.get(k) for k in ('status','selected','url','basis','evidenceRefs','reasonCode')): issues.append('scope-projection:'+item['itemId'])
 selected=[i for i in scope['items'] if i['selected']]
 unresolved=[i['itemId'] for i in selected if i['status'] in ('pending','unverified')]
 if report['status']=='completed' and unresolved: issues.append('completed-with-selected-gap')
 for finding in report['findings']:
  if finding['runId']!=row['runId'] or any(r not in files for r in finding['evidenceRefs']):issues.append('finding-evidence-ownership')
 results.append({'sample':row['sampleId'],'runId':row['runId'],'terminal':stored,'artifactCount':len(files),'eventCount':len(events),'selectedUnresolved':unresolved,'hypothesisStatuses':[h['status'] for h in report['hypotheses']], 'supportedFindings':len([f for f in report['findings'] if f['validationStatus']=='supported']), 'issues':sorted(set(issues)),'archiveVerified':not issues,'complete':report['status']=='completed'})
 db.close()
out={'kind':'independent-archive-audit','method':'Read raw SQLite, every artifact byte, saved events and fixture request log; no production imports. This confirms archive integrity, not autonomous quality by itself.','batch':root.name,'results':results,'archiveVerified':all(r.get('archiveVerified') for r in results),'allComplete':all(r['complete'] for r in results)}
(root/'independent-archive-audit.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in out.items() if k!='results'},ensure_ascii=False))
for r in results:print(r['sample'],r.get('archiveVerified'),r.get('complete'),r.get('issues'))
