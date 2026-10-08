"""Offline, cutoff-only export. No browser, model, credential, or R1 module invocation."""
import collections
import hashlib
import json
import pathlib
import sqlite3
from datetime import datetime
from decimal import Decimal

ROOT = pathlib.Path(__file__).resolve().parents[2]
SELECTION = ROOT / 'plans/evidence/r0-request-stop-state-selection.json'
OUT = ROOT / 'plans/evidence/r0-public-decision-states'
LEDGER = ROOT / 'data/r0-08acc95-resume/campaign-ledger-final-snapshot.db'
CAMPAIGN = '0946f830-00b6-4f46-af69-79bd2166ef9d'


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def ro(path):
    db = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    db.row_factory = sqlite3.Row
    return db


def put(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def ms(at):
    return int(datetime.fromisoformat(at.replace('Z', '+00:00')).timestamp() * 1000)


def public_args(args):
    # No agent prose, basis, notes, analysis, summaries, hypotheses, or rule answers.
    out = {k: args[k] for k in ('type', 'ref', 'refs', 'role', 'name', 'nth', 'selector',
                               'value', 'url', 'scrollY', 'offset', 'limit') if k in args}
    if isinstance(args.get('verify'), dict):
        out['verify'] = {k: args['verify'][k] for k in ('selector', 'condition', 'expected')
                         if k in args['verify']}
    return out


def calls(events):
    result = []
    for e in events:
        if e['type'] != 'agent:response':
            continue
        for item in e['data'].get('toolResults', []):
            p = item.get('payload', {})
            if not p.get('toolName'):
                continue
            r = p.get('result', {})
            result.append({'eventSeq': e['seq'], 'tool': p['toolName'],
                           'args': public_args(p.get('args', {})),
                           'status': r.get('status', 'unknown') if isinstance(r, dict) else 'unknown'})
    return result


def money(at):
    with ro(LEDGER) as db:
        rows = db.execute('SELECT * FROM ledger_requests WHERE campaign_id=? AND created_at<=? ORDER BY created_at,request_id',
                          (CAMPAIGN, at)).fetchall()
        recons = {r['request_id']: r for r in db.execute('SELECT * FROM ledger_reconciliations WHERE campaign_id=? AND reconciled_at<=?', (CAMPAIGN, at))}
        limit = Decimal(str(db.execute('SELECT limit_usd FROM campaigns WHERE campaign_id=?', (CAMPAIGN,)).fetchone()[0]))
    known = Decimal(0)
    held = Decimal(0)
    unknown = Decimal(0)
    nunknown = 0
    sources = []
    for r in rows:
        # Final status/actual values are unavailable until their original settled_at.
        status = r['status'] if r['settled_at'] and r['settled_at'] <= at else 'held'
        c = recons.get(r['request_id'])
        if c:
            status = 'settled'
            known += Decimal(str(c['actual_usd']))
        elif status == 'settled':
            known += Decimal(str(r['actual_usd']))
        elif status == 'unknown':
            nunknown += 1
            unknown += Decimal(str(r['reserved_usd']))
        elif status == 'held':
            held += Decimal(str(r['reserved_usd']))
        sources.append([r['request_id'], r['created_at'], status,
                        float(Decimal(str(c['actual_usd'] if c else r['actual_usd']))) if status == 'settled' else r['reserved_usd']])
    return {'asOf': at, 'limitUsd': float(limit), 'knownCostUsd': float(known),
            'heldReservedUsd': float(held), 'unknownReservedUsd': float(unknown),
            'unknownCount': nunknown, 'remainingAdmissibleUsd': float(max(Decimal(0), limit-known-held-unknown)),
            'newRequestAllowedByCost': nunknown == 0,
            'asOfRowsSha256': sha(compact(sources).encode()), 'asOfRequestCount': len(rows)}


def export():
    selection = json.loads(SELECTION.read_text())
    assert selection['beforeAnyNewJevOutput'] and selection['newJevOutputs'] == 0
    base = ROOT / selection['sourceBatch']
    index = {'selectionSha256': sha(SELECTION.read_bytes()), 'r1Contract': selection['r1Contract'],
             'sourceCandidate': selection['sourceCandidate'], 'newPaidCostUsd': 0,
             'newJevOutputs': 0, 'ledgerSource': str(LEDGER.relative_to(ROOT)),
             'ledgerSourceSha256': sha(LEDGER.read_bytes()), 'states': []}
    dbs = {json.loads((p.parent/'report.json').read_text())['runId']: p for p in base.glob('row-*/runs.db')}
    for point in selection['states']:
        path = dbs[point['runId']]
        with ro(path) as db:
            raw = [dict(r) for r in db.execute('SELECT * FROM run_events WHERE run_id=? ORDER BY seq', (point['runId'],))]
            spec = json.loads(db.execute('SELECT spec FROM runs WHERE id=?', (point['runId'],)).fetchone()[0])
        prefix = [e for e in raw if e['seq'] <= point['eventCutoffSeq']]
        prefix_hash = sha(compact([[e[k] for k in ('id','seq','type','timestamp','payload','evidence_refs')] for e in prefix]).encode())
        assert prefix_hash == point['sourcePrefixSha256']
        assert prefix[-1]['id'] == point['cutoffEventId'] and prefix[-1]['timestamp'] == point['at']
        for e in raw:
            e['data'] = json.loads(e['payload'])
        prefix = [e for e in raw if e['seq'] <= point['eventCutoffSeq']]
        items, bindings, sampling = {}, {}, []
        for e in prefix:
            p = e['data']
            if e['type'] == 'scope:item-created':
                items[p['itemId']] = {k: p[k] for k in ('itemId','category','url','selected','status','reasonCode',
                                                       'pageId','stateId','observationVersion','documentVersion','evidenceRefs')}
            elif e['type'] == 'scope:item-updated' and p.get('itemId') in items:
                items[p['itemId']].update({k:p[k] for k in ('selected','status','reasonCode','evidenceRefs') if k in p})
            elif e['type'] in ('scope:candidate-bound','scope:candidate-reobserved'):
                bindings.setdefault(p['itemId'], {}).update(p)
            elif e['type'] in ('scope:sampling-frozen','scope:sampling-navigation-frozen'):
                sampling.append({k:p[k] for k in ('url','itemId','pool','count','snapshotId','policy') if k in p})
        observed = [e for e in prefix if e['type'] == 'page:observed'][-1]
        snapshot_path = path.parent/'artifacts'/observed['data']['snapshotRef']
        page = json.loads(snapshot_path.read_text())
        assert ms(page['observedAt']) <= ms(point['at'])
        observation_version = 'observation:' + sha(snapshot_path.read_bytes())[:32]
        snapshot_id = 's' + str(observed['data']['observeSeq'])
        related_version = 'prefix:' + prefix_hash[:32]
        versions = [e['data'] for e in prefix if e['type'] == 'observation:validated']
        document_version = versions[-1]['version'] if versions else 'unknown'
        start = next(e for e in prefix if e['type'] == 'run:started')
        operations = calls(prefix)
        repeat = collections.Counter(compact({'tool':o['tool'],'args':o['args']}) for o in operations)
        actions = [e for e in prefix if e['type'] == 'action:executing']
        action_repeats = collections.Counter((e['data']['type'],e['data']['target']) for e in actions)
        previous_requests = [json.loads(line) for line in (base/'requests.jsonl').read_text().splitlines()
                             if json.loads(line).get('run')==path.parent.name and json.loads(line)['startedAt']<=point['at']]
        starts = [e for e in prefix if e['type']=='model:request-started']
        # Executor startedAt is not persisted. Bound it using the public input construction window;
        # do not turn the later run:started event into a fabricated exact timer origin.
        origin_lower, origin_upper = 0, ms(prefix[0]['timestamp'])
        seen_packets = set()
        for request in previous_requests:
            content = next(m['content'] for m in request['body']['messages'] if m['role']=='user')
            if content in seen_packets:
                continue  # Retry reuses its original packet; its time budget is stale.
            seen_packets.add(content)
            packet = json.loads(content)
            model_start = starts[request['seq']-1]
            prior = next(e for e in reversed(prefix) if e['seq']<model_start['seq'])
            consumed = spec['budget']['totalTimeoutMs']-packet['budgetRemaining']['timeMs']
            origin_lower=max(origin_lower,ms(prior['timestamp'])-consumed)
            origin_upper=min(origin_upper,model_start['data']['startedAt']-consumed)
        assert origin_lower<=origin_upper
        time_lower=max(0,spec['budget']['totalTimeoutMs']+origin_lower-ms(point['at']))
        time_upper=max(0,spec['budget']['totalTimeoutMs']+origin_upper-ms(point['at']))
        budget = {'remainingActions': max(0,spec['budget']['maxActions']-len(actions)),
                  'remainingDecisions': max(0,spec['budget']['maxModelCalls']-sum(e['type']=='model:request-started' for e in prefix)),
                  'remainingMs': time_lower,
                  'maxRequestMs': start['data']['requestPolicy']['timeoutMs']}
        financial = money(point['at'])
        budget['remainingCostUsd'] = financial['remainingAdmissibleUsd'] if not financial['unknownCount'] else None
        scope_summary = [{k:i[k] for k in ('itemId','category','status')} for i in items.values() if i['selected']]
        candidates = []
        for item_id,binding in bindings.items():
            item = items[item_id]
            if item['url'] != page['url'] or binding['snapshotId'] != snapshot_id:
                continue
            key = json.loads(binding['samplingKey'])
            element = next((el for el in page['elements'] if el['selector'] == key[1]), None)
            if not element:
                continue
            attrs = element.get('attributes', {})
            bounds = element.get('bounds')
            geometry = None if not bounds else {**bounds,'inViewport':bounds['x']<page['viewport']['width'] and bounds['y']<page['viewport']['height'] and bounds['x']+bounds['width']>0 and bounds['y']+bounds['height']>0}
            role = attrs.get('role') or {'a':'link','select':'combobox','button':'button'}.get(element['tag'],element['tag'])
            # Advice eligibility is NOT live executor dispatch authorization. Fill stays native.
            allowed = ['inspect']
            if element['tag'] in ('a','button') and element.get('enabled') and element.get('visible'):
                allowed.insert(0,'click')
            public = {'category':item['category'],'selected':item['selected'],'status':item['status'],
                      'ref':binding['ref'],'snapshotId':binding['snapshotId'],
                      'nativeAction':'fill' if element['tag']=='select' else 'click',
                      'selectedChecks':scope_summary,'remainingBudget':budget,
                      'operations':operations,'bindingAuthorization':'unknown-until-live-validation',
                      'estimatedCostUnit':'one-atomic-tool-call-effort','costUpperBoundUsd':'unknown',
                      'fillNotRepresentableInR1PublicActions':element['tag']=='select'}
            # All recorded tool calls retained in companion; compact repetitions suffice for ranking.
            public['operations'] = [{'tool':o['tool'],'args':{k:v for k,v in o['args'].items() if v is not None}} for o in operations if o['tool']=='page_act']
            public['permissions'] = {k:spec['uiContract'][k] for k in ('session','origin','scope','businessWrites')}
            public['readToolCounts'] = dict(collections.Counter(o['tool'] for o in operations if o['tool']!='page_act'))
            public['nativeTargetRepeats'] = [{'type':k[0],'target':k[1],'count':v} for k,v in action_repeats.items()]
            public['observedHitTests'] = {'sampleCount':len(element.get('hitSamples',[])),
                                         'relations':dict(collections.Counter(h.get('relation','unknown') for h in element.get('hitSamples',[])))}
            context = compact(public)
            assert len(context) <= 4096
            candidates.append({'id':item_id,'targetKey':item_id,'observationVersion':observation_version,
                               'text':element['text'],'role':role,
                               'publicState':{'visible':element.get('visible'),'enabled':element.get('enabled'),
                                              'expanded':{'true':True,'false':False}.get(attrs.get('aria-expanded')),
                                              'selected':{'true':True,'false':False}.get(attrs.get('aria-selected'))},
                               'geometry':geometry,'context':context,'allowedActions':allowed,'estimatedCost':1})
        history = []
        for e in actions:
            if e['data']['type'] != 'click':
                continue
            # Attribution is only accepted from the executor's explicit measured item identity.
            matches = []
            for x in prefix:
                if x['type']=='agent:response':
                    for t in x['data'].get('toolResults',[]):
                        r=t.get('payload',{}).get('result',{})
                        v=r.get('verification',{}) if isinstance(r,dict) else {}
                        if v.get('actionId')==e['action_id'] and v.get('itemId') in [c['id'] for c in candidates]:
                            matches.append(v)
            if not matches:
                continue
            v=matches[-1]
            history.append({'targetKey':v['itemId'],'candidateId':v['itemId'],'action':'click',
                            'beforeStateVersion':'event:'+str(e['seq']), 'afterStateVersion':'event:'+str(next((x['seq'] for x in prefix if x['type']=='action:completed' and x['action_id']==e['action_id']),e['seq'])),
                            'actualEffects':[], 'outcome':'observed' if v['outcome']=='verified' else 'failed' if v['outcome']=='failed' else 'unknown'})
        input_value = {'schemaVersion':'r1-exploration-input-1','requestId':point['stateId'],
                       'task':{'goal':spec['goal'],'localTask':page['text']+'\nRecorded selected checks and remaining budgets are in candidate.context; no general coverage promise.','revision':spec['uiContract']['policyRevision']},
                       'state':{'pageId':snapshot_id,'url':page['url'],
                                'documentVersion':document_version,'observationVersion':observation_version,
                                'relatedStateVersion':related_version,'cacheable':False},
                       'candidates':candidates,'history':history,
                       'scope':{'revision':'scope:'+prefix_hash[:32],'executableCandidateIds':[c['id'] for c in candidates]},
                       'budget':{'revision':'budget:'+prefix_hash[:32],**budget},
                       'limits':{'maxCandidates':32,'maxInputBytes':32768,'maxHistory':32}}
        assert len(compact(input_value).encode()) <= 32768
        public_page = {k:page[k] for k in ('url','title','text','viewport','observedAt')}
        public_page['elements'] = [{k:el[k] for k in ('selector','tag','text','visible','enabled','bounds') if k in el} | {'attributes':{k:v for k,v in el.get('attributes',{}).items() if k in ('role','type','name','href','aria-label','aria-expanded','aria-selected','value')},'hitSamples':[{k:h[k] for k in ('x','y','relation','hitSelector','blockerBounds') if k in h} for h in el.get('hitSamples',[])]} for el in page['elements']]
        last_request = previous_requests[-1]
        last_packet = json.loads(next(m['content'] for m in last_request['body']['messages'] if m['role']=='user'))
        companion = {'stateId':point['stateId'],'runId':point['runId'],'eventCutoffSeq':point['eventCutoffSeq'],
                     'at':point['at'],'page':public_page,'registeredChecks':list(items.values()),'frozenSampling':sampling,
                     'operations':operations,'repeatedOperations':[{'operation':json.loads(k),'count':v} for k,v in repeat.items()],
                     'actionDispatches':[{k:e[k] for k in ('seq','timestamp','action_id')} | {'type':e['data']['type'],'target':e['data']['target']} for e in actions],
                     'nativeTargetRepeats':[{'type':k[0],'target':k[1],'count':v} for k,v in action_repeats.items()],
                     'budget':budget,'financialBudget':financial,
                     'remainingTimeBoundsMs':{'lower':time_lower,'upper':time_upper,
                                              'exactTimerOrigin':'unknown/not persisted',
                                              'r1Uses':'conservative lower bound, not additional time'},
                     'lastSentPromptBudget':{'requestId':last_request['requestId'],'startedAt':last_request['startedAt'],
                                             'budgetRemaining':last_packet['budgetRemaining'],
                                             'sourceRequestSha256':sha(compact(last_request).encode()),
                                             'authoritativeAtCutoff':False},
                     'permissions':{k:spec['uiContract'][k] for k in ('session','origin','scope','access','businessWrites','availableCapabilities','unsupportedCapabilities')},
                     'unknowns':{'liveTargetValidity':'unknown','futureProviderCostUsd':'unknown','optionalExpansionCostUpperBoundUsd':'unknown','cacheReuseSafe':False},
                     'source':{'database':str(path.relative_to(ROOT)),'databaseSha256':sha(path.read_bytes()),
                               'sourcePrefixSha256':prefix_hash,'snapshotRef':observed['data']['snapshotRef'],
                               'snapshotSha256':sha(snapshot_path.read_bytes()),'snapshotEventSeq':observed['seq']}}
        input_file = OUT/'inputs'/f"{point['stateId']}.json"
        companion_file = OUT/'public'/f"{point['stateId']}.json"
        put(input_file,input_value);put(companion_file,companion)
        next_start = next(e for e in raw if e['seq']>point['eventCutoffSeq'] and e['type']=='model:request-started')
        next_boundary = next((e['seq'] for e in raw if e['seq']>next_start['seq'] and e['type']=='model:request-started'),float('inf'))
        next_calls = calls([e for e in raw if next_start['seq']<e['seq']<next_boundary])
        evaluation = {'stateId':point['stateId'],'runId':point['runId'],'eventCutoffSeq':point['eventCutoffSeq'],
                      'modelStartSeq':next_start['seq'], 'originalChoice':[{'tool':c['tool'],'args':c['args'],'eventSeq':c['eventSeq']} for c in next_calls],
                      'choiceIfAbsent':'unknown/no recorded tool call; do not infer hidden reasoning',
                      'neverIncludeInJevInput':True}
        put(OUT/'evaluation'/f"{point['stateId']}.json",evaluation)
        index['states'].append({'stateId':point['stateId'],'runId':point['runId'],'eventCutoffSeq':point['eventCutoffSeq'],
                                'inputPath':str(input_file.relative_to(ROOT)),'inputSha256':sha(input_file.read_bytes()),
                                'publicPath':str(companion_file.relative_to(ROOT)),'publicSha256':sha(companion_file.read_bytes()),
                                'sourcePrefixSha256':prefix_hash,'remainingBudget':budget})
    put(OUT/'index.json',index)
    print(compact({'exported':len(index['states']),'newPaidCostUsd':0,'newJevOutputs':0}))


if __name__ == '__main__':
    export()
