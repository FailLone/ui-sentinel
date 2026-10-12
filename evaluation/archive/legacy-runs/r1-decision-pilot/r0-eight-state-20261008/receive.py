"""One-off source audit; no export regeneration, evaluation reads or execution."""
import hashlib, importlib.util, json, pathlib, sqlite3, sys, tarfile
from datetime import datetime, timezone
root=pathlib.Path(sys.argv[1]).resolve()
out=pathlib.Path(__file__).resolve().parent
archive=root/'data/r0-request-stop-free/public-state-package.tar.gz'
sha=lambda raw:hashlib.sha256(raw).hexdigest()
compact=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':')).encode()
base='plans/evidence/r0-public-decision-states/'
expected={base+'README.md',base+'index.json','plans/evidence/r0-request-stop-state-selection.json'}|{base+f'{kind}/S{i:02}.json' for kind in ('inputs','public') for i in range(1,9)}
with tarfile.open(archive) as tar:
 members=tar.getmembers()
 assert len(members)==len(expected) and {m.name for m in members}==expected
 assert all(m.isfile() and m.size < 2000000 for m in members)
 files={m.name:tar.extractfile(m).read() for m in members}
index=json.loads(files[base+'index.json']);selection=json.loads(files['plans/evidence/r0-request-stop-state-selection.json'])
assert sha(files['plans/evidence/r0-request-stop-state-selection.json'])==index['selectionSha256']
assert index['sourceCandidate']==selection['sourceCandidate']
assert sha(pathlib.Path('src/agent/decisions/exploration/contracts.ts').read_bytes())==index['r1Contract']['sha256']
assert sha((root/index['ledgerSource']).read_bytes())==index['ledgerSourceSha256']
spec=importlib.util.spec_from_file_location('source_exporter',root/'scripts/validation/export-r0-public-states.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
results=[]
assert len(index['states'])==len(selection['states'])==8
for row,point in zip(index['states'],selection['states']):
 p=json.loads(files[row['publicPath']]);x=json.loads(files[row['inputPath']])
 assert row['stateId']==point['stateId']==p['stateId']==x['requestId']
 assert sha(files[row['publicPath']])==row['publicSha256']
 assert sha(files[row['inputPath']])==row['inputSha256']
 assert p['eventCutoffSeq']==point['eventCutoffSeq']==row['eventCutoffSeq']
 source=root/p['source']['database']; assert sha(source.read_bytes())==p['source']['databaseSha256']
 with sqlite3.connect(f'file:{source}?mode=ro',uri=True) as db:
  rows=db.execute('SELECT id,seq,type,timestamp,payload,evidence_refs FROM run_events WHERE run_id=? AND seq<=? ORDER BY seq',(row['runId'],row['eventCutoffSeq'])).fetchall()
 assert sha(compact(rows))==row['sourcePrefixSha256']==p['source']['sourcePrefixSha256']==point['sourcePrefixSha256']
 assert rows[-1][0]==point['cutoffEventId'] and rows[-1][3]==point['at']==p['at']
 assert all(o['eventSeq']<=row['eventCutoffSeq'] for o in p['operations'])
 assert all(o['seq']<=row['eventCutoffSeq'] and o['timestamp']<=p['at'] for o in p['actionDispatches'])
 snapshot=source.parent/'artifacts'/p['source']['snapshotRef']
 assert sha(snapshot.read_bytes())==p['source']['snapshotSha256']
 assert p['page']['observedAt']<=p['at'] and p['source']['snapshotEventSeq']<=row['eventCutoffSeq']
 assert module.money(p['at'])==p['financialBudget']
 assert p['budget']==row['remainingBudget'] and all(x['budget'][k]==v for k,v in p['budget'].items())
 assert x['budget']['remainingMs']==p['remainingTimeBoundsMs']['lower']
 for c in x['candidates']:
  context=json.loads(c['context']);match=next(q for q in p['registeredChecks'] if q['itemId']==c['id'])
  assert context['status']==match['status'] and context['selected']==match['selected']
  assert context['remainingBudget']==p['budget']
 results.append(dict(stateId=row['stateId'],eventCutoffSeq=row['eventCutoffSeq'],cutoff=point['at'],sourcePrefixSha256=row['sourcePrefixSha256'],databaseSha256=p['source']['databaseSha256'],snapshotSha256=p['source']['snapshotSha256'],prefixRows=len(rows),verified=True))
for name,raw in files.items():
 rel=name.removeprefix(base) if name.startswith(base) else 'selection.json'
 path=out/'source-public'/rel;path.parent.mkdir(parents=True,exist_ok=True)
 path.write_bytes(raw)
receipt=dict(verifiedAt=datetime.now(timezone.utc).isoformat(),archiveSha256=sha(archive.read_bytes()),sourceCandidate=index['sourceCandidate'],contractSha256=index['r1Contract']['sha256'],selectionSha256=index['selectionSha256'],ledgerSha256=index['ledgerSourceSha256'],sourceExporterSha256=sha((root/'scripts/validation/export-r0-public-states.py').read_bytes()),files=[dict(path=n,sha256=sha(b)) for n,b in files.items()],states=results,evaluationRead=False,networkRequests=0,limitation='Raw archives are checked read-only locally; not copied. Public package alone supports internal hashes, not independent reproduction of raw-source audit.')
(out/'source-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps(dict(statesVerified=len(results),archiveSha256=receipt['archiveSha256'],evaluationRead=False)))
