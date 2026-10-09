"""Export six fixed historical public prefixes. No browser, model, or scorer imports."""
import hashlib
import json
import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'data/r0-default-check-v2/final-free-2026-10-08T20-46-41-537Z'
OUT = ROOT / 'plans/r0-r1-dependency-v2'
PRODUCT = '27614b7a60293a80f3be7b321d164d3599dd0964'
SELECTION = [
    ('V01', 'workbench', 0, 'one selected generic obligation'),
    ('V02', 'more-than-three', 0, 'observed controls before fixed selection'),
    ('V03', 'more-than-three', 1, 'three frozen selected obligations'),
    ('V04', 'native', 1, 'one concluded local item and one pending native item'),
    ('V05', 'explicit-unfinished', 1, 'generic collected, required effect unfinished'),
    ('V06', 'late-source', 1, 'late public source, requirement remains unfinished'),
]


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()


def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(relative, value):
    path = OUT / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    return {'path': relative, 'bytes': path.stat().st_size, 'sha256': file_hash(path)}


packets = json.loads((SOURCE / 'packets.json').read_text())
db = sqlite3.connect('file:' + str(SOURCE / 'runs.db') + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
entries, history = [], []
selection_identity = write('evaluation/selection.json', {'selectedBeforeExport': SELECTION,
      'selectionBasis': 'structural public state differences, not outcome/score optimization',
      'notBlind': 'Author has inspected the retained batch; no independent preference labels supplied.'})
for state_id, mode, turn, rationale in SELECTION:
    packet_index, packet = next((n, p) for n, p in enumerate(packets)
                                if p['mode'] == mode and p['turn'] == turn)
    original = packet['input']
    # The report is used only to locate the run; all historical facts come from read-only DB prefixes.
    run_id = json.loads((SOURCE / (mode + '-report.json')).read_text())['runId']
    row = db.execute('select spec from runs where id=?', (run_id,)).fetchone()
    contract = json.loads(row['spec'])['uiContract']
    events = []
    for e in db.execute('select * from run_events where run_id=? order by seq', (run_id,)):
        events.append({'id': e['id'], 'runId': e['run_id'], 'seq': e['seq'], 'type': e['type'],
                       'timestamp': e['timestamp'], 'actionId': e['action_id'],
                       'payload': json.loads(e['payload']), 'evidenceRefs': json.loads(e['evidence_refs'])})
    requests = [e for e in events if e['type'] == 'model:request-started' and e['payload'].get('purpose') == 'agent']
    assert len(requests) == len([p for p in packets if p['mode'] == mode])
    request = requests[turn]
    cutoff = request['seq'] - 1
    prefix = [e for e in events if e['seq'] <= cutoff]
    ledger, operations = {}, []
    for e in prefix:
        payload = e['payload']
        if e['type'] == 'scope:item-created':
            ledger[payload['itemId']] = dict(payload)
        elif e['type'] == 'scope:item-updated' and 'itemId' in payload:
            ledger[payload['itemId']].update(payload)
        elif e['type'] == 'agent:response':
            for tool in payload.get('toolResults', []):
                p = tool['payload']
                result = p.get('result', {})
                operations.append({'eventSeq': e['seq'], 'tool': p['toolName'], 'args': p['args'],
                                   'status': str(result.get('status', 'error' if result.get('error') else 'returned'))})
    scope = original['inspectionScope']
    current_checks = {c['itemId']: c['checks'] for c in scope['checks']}
    for item_id, checks in current_checks.items():
        # Input summaries omit sourceReview.page; compare authoritative states only.
        persisted = ledger[item_id]['checks']
        assert checks['generic']['state'] == persisted['generic']['state']
        assert checks['sourceReview']['state'] == persisted['sourceReview']['state']
        assert [(r['requirementId'], r['state']) for r in checks['effects']] == [(r['requirementId'], r['state']) for r in persisted['effects']]
    observation = original['observation']
    snapshot_event = next(e for e in reversed(prefix) if e['type'] == 'page:observed')
    snapshot_id = snapshot_event['payload']['snapshotRef']
    artifact = db.execute('select file_path from artifacts where id=? and run_id=?', (snapshot_id, run_id)).fetchone()
    assert artifact
    snapshot_hash = file_hash(pathlib.Path(artifact['file_path']))
    selected = [c for c in scope['candidates'] if ledger[c['itemId']]['selected']]
    permissions = {k: contract[k] for k in ['session', 'businessWrites', 'origin', 'scope']}
    revision = 'r0-v2-public-state-1'
    observation_version = 'observation:' + digest(observation)
    related_version = 'prefix:' + digest(prefix)
    budget = {'revision': 'historical:' + digest(original['budgetRemaining']),
              'remainingDecisions': original['budgetRemaining']['modelCalls'],
              'remainingActions': original['budgetRemaining']['actions'],
              'remainingMs': original['budgetRemaining']['timeMs'],
              'maxRequestMs': 60000, 'remainingCostUsd': None}
    assert budget['remainingActions'] == contract['budget']['maxActions'] - sum(e['type'] == 'action:executing' for e in prefix)
    assert budget['remainingDecisions'] == contract['budget']['maxModelCalls'] - turn
    registered = [{**{k: q[k] for k in ['itemId', 'category', 'selected', 'status']},
                   'reasonCode': q.get('reasonCode'),
                   **({'checks': current_checks[q['itemId']]} if q['itemId'] in current_checks else {})}
                  for q in ledger.values()]
    # Only allowlisted fields from the actual provider request. No prompt history/reasoning text.
    public_keys = ['goal', 'activeTools', 'observation', 'inspection', 'inspectionScope',
                   'ruleCatalog', 'pendingKnownRuleChecks', 'knownRules', 'observedRuleTriggers',
                   'completedRuleChecks', 'evidenceRefs', 'evidenceIntegrity', 'finishReadiness',
                   'budgetRemaining', 'latestToolResults']
    public = {'schemaVersion': revision, 'mode': 'offline-advice-only', 'stateId': state_id,
              'runId': run_id, 'eventCutoffSeq': cutoff, 'at': prefix[-1]['timestamp'],
              'source': {'productCommit': PRODUCT, 'requestEventSeq': request['seq'],
                         'snapshotEventSeq': snapshot_event['seq'], 'snapshotArtifactId': snapshot_id,
                         'snapshotSha256': snapshot_hash,
                         'packetIndex': packet_index, 'actualInputSha256': digest(original),
                         'prefixSha256': digest(prefix), 'contractHash': contract['hash'],
                         'hashEncoding': 'UTF-8 sorted-key compact JSON, except file hashes'},
              'protocol': {k: contract[k] for k in ['policyRevision', 'samplingPolicy', 'checkPolicy']},
              'permissions': permissions, 'operations': operations, 'registeredChecks': registered,
              'actualInput': {k: original[k] for k in public_keys if k in original},
              'unknowns': ['live node connection/permission/safety and current budget require executor validation',
                           'remainingMs is recorded request estimate, not a proven wall-clock lower bound',
                           'future dollar quote/remaining authorization unknown; local stub zero cost grants none',
                           'visible/enabled and absent blockedPoints do not prove click authorization',
                           'checkInteractions.requirements is frozen action data; current states are in inspectionScope.checks',
                           'no comparative preference truth or outcome prediction is supplied']}
    public_identity = write('public/' + state_id + '.json', public)
    candidates, facts = [], []
    for c in scope['candidates']:
        q = ledger[c['itemId']]
        element = next((e for e in observation['elements'] if e['ref'] == c['ref']), None)
        assert element, (state_id, c['ref'])
        checks = current_checks.get(c['itemId'])
        native = 'fill' if element['tag'] in ['select', 'input', 'textarea'] else 'click'
        dimensions = None if checks is None else {
            'revision': checks['revision'], 'sourceReviewState': checks['sourceReview']['state'],
            'sourceReviewReasons': checks['sourceReview'].get('reasons', []),
            'generic': checks['generic'],
            'effects': [{k: r[k] for k in ['requirementId', 'state', 'sourceKind', 'late', 'evaluationPoint', 'requirementHash']} for r in checks['effects']],
            'effectSpecification': 'unspecified' if checks['sourceReview']['state'] == 'sealed' and not checks['effects'] else 'declared-or-unresolved'}
        context = {'ref': c['ref'], 'snapshotId': c['snapshotId'], 'category': c['category'],
                   'selected': q['selected'], 'status': q['status'], 'nativeAction': native,
                   'bindingAuthorization': 'unknown-until-live-validation', 'costUpperBoundUsd': 'unknown',
                   'observedHitTests': {'sampleCount': 0, 'relations': {}},
                   'hitTestLimit': 'Raw request has blockedPoints, not exact sample relations; not reconstructed.',
                   'blockedPoints': element.get('blockedPoints'),
                   'r0V2': {'extensionVersion': revision, 'checks': dimensions,
                            'fullPublicState': public_identity, 'directlyExecutable': False},
                   'permissions': permissions, 'remainingBudget': budget,
                   'estimatedCostUnit': 'one-atomic-tool-call-effort',
                   'fillNotRepresentableInR1PublicActions': native == 'fill'}
        assert len(encoded(context).decode()) <= 4096
        candidates.append({'id': c['itemId'], 'targetKey': c['itemId'],
                           'observationVersion': observation_version, 'text': element.get('text', ''),
                           'role': element.get('role') or {'button': 'button', 'select': 'combobox', 'a': 'link'}.get(element['tag'], element['tag']),
                           'publicState': {'visible': element.get('visible'), 'enabled': element.get('enabled'), 'expanded': None, 'selected': None},
                           'geometry': None, 'context': encoded(context).decode(),
                           'allowedActions': ['inspect'], 'estimatedCost': 1})
        facts.append({'candidateId': c['itemId'], 'obligationId': c['itemId'],
                      'obligation': 'completed' if q['status'] in ['verified', 'failed'] else 'pending',
                      'required': q['selected'], 'permission': 'unknown', 'preconditions': 'unknown',
                      'action': 'inspect', 'estimatedMs': None, 'estimatedActionCostUsd': None,
                      'lastCheckedState': None, 'recheckReason': None,
                      'evidenceRef': 'public/' + state_id + '.json#registeredChecks'})
    input_value = {'schemaVersion': 'r1-exploration-input-1', 'requestId': state_id,
                   'task': {'goal': original['goal'], 'localTask': observation.get('pageText', '')[:1800],
                            'revision': contract['policyRevision']},
                   'state': {'pageId': original['inspection']['snapshotId'], 'url': observation['url'],
                             'documentVersion': 'unknown-live-document', 'observationVersion': observation_version,
                             'relatedStateVersion': related_version, 'cacheable': False},
                   'candidates': candidates, 'history': [],
                   'scope': {'revision': revision, 'executableCandidateIds': [c['itemId'] for c in selected]},
                   'budget': budget, 'limits': {'maxCandidates': 32, 'maxInputBytes': 32768, 'maxHistory': 32}}
    assert len(encoded(input_value)) <= 32768
    input_identity = write('inputs/' + state_id + '.json', input_value)
    state = {'id': state_id, 'provenance': {'sourceSha': PRODUCT,
             'artifactSha256': public_identity['sha256'], 'stateRef': 'public/' + state_id + '.json',
             'decisionCutoff': 'run:' + run_id + ':seq<=' + str(cutoff)},
             'input': input_value, 'criticalInformationMissing': False, 'facts': facts}
    state_identity = write('states/' + state_id + '.json', state)
    entries.append({'stateId': state_id, 'runId': run_id, 'eventCutoffSeq': cutoff,
                    'contractHash': contract['hash'], 'public': public_identity, 'input': input_identity,
                    'state': state_identity, 'candidateCount': len(candidates),
                    'selectedCandidateCount': len(selected),
                    'unfinishedSelectedCount': sum(f['required'] and f['obligation'] == 'pending' for f in facts)})
    response = next((e for e in events if e['seq'] > request['seq'] and e['type'] == 'agent:response'), None)
    history.append({'stateId': state_id, 'sourceMode': mode, 'turn': turn, 'rationale': rationale,
                    'responseSeq': response['seq'] if response else None,
                    'actualSubsequentToolCalls': [{'tool': t['payload']['toolName'], 'args': t['payload']['args']}
                                                for t in response['payload'].get('toolResults', [])] if response else [],
                    'evaluationLabel': 'historical deterministic choice, not optimality truth; never include in advice inputs'})
history_identity = write('evaluation/historical-choices.json', history)
write('evaluation/index.json', {'mode': 'comparison-only-never-advice-input',
      'files': [selection_identity, history_identity],
      'labels': 'No preferred candidate, success, or optimality labels supplied.'})
index = {'schemaVersion': 'r0-r1-dependency-manifest-1', 'publicStateVersion': 'r0-v2-public-state-1',
         'inputVersion': 'r1-exploration-input-1', 'mode': 'offline-advice-only', 'productCommit': PRODUCT,
         'r0DeliveryCommit': '5070fb227684cbad821c51a8310280b12505787f', 'states': entries,
         'source': {'localOnlyRoot': str(SOURCE), 'packetsFileSha256': file_hash(SOURCE / 'packets.json'),
                    'databaseSha256': file_hash(SOURCE / 'runs.db'), 'provider': 'deterministic local-fixed, real API/Chromium',
                    'newModelCalls': 0, 'newBrowserRuns': 0},
         'readingBoundary': 'Read public/ + inputs/ + states/ together. evaluation/ is separate; no labels imported.',
         'consumerStatus': 'not yet verified by R1; old fixed-eight CLI is intentionally not changed',
         'limits': ['not real-model trajectories', 'no preference reference or Jev gain claim',
                    'no page-with-zero-controls sample; V02 only has zero frozen selected candidates',
                    'v1 makeAdvicePacket strips new facets; v2-aware consumer must retain public state and r0V2 extension for both program and Jev',
                    'history[] is not no prior actions: full prior tool operations and check/action refs remain in public state',
                    'criticalInformationMissing=false applies to bounded advice facts only; live execution remains unknown']}
write('index.json', index)
print(json.dumps({'output': str(OUT), 'states': [{k: e[k] for k in ['stateId', 'eventCutoffSeq', 'candidateCount', 'selectedCandidateCount', 'unfinishedSelectedCount']} for e in entries]}))
