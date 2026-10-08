"""Evaluation side only; run only after reference and baseline have been frozen."""
import datetime,hashlib,json,pathlib,subprocess,sys
root=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(__file__).resolve().parent
read=lambda p:json.loads(p.read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
freeze=read(out/'baseline-freeze.json')
assert sha((out/'baseline/baseline.json').read_bytes())==freeze['baselineSha256']
assert sha((out/'reference.frozen.json').read_bytes())==freeze['referenceSha256']
source_commit='b266089d8a46b0394e39220f66ac85260b4b19ef'
baseline=read(out/'baseline/baseline.json');coverage=read(out/'coverage-before-baseline.json')
rows=[];index=[]
for state in baseline['states']:
 sid=state['id'];rel=f'plans/evidence/r0-public-decision-states/evaluation/{sid}.json'
 raw=(root/rel).read_bytes();e=json.loads(raw)
 assert raw==subprocess.check_output(['git','show',f'{source_commit}:{rel}'],cwd=root)
 x=read(out/f'source-public/inputs/{sid}.json');p=read(out/f'source-public/public/{sid}.json')
 assert e['stateId']==sid and e['runId']==p['runId'] and e['eventCutoffSeq']==p['eventCutoffSeq']
 assert e['modelStartSeq']>p['eventCutoffSeq'] and e['neverIncludeInJevInput'] is True
 assert all(c['eventSeq']>e['modelStartSeq'] for c in e['originalChoice'])
 dest=out/'evaluation-only'/f'{sid}.json';dest.parent.mkdir(exist_ok=True);dest.write_bytes(raw)
 index.append(dict(path=f'evaluation-only/{sid}.json',sha256=sha(raw)))
 mapped=[]
 for c in e['originalChoice']:
  args=c['args'];matches=[v for v in x['candidates'] if json.loads(v['context'])['ref']==args.get('ref')]
  if c['tool']=='page_act' and args.get('type')=='click' and len(matches)==1 and 'click' in matches[0]['allowedActions']:
   v=matches[0];ctx=json.loads(v['context'])
   mapped.append(dict(kind='candidate',candidateId=v['id'],action='click',text=v['text'],ref=args['ref'],pointsToPendingSelectedObligation=ctx['selected'] and ctx['status']=='pending',executableAtCutoff='unknown'))
  else:
   reason='fill-outside-click-inspect' if args.get('type')=='fill' else 'batch-details-not-one-candidate-inspect' if c['tool']=='element_details' else 'page-or-selector-read-not-one-candidate-inspect'
   mapped.append(dict(kind='unmapped',reason=reason,rawTool=c['tool']))
 cov=next(s for s in coverage if s['id']==sid)
 rows.append(dict(id=sid,cutoff=p['eventCutoffSeq'],remainingTimeLowerMs=p['budget']['remainingMs'],
  historicalChoices=mapped,programChoice=state['choice'],eligibleCount=len(state['eligibleCandidateIds']),jev='not-run-no-eligible-comparison',
  pendingSelectedClickObligations=cov['clickObligationsBeforeAdmission'],fillObligationsOutsideContract=cov['fillObligationsOutsideContract'],
  programMetrics=dict(admissionReferenceConsistent=True,proposesAdvancingCandidate=False,unjustifiedRepeatProposed=False,recognizesMissingPrerequisites=True,handoffConsistentWithDevelopmentReference=True),
  historicalQualityMetrics=dict(advancesExecutableObligation=None,unjustifiedRepeat=None,recognizesMissingPrerequisites=None,correctHandoff=None),
  comparisonVerdict='insufficient-admission-facts; no ranking superiority inferred'))
report=dict(evaluatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),sourceEvaluationCommit=source_commit,
 baselineSha256=freeze['baselineSha256'],referenceSha256=freeze['referenceSha256'],referenceStatus='development-only; human review absent',
 denominatorDefinitions={
  'parsedStates':8,'cutoffSourceVerifiedStates':8,'currentCandidates':sum(s['currentCandidates'] for s in coverage),
  'selectedPendingClickObligationsBeforeAdmission':sum(len(s['clickObligationsBeforeAdmission']) for s in coverage),
  'strictProgramHandoffs':8,'programCandidateChoices':0,'programMultiEligibleStates':0,
  'historicalStatesWithExactClickMapping':sum(len(s['historicalChoices'])==1 and s['historicalChoices'][0]['kind']=='candidate' for s in rows),
  'historicalTotalStates':8,'historicalTotalToolCalls':sum(len(s['historicalChoices']) for s in rows),
  'historicalMappedToolCalls':sum(c['kind']=='candidate' for s in rows for c in s['historicalChoices']),
  'historicalUnmappedStates':sum(any(c['kind']=='unmapped' for c in s['historicalChoices']) for s in rows),
  'comparableRankingQualityPairs':0,'independentlyHumanReviewedStates':0,'newExecutedBrowserActions':0,
  'jevCalls':0},states=rows,
 decision='Do not prepare Jev requests. Program sufficiency is unproven: missing action admission facts collapse the baseline to handoff. Do not label all handoffs as task success.',
 sourceFiles=index)
(out/'comparison.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report['denominatorDefinitions']))
