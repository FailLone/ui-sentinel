import { popupFocusIntent } from '../shared/popup-policy.ts'
import { explorationRevisitIntent } from '../shared/r1-policy.ts'
import { createHash } from 'node:crypto'
import { UI_DEFAULT_GOAL } from '../shared/ui-goal.ts'
import type { RequiredCheck, UiContractSnapshot } from './contract.ts'
import type { InteractionVerification } from '../execution/interaction-verification.ts'

export const CHECKS_REVISION = 'item-checks-2' as const
export function checkHash(v: unknown): string {
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
  return createHash('sha256').update(canonical(v)).digest('hex')
}
export interface PublicNode {
  selector: string
  path?: string
  parentSelector?: string
  leaf?: boolean
  incidental?: boolean
  tag: string
  name: string
  text: string
  visible: boolean
  attributes: Record<string, string>
  value?: string
  selectedLabel?: string
  truncated: boolean
}
export interface PublicCheckPage {
  url: string
  documentVersion: string
  nodes: PublicNode[]
  total: number
  complete: boolean
}
export interface EffectRequirement {
  requirementId: string
  requirementHash: string
  sourceKind: 'original-goal' | 'required-check' | 'page-declaration' | 'approved-rule'
  sourceId: string
  sourceHash: string
  sourceRefs: string[]
  sourceSpan: [number, number]
  sourceText: string
  documentVersion: string
  controlBinding: { selector: string; name: string; tag: string }
  actionContract: { type: 'click' | 'fill'; value?: string }
  relationKind: string
  predicate: Omit<InteractionVerification, 'basis' | 'selector'> & { selector?: string }
  evaluationPoint: 'action-complete' | 'positive-only'
  late: boolean
  state: 'pending' | 'verified' | 'failed' | 'unverified'
  measurementRefs: string[]
  eventIds: string[]
}
export interface ItemChecks {
  revision: typeof CHECKS_REVISION
  sourceReview: {
    state: 'pending' | 'sealed' | 'unresolved'
    revision: 'public-effect-sources-1'
    refs: string[]
    hash: string
    reasons: string[]
    page?: PublicCheckPage
    goalHash?: string
    contractHash?: string
    ruleChecks?: {
      ruleId: string
      revision: string
      contentHash: string
      approvalRef: string
      scopeItemIds: string[]
      evidenceRefs: string[]
    }[]
  }
  generic: {
    state: 'pending' | 'collected' | 'failed' | 'unverified'
    actionId?: string
    checkRef?: string
    receiptRef?: string
    feedback?: 'change-observed' | 'no-change-observed' | 'indeterminate'
    evidenceRefs: string[]
    eventIds: string[]
  }
  effects: EffectRequirement[]
}
export const emptyChecks = (): ItemChecks => ({
  revision: CHECKS_REVISION,
  sourceReview: {
    state: 'pending',
    revision: 'public-effect-sources-1',
    refs: [],
    hash: '',
    reasons: [],
  },
  generic: { state: 'pending', evidenceRefs: [], eventIds: [] },
  effects: [],
})
export function checksStatus(c: ItemChecks): 'pending' | 'verified' | 'failed' | 'unverified' {
  if (c.sourceReview.state !== 'sealed')
    return c.sourceReview.state === 'pending' ? 'pending' : 'unverified'
  if (c.generic.state === 'pending' || c.effects.some((e) => e.state === 'pending'))
    return 'pending'
  if (c.generic.state === 'unverified' || c.effects.some((e) => e.state === 'unverified'))
    return 'unverified'
  return c.generic.state === 'failed' || c.effects.some((e) => e.state === 'failed')
    ? 'failed'
    : 'verified'
}
export function requirementValid(e: EffectRequirement): boolean {
  const { requirementId, requirementHash, state, measurementRefs, eventIds, late, ...body } = e
  return (
    requirementHash === checkHash(body) &&
    requirementId === `requirement:${requirementHash.slice(0, 24)}`
  )
}
export function checksValid(c: ItemChecks): boolean {
  return (
    c?.revision === CHECKS_REVISION &&
    ['pending', 'sealed', 'unresolved'].includes(c.sourceReview?.state) &&
    Array.isArray(c.effects) &&
    c.effects.every(
      (e) =>
        requirementValid(e) &&
        ['pending', 'verified', 'failed', 'unverified'].includes(e.state) &&
        ['click', 'fill'].includes(e.actionContract.type) &&
        (['pending', 'unverified'].includes(e.state) ||
          (e.measurementRefs.length > 0 && e.eventIds.length > 0)),
    ) &&
    c.effects.length <= 12 &&
    (c.sourceReview.state !== 'sealed' ||
      (!!c.sourceReview.page?.complete &&
        c.sourceReview.page.total <= 500 &&
        c.sourceReview.page.nodes.length === c.sourceReview.page.total &&
        !!c.sourceReview.refs.length &&
        c.sourceReview.hash ===
          checkHash({
            page: c.sourceReview.page,
            goalHash: c.sourceReview.goalHash,
            contractHash: c.sourceReview.contractHash,
            effects: c.effects.filter((e) => !e.late).map((e) => e.requirementHash),
            reasons: c.sourceReview.reasons,
            ruleChecks: c.sourceReview.ruleChecks,
          }))) &&
    (c.generic.state !== 'collected' ||
      Boolean(
        c.generic.actionId &&
          c.generic.receiptRef &&
          c.generic.evidenceRefs.length >= 3 &&
          c.generic.feedback &&
          c.generic.feedback !== 'indeterminate',
      ))
  )
}
type Parsed = {
  name?: string
  condition?: 'text-contains' | 'text-equals' | 'numeric-ascending' | 'numeric-descending'
  expected?: string
  sync: boolean
  focus: boolean
}
/** Finite full-sentence grammar. No substring authorization, no general natural-language compiler. */
export function parsePublicRelation(text: string, describedName?: string): Parsed | null {
  const t = text.trim()
  if (
    t === UI_DEFAULT_GOAL ||
    t ===
      'Inspect the catalog UI and its controls within the allowed scope. Report evidence-backed issues and anything left unverified.' ||
    /^(Inspect (the page|this page|the UI)|检查(页面|界面))[.!。]?$/.test(t)
  )
    return { focus: true, sync: false }
  let m =
    /^(?:Inspect|Check) "([^"\n]{1,120})"[.!]?$/.exec(t) ??
    /^检查[「“]([^」”\n]{1,120})[」”][。]?$/.exec(t)
  if (m) return { focus: true, name: m[1], sync: false }
  m =
    /^(Synchronously )?[Aa]fter clicking "([^"\n]{1,120})", show (text|text exactly) "([^"\n]{1,500})"[.!]?$/.exec(
      t,
    )
  if (m)
    return {
      focus: false,
      sync: !!m[1],
      name: m[2],
      condition: m[3] === 'text exactly' ? 'text-equals' : 'text-contains',
      expected: m[4],
    }
  m =
    /^(同步)?点击[「“]([^」”\n]{1,120})[」”]后[，,]应显示(内容恰为|文字)[「“]([^」”\n]{1,500})[」”][。]?$/.exec(
      t,
    )
  if (m)
    return {
      focus: false,
      sync: !!m[1],
      name: m[2],
      condition: m[3] === '内容恰为' ? 'text-equals' : 'text-contains',
      expected: m[4],
    }
  m =
    /^(Synchronously )?[Aa]fter clicking this button, numbers in its controlled list must be (ascending|descending)[.!]?$/.exec(
      t,
    )
  if (m && describedName !== undefined)
    return {
      focus: false,
      sync: !!m[1],
      name: describedName,
      condition: m[2] === 'ascending' ? 'numeric-ascending' : 'numeric-descending',
    }
  m = /^(同步)?点击此按钮后[，,]其关联列表中的数值应(升序|降序)排列[。]?$/.exec(t)
  if (m && describedName !== undefined)
    return {
      focus: false,
      sync: !!m[1],
      name: describedName,
      condition: m[2] === '升序' ? 'numeric-ascending' : 'numeric-descending',
    }
  return null
}
export function reviewPublicSources(input: {
  contract: UiContractSnapshot
  page: PublicCheckPage
  control: PublicNode
  refs: string[]
  required: RequiredCheck[]
}): ItemChecks {
  const { contract, page, control, refs } = input,
    c = emptyChecks(),
    reasons: string[] = [],
    effects: EffectRequirement[] = []
  if (!page.complete || page.total > 500 || control.truncated)
    reasons.push('source-review-incomplete')
  const unique = (name: string) =>
    page.nodes.filter(
      (n) =>
        ['button', 'input', 'select', 'textarea', 'summary'].includes(n.tag) && n.name === name,
    ).length === 1
  function add(
    sourceKind: EffectRequirement['sourceKind'],
    sourceId: string,
    sourceText: string,
    relationKind: string,
    predicate: EffectRequirement['predicate'],
    evaluationPoint: EffectRequirement['evaluationPoint'],
    actionContract: EffectRequirement['actionContract'],
  ) {
    const body = {
      sourceKind,
      sourceId,
      sourceHash: createHash('sha256').update(sourceText).digest('hex'),
      sourceRefs: [...refs],
      sourceSpan: [0, sourceText.length] as [number, number],
      sourceText,
      documentVersion: page.documentVersion,
      controlBinding: { selector: control.selector, name: control.name, tag: control.tag },
      actionContract,
      relationKind,
      predicate,
      evaluationPoint,
    }
    const requirementHash = checkHash(body)
    if (!effects.some((e) => e.requirementHash === requirementHash))
      effects.push({
        ...body,
        requirementHash,
        requirementId: `requirement:${requirementHash.slice(0, 24)}`,
        late: false,
        state: 'pending',
        measurementRefs: [],
        eventIds: [],
      })
  }
  function relation(
    text: string,
    kind: 'original-goal' | 'page-declaration',
    id: string,
    described = false,
  ) {
    const parsed =
      kind === 'original-goal' &&
      ((contract.popupCheck && popupFocusIntent(text)) ||
        (contract.exploration && explorationRevisitIntent(text)))
        ? ({ focus: true, sync: false } as Parsed)
        : parsePublicRelation(text, described ? control.name : undefined)
    if (!parsed) {
      reasons.push(kind === 'original-goal' ? 'goal-unresolved' : 'source-unresolved')
      return
    }
    if (parsed.name && parsed.name !== control.name) return
    if (parsed.name && !(described && /this button|此按钮/.test(text)) && !unique(parsed.name)) {
      reasons.push('source-target-ambiguous-or-missing')
      return
    }
    if (parsed.focus) return
    let selector: string | undefined
    if (parsed.condition?.startsWith('numeric-')) {
      const targetId = control.attributes['aria-controls']
      const lists = page.nodes.filter((n) => n.attributes.id === targetId)
      if (!targetId || lists.length !== 1) {
        reasons.push('source-result-relation-unresolved')
        return
      }
      const list = lists[0]!
      const children = page.nodes.filter(
        (n) =>
          n.parentSelector === list.selector ||
          (n.selector.startsWith(list.selector + ' > ') &&
            n.selector.slice(list.selector.length + 3).indexOf(' > ') < 0),
      )
      if (children.length < 2 || children.some((n) => !/^[-+]?\d+(\.\d+)?$/.test(n.text))) {
        reasons.push('numeric-source-unsupported')
        return
      }
      selector = list.selector + ' > *'
    }
    add(
      kind,
      id,
      text,
      'explicit-control-action-effect',
      { condition: parsed.condition!, expected: parsed.expected, selector },
      parsed.sync ? 'action-complete' : 'positive-only',
      { type: 'click' },
    )
  }
  relation(
    contract.requestedGoal?.trim() ? contract.requestedGoal : contract.goal,
    'original-goal',
    'goal:' + checkHash(contract.requestedGoal?.trim() ? contract.requestedGoal : contract.goal),
  )
  const described = control.attributes['aria-describedby']?.split(/\s+/).filter(Boolean) ?? []
  for (const id of described) {
    const descriptions = page.nodes.filter((n) => n.attributes.id === id)
    if (descriptions.length !== 1 || descriptions[0]!.truncated)
      reasons.push('source-description-incomplete')
    else relation(descriptions[0]!.text, 'page-declaration', 'page-description:' + id, true)
  }
  // Named, visible full-sentence declarations are also reviewed; unlabeled output is never a specification.
  for (const node of page.nodes.filter(
    (n) =>
      n.visible &&
      ['p', 'label', 'figcaption'].includes(n.tag) &&
      !described.includes(n.attributes.id),
  )) {
    const parsed = parsePublicRelation(node.text)
    if (parsed && !parsed.focus && parsed.name === control.name)
      relation(node.text, 'page-declaration', 'page:' + node.selector)
    else if (
      !!control.name &&
      node.text.includes(control.name) &&
      /after clicking|点击|应|must|should/i.test(node.text)
    )
      reasons.push('source-unresolved')
  }
  for (const check of input.required) {
    if (!check.verify || check.action === 'link') continue
    const predicate = {
      condition: check.verify.condition,
      expected: check.verify.expected,
      selector: check.verify.selector,
    }
    add(
      'required-check',
      check.id,
      JSON.stringify(check),
      'structured-caller-effect',
      predicate,
      'action-complete',
      { type: check.action, value: check.value },
    )
  }
  if (effects.length > 12) {
    reasons.push('source-overflow')
    effects.splice(12)
  }
  for (const e of effects)
    for (const other of effects)
      if (
        e !== other &&
        e.predicate.selector === other.predicate.selector &&
        e.predicate.condition === other.predicate.condition &&
        e.predicate.expected !== other.predicate.expected
      )
        reasons.push('source-conflict')
  c.effects = effects
  c.sourceReview = {
    state: reasons.length ? 'unresolved' : 'sealed',
    revision: 'public-effect-sources-1',
    refs: [...refs],
    reasons: [...new Set(reasons)],
    page,
    goalHash: checkHash(contract.goal),
    contractHash: contract.hash,
    hash: '',
  }
  c.sourceReview.hash = checkHash({
    page,
    goalHash: c.sourceReview.goalHash,
    contractHash: contract.hash,
    effects: effects.map((e) => e.requirementHash),
    reasons: c.sourceReview.reasons,
    ruleChecks: c.sourceReview.ruleChecks,
  })
  return c
}
