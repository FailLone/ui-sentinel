"""Read existing evidence only. No browser, server, model or test execution."""
import hashlib
import json
import subprocess
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'artifacts/r1-controlled-loop-v1'
DEST = ROOT / 'plans/r1-controlled-loop-v1/evidence-index.json'
SOURCE = '6acae6edd91ffebd020ff3dd90174bbb3d7a30b4'
files = {}


def read(path):
    return json.loads(path.read_text())


def sha(data):
    return hashlib.sha256(data).hexdigest()


def track(path, purpose):
    rel = str(path.relative_to(ROOT))
    files[rel] = {'path': rel, 'sha256': sha(path.read_bytes()),
                  'bytes': path.stat().st_size, 'purpose': purpose}
    return rel


def git_file(commit, path):
    return subprocess.check_output(['git', 'show', commit + ':' + path], cwd=ROOT)


rows = []
builds = []
case_configs = {}
for folder, arm in [('frozen-agent-fixed', 'agent-fixed'),
                    ('frozen-program', 'program'), ('frozen-jev-fixed', 'jev-fixed'),
                    ('cancel-bound', 'program')]:
    root = BASE / folder
    child = root / arm
    identity = read(root / 'identity.json')
    source = identity['sourceSha']
    assert source == (SOURCE if folder != 'cancel-bound' else
                      'c390ba45e6626f995ad06e150d53aa62e6bfeed5')
    sourcemap = read(child / 'server.mjs.map')
    assert len(sourcemap['sources']) == len(sourcemap['sourcesContent']) == 142
    for path, content in zip(sourcemap['sources'], sourcemap['sourcesContent']):
        rel = str((child / path).resolve().relative_to(ROOT))
        assert git_file(source, rel).decode() == content, rel
    builds.append({'directory': str(root.relative_to(ROOT)), 'sourceSha': source,
                   'buildSha256': sha((child / 'server.mjs').read_bytes()),
                   'sourceMapMatchedGitFiles': 142,
                   'identity': track(root / 'identity.json', 'run identity'),
                   'node': identity['node'], 'fixtureOrigin': identity['fixtureOrigin'],
                   'lockSha256': sha(git_file(source, 'pnpm-lock.yaml')),
                   'fixtureSourceSha256': sha(git_file(source, 'scripts/r1-controlled-loop/fixtures.ts')),
                   'harnessSourceSha256': sha(git_file(source, 'scripts/r1-controlled-loop/run-free.ts')),
                   'command': ['pnpm', 'exec', 'tsx', 'scripts/r1-controlled-loop/run-free.ts',
                               str(root.relative_to(ROOT)), arm] + (['cancel'] if folder == 'cancel-bound' else []),
                   'exitCode': 0, 'exitCodeSource': 'prior command tool completion, not embedded in original log',
                   'observedScenarios': [r['scenario'] for r in read(root / 'results.json')],
                   'note': 'identity.arms/scenarioCount are harness constants, not proof of executed rows'})
    for name in ['identity.json', 'results.json', 'packets.json', 'fixture-requests.json']:
        track(root / name, 'run evidence')
    for name in ['server.mjs', 'server.mjs.map', 'server.log', 'frames.jsonl', 'jev-fixed.jsonl']:
        if (child / name).exists():
            track(child / name, 'build/source binding' if name.startswith('server.mjs') else 'raw trace')
    track(BASE / (folder + '.log'), 'harness stdout')
    for summary in read(root / 'results.json'):
        case = summary['scenario']
        report_path = child / (case + '-report.json')
        report = read(report_path)
        assert report['runId'] == summary['runId']
        assert report['status'] == summary['status']
        events = report['events']
        assert [e['seq'] for e in events] == sorted(e['seq'] for e in events)
        dispatches = [e for e in events if e['type'] == 'action:executing']
        completed = [e for e in events if e['type'] == 'action:completed']
        assert len(dispatches) == report['usage']['actions']
        assert len({e['payload']['target'] for e in dispatches}) == len(dispatches)
        assert sum(e['type'] == 'model:request-started' for e in events) == report['usage']['modelCalls']
        expected = {'healthy': ('completed', 1), 'semantic': ('completed', 2),
                    'expanded': ('completed', 2), 'recovery': ('blocked', 1),
                    'late': ('blocked', 1), 'budget': ('blocked', 1), 'cancel': ('cancelled', 1)}[case]
        assert (report['status'], len(dispatches)) == expected
        assert len(dispatches) <= report['budget']['maxActions']
        started = next(e['payload'] for e in events if e['type'] == 'run:started')
        config = {k: started[k] for k in ['goal', 'budget', 'requestPolicy', 'models', 'versions']}
        assert config == case_configs.setdefault(case, config)
        index = read(child / (case + '-evidence') / 'index.json')
        assert {a['id'] for a in report['artifacts']} == {a['id'] for a in index}
        ids = {a['id'] for a in index}
        for a in index:
            path = root / a['path']
            assert path.stat().st_size == a['bytes']
            track(path, 'report-referenced artifact')
        track(child / (case + '-evidence') / 'index.json', 'artifact ID to relative path')
        for item in report['uiScan']['inspection']['items']:
            checks = item.get('checks', {})
            generic = checks.get('generic', {})
            if generic.get('state') == 'collected':
                assert generic['receiptRef'] in ids
                receipt = read(child / (case + '-evidence') / generic['receiptRef'])
                assert generic['actionId'] in json.dumps(receipt)
                assert generic['checkRef'] in json.dumps(receipt)
            for effect in checks.get('effects', []):
                assert set(effect.get('measurementRefs', [])).issubset(ids)
        counts = report['uiScan']['checkCounts']
        if case == 'healthy':
            assert not report['findings'] and counts['requiredEffectVerifiedCount'] == 0
        if case == 'expanded':
            assert [e['payload']['target'] for e in dispatches] == ['button[Reveal]', 'button[Continue]']
            assert counts['requiredEffectFailedCount'] == 1 and len(report['findings']) == 1
            assert sum(e['type'] == 'r1:scope-admitted' for e in events) == 1
        if case == 'recovery':
            assert counts['requiredEffectPendingCount'] == 1
            tools = Counter(e['payload']['tool'] for e in events if e['type'] == 'tool:started')
            assert tools['page_act'] == tools['page_inspect'] == tools['interaction_verify'] == 1
        if case == 'late':
            assert counts['sourceUnresolvedCount'] == counts['requiredEffectPendingCount'] == 1
        if case == 'budget':
            assert counts['genericIncompleteCount'] == 1
        if case == 'cancel':
            cancel_seq = next(e['seq'] for e in events if e['type'] == 'run:cancel-requested')
            assert all(e['seq'] < cancel_seq for e in dispatches) and not completed
        handoffs = [e['payload'] for e in events if e['type'] == 'r1:handoff']
        if arm != 'agent-fixed' and case in ['recovery', 'late', 'budget']:
            assert len(handoffs) == 1
            packet = handoffs[0]['packet']
            assert all(k in packet for k in ['remaining', 'checks', 'originalActions',
                                             'forbiddenReplays', 'evidenceRefs', 'dom', 'budget'])
        rows.append({'arm': arm, 'scenario': case, 'sourceSha': source,
                     'buildSha256': builds[-1]['buildSha256'],
                     'configuration': config, 'runId': report['runId'],
                     'report': track(report_path, 'authoritative report'),
                     'status': report['status'], 'stopReason': report['stopReason'],
                     'classification': 'expected-partial' if case in ['recovery', 'late', 'budget', 'cancel'] else 'expected-concluded',
                     'actions': len(dispatches), 'completedActions': len(completed),
                     'targets': [e['payload']['target'] for e in dispatches],
                     'mainFixedRequests': report['usage']['modelCalls'],
                     'programSteps': sum(e['type'] == 'r1:step' for e in events),
                     'pageObservations': sum(e['type'] == 'page:observed' for e in events),
                     'tools': dict(Counter(e['payload']['tool'] for e in events if e['type'] == 'tool:started')),
                     'checkCounts': counts, 'findingCount': len(report['findings']),
                     'reportElapsedMs': report['usage']['elapsedMs'], 'harnessElapsedMs': summary['elapsedMs'],
                     'handoffReasons': [h['reason'] for h in handoffs], 'artifactCount': len(index),
                     'realModelCostUsd': 0, 'realModelCalls': 0,
                     'futureRealCostUsd': None})

assert len(rows) == 19
assert len({b['buildSha256'] for b in builds}) == 1
jev_root = BASE / 'frozen-jev-fixed/jev-fixed'
jev_rows = [json.loads(s) for s in (jev_root / 'jev-fixed.jsonl').read_text().splitlines()]
assert len(jev_rows) == 1
semantic_id = next(r['runId'] for r in rows if r['arm'] == 'jev-fixed' and r['scenario'] == 'semantic')
assert jev_rows[0]['runId'] == semantic_id and jev_rows[0]['fixed'] is True
campaign = jev_root / ('campaign-' + semantic_id)
for f in campaign.iterdir():
    track(f, 'fixed Jev durable campaign')
ledger = [json.loads(s) for s in (campaign / 'ledger.jsonl').read_text().splitlines()]
assert [e['kind'] for e in ledger] == ['open', 'reserve', 'settle']
for i, event in enumerate(ledger):
    assert event['seq'] == i
    assert event['previous'] == (ledger[i - 1]['hash'] if i else '')
    value = [event[k] for k in ['seq', 'previous', 'at', 'kind', 'id', 'quote', 'cost']]
    value.append(event.get('limits'))
    assert sha(json.dumps(value, separators=(',', ':')).encode()) == event['hash']
dispatch = read(campaign / 'dispatch.json')
assert ledger[1]['id'] == ledger[2]['id'] == dispatch['attemptId']
assert ledger[1]['quote'] == 0.003 and ledger[2]['cost'] == 0
assert read(campaign / 'summary.json')['realHttp'] is False
request = read(campaign / 'request.json')
assert json.loads(request['wire'])['state'] == read(campaign / 'frame.json')
assert len(request['questions']) == 5
response = read(campaign / 'response.json')
prepared = read(campaign / 'prepared.json')
assert prepared['wire'] == request['wire']
assert sha(request['wire'].encode()) == request['wireDigest']
for event in [prepared, dispatch, response]:
    assert event['attemptId'] == ledger[1]['id']
    assert event['wireDigest'] == request['wireDigest']
    assert event['requestDigest'] == request['requestDigest']
assert sha(response['responseText'].encode()) == response['responseDigest']
assert json.loads(response['responseText'])['usage']['cost'] == ledger[2]['cost']
assert (ROOT / 'plans/r1-controlled-loop-v1/paid/request.json').read_text() == request['wire']
for f in read(campaign / 'manifest.json')['files']:
    assert sha((campaign / f['path']).read_bytes()) == f['sha256']
for r in rows:
    r['jevFixedRequests'] = int(r['runId'] == semantic_id)

earlier = []
reasons = {
    'free-5903c41': 'Initial wiring failure: unresolved goal / stale snapshot target. Stopped after execution-error; not final evidence.',
    'program-fixed': 'Before scope gateway: expanded ended after one action; budget scenario differs. Not six-case final comparison.',
    'agent-final': 'Before bounded admission fix. Expanded one action is not continuous-loop success.',
    'jev-final': 'Before bounded admission fix. Expanded blocked after refused extension.',
    'expanded-final': 'Before bounded admission fix; extension blocked.',
    'budget-final': 'Intermediate budget-only evidence; superseded by final matched build.',
    'expanded-admission': 'Actual execution-error: original default sampling selection remained frozen.',
    'expanded-bound': 'Valid targeted two-action result, but earlier source identity; excluded from final 18 rows.',
}
for folder, reason in reasons.items():
    root = BASE / folder
    identity = read(root / 'identity.json')
    earlier.append({'directory': str(root.relative_to(ROOT)), 'sourceSha': identity['sourceSha'],
                    'classification': reason,
                    'rows': [{k: r[k] for k in ['arm', 'scenario', 'status', 'usage']} for r in read(root / 'results.json')]})
    for name in ['identity.json', 'results.json']:
        track(root / name, 'retained earlier outcome; excluded from comparison')
    track(BASE / (folder + '.log'), 'retained earlier log; excluded from comparison')

validation = [
    ('targeted-final.log', ['pnpm', 'exec', 'vitest', 'run', 'src/agent/exploration/integration/host.test.ts', 'scripts/r1-jev-real/frame-campaign.test.ts'], '15 passed'),
    ('default-transport-regression.log', ['pnpm', 'exec', 'vitest', 'run', 'src/agent/decisions/jev-provider/provider.test.ts', '-t', 'sends one exact request'], '1 passed; 39 skipped'),
    ('typecheck-final.log', ['pnpm', 'typecheck'], 'passed'),
]
for name, _, _ in validation:
    track(BASE / name, 'reused free validation log')
for f in (ROOT / 'plans/r1-controlled-loop-v1/paid').iterdir():
    track(f, 'pending authorization input; no real HTTP')
for path in ['scripts/r1-controlled-loop/fixtures.ts', 'scripts/r1-controlled-loop/run-free.ts',
             'scripts/r1-controlled-loop/server-entry.ts', 'pnpm-lock.yaml', 'package.json',
             'scripts/r1-controlled-loop/index-evidence.py',
             'plans/r1-controlled-loop-v1/README.md', 'plans/r1-controlled-loop-v1/CONTRACT.md',
             'scripts/r1-jev-real/frame-campaign.test.ts', 'src/agent/exploration/integration/host.test.ts']:
    track(ROOT / path, 'source / test / environment binding')
real_execution = None
real_root = BASE / 'real-semantic-frame-1'
if (real_root / 'audit.json').exists():
    real_execution = read(real_root / 'audit.json')
    assert real_execution['realRequests'] == 1
    assert real_execution['sourceSha'] == SOURCE
    assert real_execution['budget']['pending'] == 0
    assert real_execution['authorizationConsumed'] is True
    assert read(real_root / 'command.json')['exitCode'] == 0
    for f in real_root.rglob('*'):
        if f.is_file():
            track(f, 'authorized one-request real compatibility evidence')
output = {
    'version': 'r1-controlled-loop-evidence-1', 'runtimeSourceSha': SOURCE,
    'comparisonRows': rows, 'builds': builds, 'earlierExcluded': earlier,
    'realExecution': real_execution,
    'validation': [{'log': str((BASE / name).relative_to(ROOT)), 'reproductionCommand': argv,
                    'result': result, 'exitCode': 0, 'sourceSha': SOURCE,
                    'provenance': 'prior tool completion plus raw log; original logs do not embed argv/source SHA; commands reconstructed from selected tests'}
                   for name, argv, result in validation],
    'pathMapping': {str(ROOT): 'repository-root',
                    '/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-frame-20261009':
                    'isolated runtime checkout at 6acae6e; real-semantic-frame-1/commands.json maps retained files'},
    'audit': {'command': ['python3', 'scripts/r1-controlled-loop/index-evidence.py'],
              'browserRuns': 0, 'modelCalls': 0, 'checks': 'source-map/Git; same binary; config equality; report/artifact/receipt bindings; actual action sequence; bounded recovery; cancellation; fixed campaign ledger'},
    'limitations': ['Six small synthetic local fixtures, one run per arm; fixed decisions in Agent and Jev arms.',
                    'identity scenarioCount/arms are constants; actual reports determine run counts.',
                    'Runtime lockHash was unavailable. Lock hash supplied from Git after the run, not claimed as runtime attestation.',
                    'Free runs do not prove successful recovery, real Jev compatibility, ranking benefit, real Agent autonomy, cost saving or full R1 acceptance. A separate realExecution record, if present, covers only its one authorized frozen request.',
                    'The artifact tree is local ignored evidence. Transfer indexed files with repository; no original database required.'],
    'files': sorted(files.values(), key=lambda f: f['path']),
}
DEST.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'rows': len(rows), 'sameBuild': True, 'files': len(files),
                  'output': str(DEST.relative_to(ROOT)), 'sha256': sha(DEST.read_bytes())}))
