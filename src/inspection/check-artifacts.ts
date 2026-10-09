import { popupArtifactIssues } from './popup-artifacts.ts'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  checkHash,
  checksStatus,
  checksValid,
  reviewPublicSources,
  type PublicCheckPage,
} from './check-contract.ts'
import { projectInspectionScope } from './scope.ts'
import { evaluateInteraction } from '../execution/interaction-verification.ts'
import type { Run, RunEvent } from '../shared/types.ts'
import { cleanEvidenceIntegrity } from '../shared/evidence-integrity.ts'
import { effectKey } from '../execution/default-check-runtime.ts'

/** Additional v4 byte/source/receipt verification, shared by commit and historical API report. */
export async function defaultCheckArtifactIssues(
  run: Run,
  events: readonly RunEvent[],
  artifacts: readonly { id: string; type: string; path: string; metadata: any }[],
): Promise<string[]> {
  if (!run.spec.uiContract?.checkPolicy) return []
  const contract = run.spec.uiContract,
    scope = projectInspectionScope(events),
    issues: string[] = await popupArtifactIssues(run, events, artifacts),
    cache = new Map<string, any>()
  const load = async (ref: string, type?: string) => {
    const a = artifacts.find((a) => a.id === ref)
    if (!a || (type && a.type !== type) || !cleanEvidenceIntegrity(a.metadata?.evidenceIntegrity))
      throw Error('v2-artifact-unowned-or-intervened')
    if (!cache.has(ref)) cache.set(ref, JSON.parse(await readFile(a.path, 'utf8')))
    return cache.get(ref)
  }
  for (const event of events.filter((e) => e.type === 'interaction:sources-reviewed-v2'))
    for (const [ref, hash] of Object.entries(
      (event.payload.evidenceHashes as Record<string, string>) ?? {},
    )) {
      const a = artifacts.find((a) => a.id === ref)
      if (
        !a ||
        createHash('sha256')
          .update(await readFile(a.path))
          .digest('hex') !== hash
      )
        issues.push('v2-source-bytes-changed')
    }
  for (const frozen of events.filter((e) => e.type === 'scope:sampling-frozen')) {
    const reviewed = events.find(
      (e) =>
        e.type === 'interaction:page-sources-reviewed-v2' && e.payload.url === frozen.payload.url,
    )
    if (!reviewed) issues.push('v2-page-source-review-missing')
    else
      try {
        const page = await load(String(reviewed.payload.pageRef), 'check-source-observation')
        if (
          checkHash(page) !== reviewed.payload.pageHash ||
          (events.some(
            (e) => e.type === 'finish:accepted' && e.payload.reasonCode === 'scope-covered',
          ) &&
            !page.complete)
        )
          issues.push('v2-page-source-review-incomplete')
      } catch {
        issues.push('v2-page-source-review-unreadable')
      }
  }
  for (const item of scope.snapshot().items.filter((i) => i.selected && i.checks)) {
    const c = item.checks!
    try {
      if (!checksValid(c) || checksStatus(c) !== item.status)
        throw Error('v2-facet-projection-invalid')
      if (c.sourceReview.state === 'pending' && !c.sourceReview.page) continue
      const source = await Promise.all(
        c.sourceReview.refs
          .filter((ref) => artifacts.find((a) => a.id === ref)?.type === 'check-source-observation')
          .map((ref) => load(ref, 'check-source-observation')),
      )
      if (!source.some((page) => checkHash(page) === checkHash(c.sourceReview.page)))
        throw Error('v2-source-page-bytes-mismatch')
      const page = c.sourceReview.page!,
        control =
          page.nodes.find((n) => c.effects.some((e) => e.controlBinding.selector === n.selector)) ??
          page.nodes.find((n) => {
            const candidate = events.find(
              (e) => e.type === 'scope:candidate-bound' && e.payload.itemId === item.itemId,
            )
            return (
              !!candidate &&
              item.basis.includes('"' + n.name + '"') &&
              ['button', 'input', 'select', 'textarea', 'summary'].includes(n.tag)
            )
          })
      for (const rule of c.sourceReview.ruleChecks ?? [])
        if (
          !rule.scopeItemIds.length ||
          rule.scopeItemIds.some(
            (id) =>
              !scope
                .snapshot()
                .items.some(
                  (i) =>
                    i.itemId === id &&
                    i.category === 'automatic-check' &&
                    i.ruleRevision === rule.revision &&
                    i.basis === `automatic rule ${rule.ruleId} applies to the observed state`,
                ),
          )
        )
          throw Error('v2-approved-rule-scope-binding-invalid')
      const admittedBefore = new Set<string>(),
        admittedAfter = new Set<string>()
      if (control) {
        const required =
          contract.requiredChecks?.filter((r) =>
            events.some(
              (e) =>
                e.type === 'scope:required-bound' &&
                e.payload.itemId === item.itemId &&
                e.payload.requiredId === r.id,
            ),
          ) ?? []
        const reconstructed = reviewPublicSources({
          contract,
          page,
          control,
          refs: c.sourceReview.refs,
          required,
        })
        for (const e of reconstructed.effects) admittedBefore.add(effectKey(e))
        for (const e of reconstructed.effects)
          if (!c.effects.some((actual) => effectKey(actual) === effectKey(e)))
            throw Error('v2-public-requirement-not-registered')
        if (reconstructed.sourceReview.state === 'unresolved' && c.sourceReview.state === 'sealed')
          throw Error('v2-source-review-forged-sealed')
      }
      if (['collected', 'failed'].includes(c.generic.state)) {
        if (c.generic.state === 'failed') {
          const probe = await load(c.generic.receiptRef!, 'probe-measurement')
          if (
            probe.outcome !== 'intercepted' ||
            probe.itemId !== item.itemId ||
            probe.actionId !== c.generic.actionId
          )
            throw Error('v2-physical-failure-not-corroborated')
        } else {
          const body = await load(c.generic.receiptRef!, 'generic-interaction')
          const event = events.find(
            (e) =>
              e.type === 'interaction:generic-collected-v2' &&
              e.payload.itemId === item.itemId &&
              e.payload.receiptRef === c.generic.receiptRef,
          )
          const action = events.find(
              (e) => e.type === 'action:executing' && e.actionId === body.actionId,
            ),
            done = events.find((e) => e.type === 'action:completed' && e.actionId === body.actionId)
          if (
            !event ||
            !action ||
            !done ||
            event.payload.receiptHash !== checkHash(body) ||
            body.itemId !== item.itemId ||
            body.actionId !== c.generic.actionId ||
            body.contractHash !== contract.hash ||
            !(action.seq < done.seq && done.seq < event.seq)
          )
            throw Error('v2-generic-action-association-invalid')
          if (
            !body.before?.page?.complete ||
            body.after?.length !== 2 ||
            body.after.some((s: any) => !s.page?.complete) ||
            body.after[1].at - body.after[0].at < 900 ||
            !body.sameDocument ||
            body.integrity !== 'clean' ||
            !body.rulesSettled ||
            body.feedback === 'indeterminate'
          )
            throw Error('v2-generic-receipt-incomplete')
          for (const sample of [body.before, ...body.after]) {
            const refs = sample.refs.filter(
              (ref: string) =>
                artifacts.find((a) => a.id === ref)?.type === 'check-source-observation',
            )
            if (
              refs.length !== 1 ||
              checkHash(await load(refs[0], 'check-source-observation')) !== checkHash(sample.page)
            )
              throw Error('v2-feedback-sample-bytes-mismatch')
          }
          const lastPage = body.after[1].page as PublicCheckPage,
            postControl = lastPage.nodes.find(
              (n) => n.selector === body.controlSelector || n.path === body.controlSelector,
            )
          if (postControl) {
            const post = reviewPublicSources({
              contract,
              page: lastPage,
              control: postControl,
              refs: body.after[1].refs,
              required:
                contract.requiredChecks?.filter((r) =>
                  events.some(
                    (e) =>
                      e.type === 'scope:required-bound' &&
                      e.payload.itemId === item.itemId &&
                      e.payload.requiredId === r.id,
                  ),
                ) ?? [],
            })
            for (const e of post.effects) admittedAfter.add(effectKey(e))
            for (const req of post.effects)
              if (!c.effects.some((e) => effectKey(e) === effectKey(req)))
                throw Error('v2-late-source-not-registered')
          }
          if (
            events.some(
              (e) => e.seq > action.seq && e.seq < event.seq && e.type === 'action:executing',
            )
          )
            throw Error('v2-generic-intervening-action')
        }
      }
      for (const req of c.effects)
        if (!(req.late ? admittedAfter : admittedBefore).has(effectKey(req)))
          throw Error('v2-effect-source-not-admitted')
      for (const req of c.effects)
        if (['verified', 'failed'].includes(req.state)) {
          if (req.late) throw Error('v2-late-effect-retrospectively-discharged')
          const sourceEvent = events.find(
            (e) =>
              e.type === 'scope:item-updated' &&
              e.payload.itemId === item.itemId &&
              (e.payload.checks as any)?.effects?.some(
                (x: any) => x.requirementId === req.requirementId,
              ),
          )
          const measured = events.find(
            (e) =>
              e.type === 'interaction:effect-measured-v2' &&
              e.payload.itemId === item.itemId &&
              e.payload.requirementId === req.requirementId &&
              req.measurementRefs.includes(String(e.payload.measurementRef)),
          )
          const action =
            measured &&
            events.find((e) => e.type === 'action:executing' && e.actionId === measured.actionId)
          if (!sourceEvent || !measured || !action || sourceEvent.seq >= action.seq)
            throw Error('v2-effect-source-not-pre-action')
          const body = await load(String(measured.payload.measurementRef), 'measurement')
          if (
            body.requirementHash !== req.requirementHash ||
            body.actionId !== measured.actionId ||
            (c.generic.actionId !== undefined && body.actionId !== c.generic.actionId) ||
            body.itemId !== item.itemId ||
            body.outcome !== req.state ||
            measured.payload.sha256 !== checkHash(body)
          )
            throw Error('v2-effect-receipt-invalid')
          const expected = {
            ...req.predicate,
            selector: body.measurement.input.selector,
            basis: body.measurement.input.basis,
          }
          if (req.predicate.selector && expected.selector !== req.predicate.selector)
            throw Error('v2-effect-result-substituted')
          if (
            checkHash(body.measurement.input) !== checkHash(expected) ||
            evaluateInteraction(expected, body.measurement.measured) !== req.state
          )
            throw Error('v2-effect-predicate-replay-invalid')
          if (
            req.state === 'failed' &&
            (req.evaluationPoint !== 'action-complete' ||
              !events.some(
                (e) =>
                  e.type === 'interaction:effect-finding-v2' &&
                  e.payload.requirementId === req.requirementId &&
                  e.payload.itemId === item.itemId &&
                  e.payload.measurementRef === measured.payload.measurementRef,
              ))
          )
            throw Error('v2-effect-failure-without-basis-or-finding')
        }
    } catch (error) {
      issues.push(String(error instanceof Error ? error.message : error) + ':' + item.itemId)
    }
  }
  return [...new Set(issues)]
}
