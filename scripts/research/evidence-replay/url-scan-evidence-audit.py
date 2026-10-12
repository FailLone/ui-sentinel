"""Read-only reconciliation of retained R0 v2 evidence; writes a new audit, never the inputs."""
import collections
import datetime
import hashlib
import json
import pathlib
import sqlite3
import subprocess
import sys

workspace = pathlib.Path.cwd()
root = pathlib.Path(sys.argv[1]).resolve()
output = workspace / 'data/r0-default-check-v2' / ('audit-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H-%M-%S-%fZ'))
output.mkdir()


def read(path):
    return json.loads(path.read_text())


def identity(path):
    return {'path': str(path.relative_to(workspace)), 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def save(name, obj):
    (output / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False) + '\n')


manifest, results = read(root / 'manifest.json'), read(root / 'results.json')
db = sqlite3.connect('file:' + str(root / 'runs.db') + '?mode=ro', uri=True)
db.row_factory = sqlite3.Row
issues, checked = [], []
if [r['mode'] for r in results] != manifest['cases']:
    issues.append('manifest-results-case-mismatch')
if db.execute('pragma integrity_check').fetchone()[0] != 'ok':
    issues.append('sqlite-integrity-failed')
for row in results:
    mode, run_id = row['mode'], row['runId']
    report, artifacts = read(root / (mode + '-report.json')), read(root / (mode + '-artifacts.json'))
    stored = dict(db.execute('select * from runs where id=?', (run_id,)).fetchone())
    events = []
    for e in db.execute('select * from run_events where run_id=? order by seq', (run_id,)):
        events.append({'id': e['id'], 'runId': e['run_id'], 'seq': e['seq'], 'type': e['type'],
                       'timestamp': e['timestamp'], 'stepId': e['step_id'], 'actionId': e['action_id'],
                       'payload': json.loads(e['payload']), 'evidenceRefs': json.loads(e['evidence_refs'])})
    if events != report['events']:
        issues.append(mode + ':sqlite-report-events-mismatch')
    if [e['seq'] for e in events] != list(range(len(events))):
        issues.append(mode + ':event-sequence-gap')
    if stored['status'] != row['status'] and not (mode == 'changed-evidence' and stored['status'] == 'interrupted' and row['status'] == 'execution-error'):
        issues.append(mode + ':unexpected-status-projection')
    if report['status'] != row['status'] or report['uiScan']['inspection']['coverage'] != row['coverage'] or report['uiScan']['checkCounts'] != row['counts']:
        issues.append(mode + ':results-report-mismatch')
    frozen = json.loads(stored['spec'])['uiContract']
    # Report contract deliberately projects budget at the report root and adds integrity.
    reported = {k: v for k, v in report['uiScan']['contract'].items() if k != 'integrity'}
    reported['budget'] = report['budget']
    if frozen != reported:
        issues.append(mode + ':frozen-contract-mismatch')
    originals = {a['id']: a for a in db.execute('select * from artifacts where run_id=?', (run_id,))}
    if set(originals) != {a['artifactId'] for a in artifacts}:
        issues.append(mode + ':artifact-index-database-mismatch')
    for a in artifacts:
        path = pathlib.Path(a['path'])
        original = pathlib.Path(originals[a['artifactId']]['file_path'])
        if not path.exists() or not original.exists():
            issues.append(mode + ':missing-artifact:' + a['artifactId'])
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != a['sha256'] or path.stat().st_size != a['bytes'] or path.read_bytes() != original.read_bytes():
            issues.append(mode + ':artifact-byte-mismatch:' + a['artifactId'])
    ui = None
    if mode.startswith('workbench'):
        ui = read(root / (mode + '-ui.json'))
        if ui['errors'] or not ui['historyRestored'] or len(ui['requests']) != 1 or 'requiredChecks' in ui['requests'][0]:
            issues.append(mode + ':workbench-restore-or-request-failed')
        if mode == 'workbench' and 'goal' in ui['requests'][0]:
            issues.append(mode + ':default-form-not-empty-goal')
    checked.append({**{k: v for k, v in row.items() if k != 'items'}, 'databaseStatus': stored['status'],
                    'events': len(events), 'artifacts': len(artifacts),
                    'reportEvents': len(report['events']), 'exactEventMatch': events == report['events'],
                    'reportIsExactPrefix': events[:len(report['events'])] == report['events'],
                    'databaseOnlyTail': events[len(report['events']):],
                    'actualDispatches': sum(e['type'] == 'action:executing' for e in events),
                    'toolFailures': [{'seq': e['seq'], 'payload': e['payload']} for e in events if e['type'] == 'tool:failed'],
                    'uiHistoryRestored': ui['historyRestored'] if ui else None})

maps = []
for path in [root / 'server.mjs.map', workspace / 'dist/server/index.js.map']:
    source_map = read(path)
    matched, mismatched = [], []
    for source, content in zip(source_map['sources'], source_map['sourcesContent']):
        actual = (path.parent / source).resolve()
        (matched if actual.exists() and actual.read_text() == content else mismatched).append(source)
    maps.append({**identity(path), 'matchedSourceCount': len(matched), 'mismatchedSources': mismatched})
    if mismatched:
        issues.append(str(path) + ':source-map-mismatch')

# Preserve all previous attempts and failures in a byte inventory; no archive or rewrite.
inventory = [identity(p) for p in sorted((workspace / 'data/r0-default-check-v2').rglob('*'))
             if p.is_file() and output not in p.parents]
save('inventory.json', inventory)
builds = [identity(p) for p in sorted((workspace / 'dist').rglob('*')) if p.is_file()]
save('dist-inventory.json', builds)
summaries = []
for path in sorted((workspace / 'data/r0-default-check-v2').glob('*.json')):
    data = read(path)
    if 'testResults' in data:
        summaries.append({**identity(path), 'passed': data['numPassedTests'], 'failed': data['numFailedTests'],
                          'failures': [{'file': t['name'], 'name': a['fullName'], 'messages': a.get('failureMessages', [])}
                                       for t in data['testResults'] for a in t['assertionResults'] if a['status'] != 'passed']})
save('unit-history.json', summaries)
summary = {'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
           'inputRoot': str(root), 'auditIssues': issues, 'runs': checked,
           'statusCounts': dict(collections.Counter(r['status'] for r in results)),
           'totalEvents': sum(r['events'] for r in checked), 'totalArtifacts': sum(r['artifacts'] for r in checked),
           'maps': maps, 'sourceIdentityFiles': [identity(workspace / p) for p in ['pnpm-lock.yaml', 'package.json', 'src/execution/versions.ts', 'src/shared/ui-sampling-policy.ts', 'evaluation/ui-default-checks-v2.ts', 'evaluation/ui-contract-v2-fixtures.ts']],
           'retainedServer': identity(root / 'server.mjs'), 'distServer': identity(workspace / 'dist/server/index.js'),
           'inventory': identity(output / 'inventory.json'), 'inventoryFileCount': len(inventory),
           'inventoryBytes': sum(i['bytes'] for i in inventory), 'distInventory': identity(output / 'dist-inventory.json'),
           'limits': ['SQLite comparison verifies this settled batch only; does not close original persistence fault.',
                      'changed-evidence intentionally preserves corrupted source bytes; copy hash agreement is not semantic validity.',
                      'No historical process exit code was retained; completion is established from all manifest rows and persisted terminal records.',
                      'Source maps verify embedded source, not external dependency versions at historical execution time.'],
           'newRealModelCalls': 0, 'newPaidCostUsd': 0}
save('summary.json', summary)
print(json.dumps({'output': str(output), 'issues': issues, 'runs': len(checked),
                  'events': summary['totalEvents'], 'artifacts': summary['totalArtifacts'],
                  'inventoryBytes': summary['inventoryBytes']}))
sys.exit(bool(issues))
