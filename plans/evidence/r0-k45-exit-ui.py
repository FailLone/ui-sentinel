import pathlib,json,hashlib,datetime,sys
p=pathlib.Path(sys.argv[1]).resolve()
def read(f):return json.loads((p/f).read_text())
def sha(x):return hashlib.sha256(x).hexdigest()
def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
audit=read('independent-archive-audit.json');summary=read('summary.json');manifest=read('manifest.json');assert audit['archiveVerified'] and summary['passed']
for n,row in enumerate(summary['rows'],1):
 r=read(f'row-{n}/report.json');ev=r['events'];f=[e for e in ev if e['type']=='finish:accepted'][-1];t=[e for e in ev if e['type']=='run:completed'][-1];proof=f['payload']['inspectionProof']
 assert r['persistence']['status']=='verified' and not r['persistence']['issues'] and r['uiScan']['proofVerified']
 assert all(e['seq']==i and e['runId']==r['runId'] for i,e in enumerate(ev))
 assert t['seq']>f['seq'] and all(t['payload'][k]==r[k] for k in ['status','stopReason','businessResult'])
 assert proof==r['uiScan']['proof'] and sha(canonical({k:v for k,v in proof.items() if k!='hash'}))==proof['hash']
 assert not any(e['type'] in ['execution:stopped','run:cancelled','run:cancel-requested','action:failed'] for e in ev)
 assert not any(e['type'].startswith('scope:') and e['seq']>f['seq'] for e in ev)
 if row['sampleId']=='boundary-diagnostic':
  assert r['status']==r['stopReason']=='blocked' and r['businessResult']=='not-applicable'
  assert proof['version']=='inspection-proof-3' and proof['claim']=='observed-blocker' and proof['blockerEvidence']
  for ref in proof['blockerEvidence']:
   e=next(e for e in ev if e['id']==ref['eventId']); assert e['seq']<f['seq'] and sha(canonical(e))==ref['digest']; assert e['type']=='network:decision' and e['payload']['allow'] is False and e['payload']['reasonCode']=='unsupported-data-method' and e['payload']['method']=='POST'; assert all(e['payload'].get(k) for k in ['requestId','policyRevision','url'])
  assert any(e['type']=='execution:intervention' and e['seq']<f['seq'] for e in ev)
  assert not r['findings'] and all(q['method'] in ['GET','HEAD'] for q in read(f'row-{n}/page-requests.json'))
 else:
  assert r['status']=='completed' and r['stopReason']=='goal-reached' and r['businessResult']=='not-applicable';assert not audit['results'][n-1]['selectedUnresolved']
  if row['sampleId'] in ['healthy-catalog','overlay-healthy','dom-healthy']:assert audit['results'][n-1]['supportedFindings']==0
  else:
   key='foreground-control-covered' if row['sampleId']=='overlay-defect' else 'sort-ignores-selection';a=read(f'row-{n}/replay.json');c=read(f'row-{n}/control-replay.json');assert key in a['reproducedFindingKeys'] and not c['reproducedFindingKeys'];field='filterWorks' if row['sampleId']=='overlay-defect' else 'nameSortWorks';assert not a[field] and c[field]
files=['summary.json','manifest.json','independent-archive-audit.json']+[str(f.relative_to(p)) for f in p.glob('row-*/*.json')]
out={'stage':'K4-1' if summary['mode']=='diagnostic' else 'K4-2','candidate':manifest['commit'],'reviewedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reviewer':'R0 Agent, evidence review separate from implementation self-test; no claim of new separate-Agent review','evidenceDirectory':str(p),'method':['Independent Python SQLite/artifact/event/proof audit without production imports','Defect and healthy replay observations compared; visual inspection, when performed, is documented separately','Blocker event digest, owner, pre-finish sequence, terminal equality and clean history independently asserted'],'rows':audit['results'],'passed':True,'acceptedForNextStage':True,'r0Accepted':False,'spending':summary['spending'],'evidenceHashes':{f:sha((p/f).read_bytes()) for f in files}}
raw=json.dumps(out,ensure_ascii=False,indent=2)+'\n';(p/'independent-exit-review.json').write_text(raw);print('Independent exit passed:',p.name)
