import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Independent v2 evaluator. No imports from production scope, source/reducer, proof or predicates.
export const UI_DEFAULT_CHECKS_PROTOCOL = 'ui-default-checks-3'
export const UI_V2_FIXTURE_REVISION = 'ui-contract-v2-fixtures-1'
const canonical = (x: any): string =>
  Array.isArray(x)
    ? '[' + x.map(canonical).join(',') + ']'
    : x && typeof x === 'object'
      ? '{' +
        Object.entries(x)
          .filter(([, v]) => v !== undefined)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
          .join(',') +
        '}'
      : JSON.stringify(x)
const hash = (x: any) => createHash('sha256').update(canonical(x)).digest('hex')
function outcome(input: any, measured: any) {
  if (!measured?.supported || measured.values?.length !== measured.count) return 'unverified'
  const values = measured.values as (string | null)[]
  if (input.condition?.startsWith('numeric-')) {
    const numbers = values.map((v) =>
      typeof v === 'string' && /^[-+]?\d+(\.\d+)?$/.test(v) ? Number(v) : NaN,
    )
    if (numbers.length < 2 || numbers.some((n) => !Number.isFinite(n))) return 'unverified'
    return numbers.every(
      (n, i) =>
        !i ||
        (input.condition === 'numeric-ascending' ? numbers[i - 1]! <= n : numbers[i - 1]! >= n),
    )
      ? 'verified'
      : 'failed'
  }
  if (input.condition === 'count-equals')
    return measured.count === Number(input.expected) ? 'verified' : 'failed'
  if (values.length !== 1 || values[0] === null) return 'unverified'
  const pass =
    input.condition === 'text-contains'
      ? values[0]!.includes(input.expected)
      : input.condition === 'visible'
        ? values[0] === 'true'
        : values[0] === input.expected
  return pass ? 'verified' : 'failed'
}
export interface V2PublicRow {
  id: string
  protocol: typeof UI_DEFAULT_CHECKS_PROTOCOL
  fixtureRevision: typeof UI_V2_FIXTURE_REVISION
  kind: 'healthy' | 'anomaly' | 'partial'
  unspecifiedPermitted: boolean
  requiredEffectMinimum: number
}
export const UI_V2_PUBLIC_MATRIX: readonly V2PublicRow[] = [
  {
    id: 'H0',
    protocol: UI_DEFAULT_CHECKS_PROTOCOL,
    fixtureRevision: UI_V2_FIXTURE_REVISION,
    kind: 'healthy',
    unspecifiedPermitted: true,
    requiredEffectMinimum: 0,
  },
  {
    id: 'H1',
    protocol: UI_DEFAULT_CHECKS_PROTOCOL,
    fixtureRevision: UI_V2_FIXTURE_REVISION,
    kind: 'healthy',
    unspecifiedPermitted: false,
    requiredEffectMinimum: 1,
  },
  {
    id: 'H2',
    protocol: UI_DEFAULT_CHECKS_PROTOCOL,
    fixtureRevision: UI_V2_FIXTURE_REVISION,
    kind: 'healthy',
    unspecifiedPermitted: false,
    requiredEffectMinimum: 1,
  },
  {
    id: 'A1',
    protocol: UI_DEFAULT_CHECKS_PROTOCOL,
    fixtureRevision: UI_V2_FIXTURE_REVISION,
    kind: 'anomaly',
    unspecifiedPermitted: false,
    requiredEffectMinimum: 1,
  },
  {
    id: 'A2',
    protocol: UI_DEFAULT_CHECKS_PROTOCOL,
    fixtureRevision: UI_V2_FIXTURE_REVISION,
    kind: 'anomaly',
    unspecifiedPermitted: true,
    requiredEffectMinimum: 0,
  },
  {
    id: 'B1',
    protocol: UI_DEFAULT_CHECKS_PROTOCOL,
    fixtureRevision: UI_V2_FIXTURE_REVISION,
    kind: 'partial',
    unspecifiedPermitted: true,
    requiredEffectMinimum: 0,
  },
]
/** Frozen PUBLIC row identity precedes execution; result quality is rebuilt from actual artifacts. */
export async function auditUiDefaultChecksV2(input: {
  row: V2PublicRow
  report: any
  artifacts: readonly { id: string; type: string; path: string }[]
}) {
  const { report, row, artifacts } = input,
    issues: string[] = [],
    events = report.events ?? [],
    items = new Map<string, any>(),
    cache = new Map<string, any>()
  const load = async (ref: string, type: string) => {
    const a = artifacts.find((a) => a.id === ref && a.type === type)
    if (!a) throw Error('missing ' + type)
    if (!cache.has(ref)) cache.set(ref, JSON.parse(await readFile(a.path, 'utf8')))
    return cache.get(ref)
  }
  if (
    row.protocol !== UI_DEFAULT_CHECKS_PROTOCOL ||
    row.fixtureRevision !== UI_V2_FIXTURE_REVISION ||
    report.uiScan?.contract.policyRevision !== 'url-scan-default-4'
  )
    issues.push('protocol-not-v2')
  for (const e of events) {
    if (e.type === 'scope:item-created') items.set(e.payload.itemId, { ...e.payload })
    if (e.type === 'scope:item-updated' && items.has(e.payload.itemId))
      items.set(e.payload.itemId, { ...items.get(e.payload.itemId), ...e.payload })
  }
  const selected = [...items.values()].filter((i) => i.selected)
  if (
    row.kind !== 'partial' &&
    (report.status !== 'completed' ||
      report.uiScan?.inspection.coverage !== 'covered' ||
      !events.some(
        (e: any) => e.type === 'finish:accepted' && e.payload.reasonCode === 'scope-covered',
      ))
  )
    issues.push('required-completion-missing')
  if (
    events.some((e: any) =>
      [
        'run:cancel-requested',
        'run:storage-inconsistent',
        'execution:intervention',
        'action:failed',
      ].includes(e.type),
    ) &&
    row.kind !== 'partial'
  )
    issues.push('priority-fault')
  let requiredEffects = 0,
    concludedEffects = 0,
    validFailures = 0,
    genericCount = 0,
    unspecifiedCount = 0
  for (const i of selected.filter((i) => i.category === 'local-interaction')) {
    try {
      const c = i.checks
      if (c?.revision !== 'item-checks-2' || !c.sourceReview?.page)
        throw Error('missing-item-checks')
      const reqs = c.effects ?? []
      requiredEffects += reqs.length
      if (c.sourceReview.state !== 'sealed' && row.kind !== 'partial')
        throw Error('source-review-incomplete')
      const beforePages = await Promise.all(
        c.sourceReview.refs
          .filter(
            (r: string) => artifacts.find((a) => a.id === r)?.type === 'check-source-observation',
          )
          .map((r: string) => load(r, 'check-source-observation')),
      )
      if (!beforePages.some((p) => hash(p) === hash(c.sourceReview.page)))
        throw Error('source-reference-not-actual')
      const control =
        c.sourceReview.page.nodes.find((n: any) =>
          reqs.some((e: any) => e.controlBinding.selector === n.selector),
        ) ??
        c.sourceReview.page.nodes.find(
          (n: any) =>
            i.basis.includes('"' + n.name + '"') &&
            ['button', 'input', 'select', 'textarea', 'summary'].includes(n.tag),
        )
      const goal = report.uiScan.contract.requestedGoal?.trim()
        ? report.uiScan.contract.requestedGoal
        : report.uiScan.contract.goal
      const explicit =
        /^(?:Synchronously )?after clicking "([^"]+)", show text(?: exactly)? "([^"]+)"[.!]?$/i.exec(
          goal,
        )
      if (
        explicit &&
        control?.name === explicit[1] &&
        !reqs.some(
          (r: any) => r.sourceKind === 'original-goal' && r.predicate.expected === explicit[2],
        )
      )
        throw Error('goal-requirement-omitted')
      const described = control?.attributes?.['aria-describedby']?.split(/\s+/) ?? []
      for (const id of described) {
        const p = c.sourceReview.page.nodes.find((n: any) => n.attributes.id === id)
        if (
          p &&
          /numbers in its controlled list must be (ascending|descending)/.test(p.text) &&
          !reqs.some(
            (r: any) =>
              r.sourceKind === 'page-declaration' && r.sourceId === 'page-description:' + id,
          )
        )
          throw Error('page-requirement-omitted')
      }
      const aliases = events.filter(
        (e: any) => e.type === 'scope:required-bound' && e.payload.itemId === i.itemId,
      )
      for (const alias of aliases)
        if (
          !reqs.some(
            (r: any) =>
              r.sourceKind === 'required-check' && r.sourceId === alias.payload.requiredId,
          )
        )
          throw Error('advanced-requirement-omitted')
      if (!reqs.length) {
        unspecifiedCount++
        if (!row.unspecifiedPermitted) throw Error('unspecified-not-permitted-by-frozen-row')
      }
      if (c.generic.state === 'collected') {
        const body = await load(c.generic.receiptRef, 'generic-interaction'),
          record = events.find(
            (e: any) =>
              e.type === 'interaction:generic-collected-v2' &&
              e.payload.receiptRef === c.generic.receiptRef,
          )
        const act = events.find(
            (e: any) => e.type === 'action:executing' && e.actionId === body.actionId,
          ),
          done = events.find(
            (e: any) => e.type === 'action:completed' && e.actionId === body.actionId,
          )
        if (
          !act ||
          !done ||
          !record ||
          !(act.seq < done.seq && done.seq < record.seq) ||
          record.payload.receiptHash !== hash(body) ||
          body.itemId !== i.itemId ||
          body.actionId !== c.generic.actionId
        )
          throw Error('generic-not-from-original-real-action')
        if (
          !body.before?.page.complete ||
          body.after?.length !== 2 ||
          body.after.some((s: any) => !s.page.complete) ||
          body.after[1].at - body.after[0].at < 900 ||
          !body.rulesSettled ||
          !body.sameDocument ||
          body.integrity !== 'clean' ||
          body.feedback === 'indeterminate'
        )
          throw Error('generic-incomplete')
        for (const sample of [body.before, ...body.after]) {
          const refs = sample.refs.filter(
            (r: string) => artifacts.find((a) => a.id === r)?.type === 'check-source-observation',
          )
          if (
            refs.length !== 1 ||
            hash(await load(refs[0], 'check-source-observation')) !== hash(sample.page)
          )
            throw Error('forged-generic-sample')
        }
        genericCount++
      } else if (c.generic.state === 'failed') {
        const probe = await load(c.generic.receiptRef, 'probe-measurement')
        if (
          probe.outcome !== 'intercepted' ||
          probe.itemId !== i.itemId ||
          probe.actionId !== c.generic.actionId
        )
          throw Error('invalid-physical-defect')
        if (
          !report.findings.some(
            (f: any) => f.validationStatus === 'supported' && f.ruleId === 'overlay-blocking',
          )
        )
          throw Error('physical-defect-finding-missing')
        genericCount++
        validFailures++
      } else if (row.kind !== 'partial') throw Error('generic-not-completed')
      for (const r of reqs) {
        if (!['verified', 'failed'].includes(r.state)) {
          if (row.kind !== 'partial') throw Error('required-effect-unfinished')
          continue
        }
        if (r.late) throw Error('late-effect-illegally-concluded')
        const event = events.find(
          (e: any) =>
            e.type === 'interaction:effect-measured-v2' &&
            e.payload.requirementId === r.requirementId &&
            r.measurementRefs.includes(e.payload.measurementRef),
        )
        if (!event) throw Error('effect-measurement-missing')
        const body = await load(event.payload.measurementRef, 'measurement')
        if (
          hash(body) !== event.payload.sha256 ||
          body.requirementHash !== r.requirementHash ||
          body.actionId !== c.generic.actionId ||
          outcome(body.measurement.input, body.measurement.measured) !== r.state
        )
          throw Error('effect-measurement-invalid')
        if (
          body.measurement.input.condition !== r.predicate.condition ||
          body.measurement.input.expected !== r.predicate.expected
        )
          throw Error('effect-predicate-substituted')
        concludedEffects++
        if (r.state === 'failed') {
          const evidence = events.find(
            (e: any) =>
              e.type === 'interaction:effect-finding-v2' &&
              e.payload.requirementId === r.requirementId,
          )
          if (
            r.evaluationPoint !== 'action-complete' ||
            !evidence ||
            !report.findings.some(
              (f: any) =>
                f.id === evidence.payload.findingId &&
                f.validationStatus === 'supported' &&
                f.evidenceRefs.includes(event.payload.measurementRef),
            )
          )
            throw Error('invalid-effect-finding')
          validFailures++
        }
      }
    } catch (error) {
      issues.push((error as Error).message + ':' + i.itemId)
    }
  }
  for (const frozen of events.filter((e: any) => e.type === 'scope:sampling-frozen')) {
    const p = frozen.payload,
      defaultIds = [
        ...new Set(
          events
            .filter(
              (e: any) =>
                e.type === 'scope:sampling-default-selected' &&
                e.payload.registrationItemId === p.itemId,
            )
            .flatMap((e: any) => e.payload.itemIds),
        ),
      ]
    if (
      defaultIds.length > p.count ||
      defaultIds.some((id) => !p.pool.includes(id)) ||
      (row.kind !== 'partial' && defaultIds.length !== p.count)
    )
      issues.push('default-denominator-incomplete')
    if (p.pool.some((id: string) => !items.has(id))) issues.push('default-item-omitted')
    // Rebuild the first native candidate denominator from actual public snapshot, not claimed count.
    try {
      const snapshotRef = frozen.evidenceRefs.find(
        (r: string) => artifacts.find((a) => a.id === r)?.type === 'snapshot',
      )
      const snapshot = await load(snapshotRef, 'snapshot')
      const offered = snapshot.elements.filter(
        (n: any) =>
          n.visible &&
          n.enabled &&
          ['button', 'a', 'input', 'select', 'textarea', 'summary'].includes(n.tag) &&
          !n.interactionExcludedReason,
      )
      const bounded = offered.slice(0, 8),
        link = offered.find((n: any) => n.tag === 'a' && n.attributes.href)
      if (link && !bounded.some((n: any) => n.tag === 'a')) bounded[bounded.length - 1] = link
      if (
        p.candidates.length !== bounded.length ||
        p.count !== Math.min(3, bounded.filter((n: any) => n.tag !== 'a').length)
      )
        issues.push('public-pool-denominator-forged')
    } catch {
      issues.push('first-public-snapshot-unreadable')
    }
  }
  if (requiredEffects < row.requiredEffectMinimum) issues.push('frozen-public-effects-missing')
  const supported = report.findings?.filter((f: any) => f.validationStatus === 'supported') ?? []
  if (row.kind === 'healthy' && supported.length) issues.push('healthy-false-positive')
  if (row.kind === 'anomaly' && (!supported.length || !validFailures))
    issues.push('anomaly-valid-finding-missing')
  if (
    row.kind !== 'partial' &&
    !genericCount &&
    selected.some((i) => i.category === 'local-interaction')
  )
    issues.push('all-generic-unknown')
  return {
    protocol: UI_DEFAULT_CHECKS_PROTOCOL,
    accepted: issues.length === 0,
    issues: [...new Set(issues)],
    genericCount,
    requiredEffects,
    concludedEffects,
    unspecifiedCount,
    validFailures,
  }
}
