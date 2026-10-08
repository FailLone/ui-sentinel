/** Fixed eight-state offline experiment. Deliberately no run/model/transport options. */
import { readFileSync, mkdirSync } from 'node:fs'
import { join, resolve, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { z } from 'zod'
import { sha256 } from '../../src/agent/decisions/jev-provider/profile.ts'
import { exportSchema } from './pilot.ts'
import { ADVICE_VERSION, makeAdvicePacket, rankOfflineAdvice } from './offline-advice.ts'
import { writeJson, sealEvidence } from '../r1-jev-real/evidence.ts'
const source = 'plans/r1-decision-pilot/r0-eight-state-20261008'
const referencePath = 'plans/r1-decision-pilot/offline-advice-v1/reference.frozen.json'
const referenceDigest = '309b9d051e681f2efc2477aa070503580fc2fccee7566f9b4b2a904ce1f079b5'
const args = process.argv.slice(2)
if (args.length !== 2 || args[0] !== '--output')
  throw new Error('only --output NEW_WORKSPACE_DIRECTORY is supported')
const output = resolve(args[1])
const rel = relative(process.cwd(), output)
if (!rel || rel.startsWith('..')) throw new Error('output-outside-workspace')
const json = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
if (sha256(readFileSync(referencePath)) !== referenceDigest)
  throw new Error('reference-not-frozen-version')
const reference = json(referencePath)
if (
  reference.experimentVersion !== ADVICE_VERSION ||
  reference.sourceIndexSha256 !== sha256(readFileSync(join(source, 'source-public/index.json')))
)
  throw new Error('source-index-binding')
const frozen = json(join(source, 'freeze.json'))
const mappedPath = join(source, 'mapped-public.json')
if (sha256(readFileSync(mappedPath)) !== frozen.mappedPublicSha256)
  throw new Error('mapped-input-changed')
const data = exportSchema.parse(json(mappedPath))
const ids = Array.from({ length: 8 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`)
if (
  JSON.stringify(data.states.map((s) => s.id)) !== JSON.stringify(ids) ||
  JSON.stringify(reference.cases.map((s: any) => s.id)) !== JSON.stringify(ids)
)
  throw new Error('fixed-eight-states-only')
const index = json(join(source, 'source-public/index.json'))
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const sourceDirty =
  execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim() !== ''
mkdirSync(output, { recursive: false })
const rows = data.states.map((state) => {
  const entry = index.states.find((s: any) => s.stateId === state.id)
  const publicPath = join(source, `source-public/public/${state.id}.json`)
  const inputPath = join(source, `source-public/inputs/${state.id}.json`)
  if (
    sha256(readFileSync(publicPath)) !== entry.publicSha256 ||
    sha256(readFileSync(inputPath)) !== entry.inputSha256 ||
    JSON.stringify(state.input) !== JSON.stringify(json(inputPath))
  )
    throw new Error('source-content-binding')
  const packet = makeAdvicePacket(state, json(publicPath))
  const result = rankOfflineAdvice(packet)
  const ref = reference.cases.find((s: any) => s.id === state.id)
  const acceptable = z.array(z.string()).nullable().parse(ref.acceptableInvestigationCandidates)
  if (acceptable?.some((id) => !packet.candidates.some((c) => c.candidateId === id)))
    throw new Error('reference-candidate-binding')
  // Unknown is not a failure. Reliable set membership does not imply discriminating rank labels.
  const reasonable =
    ref.referenceStatus === 'unknown' || !acceptable
      ? null
      : acceptable.includes(result.selectedCandidateId ?? '')
  const discriminating =
    reasonable !== null &&
    packet.candidates.length > 1 &&
    acceptable!.length < packet.candidates.length &&
    ref.discriminatesPriority === true
  writeJson(join(output, 'shared-facts', `${state.id}.json`), packet)
  writeJson(join(output, 'advice', `${state.id}.json`), result)
  return {
    id: state.id,
    candidateCount: packet.candidates.length,
    orderedCandidateIds: result.priorities.map((c) => c.candidateId),
    selectedCandidateId: result.selectedCandidateId,
    selectedText: result.priorities[0]?.text ?? null,
    candidateFactsSha256: result.sharedPacketSha256,
    referenceStatus: ref.referenceStatus,
    priorityReasonable: reasonable,
    discriminatingRankingReference: discriminating,
    completeExecutionPath: 'unknown',
    directlyExecutable: false,
    verifiedProgress: false,
    excluded: packet.excluded,
    referenceReason: ref.reason,
  }
})
const evaluable = rows.filter((r) => r.priorityReasonable !== null)
const discriminating = rows.filter((r) => r.discriminatingRankingReference)
writeJson(join(output, 'report.json'), {
  version: ADVICE_VERSION,
  sourceSha,
  sourceDirty,
  referenceSha256: referenceDigest,
  sourceIndexSha256: reference.sourceIndexSha256,
  review: 'development-only; not independent or blind',
  states: rows,
  denominators: {
    states: 8,
    statesWithAdvice: rows.filter((r) => r.selectedCandidateId).length,
    structuralMultiCandidateStates: rows.filter((r) => r.candidateCount > 1).length,
    priorityReferenceKnown: evaluable.length,
    priorityReferenceUnknown: 8 - evaluable.length,
    reasonableAdvice: evaluable.filter((r) => r.priorityReasonable).length,
    discriminatingRankingStates: discriminating.length,
    humanIndependentlyReviewed: 0,
    completeExecutionPathsEstablished: 0,
    executionPathUnknown: 8,
    verifiedProgress: 0,
    realJevCalls: 0,
  },
  stop: discriminating.length === 0,
  stopReason:
    discriminating.length === 0
      ? 'no-reliable-discriminating-priority-reference'
      : 'review-before-any-model-preparation',
  historicalComparison:
    'Previous 3/8 exact click mapping remains separate; it does not remove other states from new advice evaluation.',
  paidRequestList: [],
  networkRequests: 0,
})
writeJson(join(output, 'reference.json'), reference)
sealEvidence(output)
console.log(
  JSON.stringify({
    mode: ADVICE_VERSION,
    states: 8,
    priorityReferenceKnown: evaluable.length,
    discriminatingRankingStates: discriminating.length,
    realModelCalls: 0,
    stop: discriminating.length === 0,
  }),
)
