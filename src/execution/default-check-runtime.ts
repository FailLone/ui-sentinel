import { randomUUID } from 'node:crypto'
import type { Page, ElementHandle } from 'playwright'
import {
  checkHash,
  reviewPublicSources,
  type PublicCheckPage,
  type PublicNode,
  type ItemChecks,
  type EffectRequirement,
} from '../inspection/check-contract.ts'
import type { UiContractSnapshot } from '../inspection/contract.ts'
import type { InspectionHost } from './inspection-host.ts'
import {
  measureInteraction,
  evaluateInteraction,
  type InteractionVerification,
} from './interaction-verification.ts'
import type { RunEvent } from '../shared/types.ts'

/** Read-only public sampling. No model, action dispatcher, permissions or completion function here. */
export async function readPublicCheckPage(
  page: Page,
  documentVersion: string,
): Promise<PublicCheckPage> {
  const result = await page.evaluate(() => {
    const all = [...document.querySelectorAll('body *')].filter(
      (n) => !['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(n.tagName),
    )
    const fullPath = (n: Element): string => {
      const parts: string[] = []
      let p: Element | null = n
      while (p && p.tagName !== 'HTML') {
        const tag = p.tagName.toLowerCase()
        const peers = p.parentElement
          ? [...p.parentElement.children].filter((e) => e.tagName === p!.tagName)
          : []
        parts.unshift(tag + ':nth-of-type(' + (peers.indexOf(p) + 1) + ')')
        p = p.parentElement
      }
      return 'html > ' + parts.join(' > ')
    }
    const css = (n: Element): string => {
      if (n.id && document.querySelectorAll('#' + CSS.escape(n.id)).length === 1)
        return '#' + CSS.escape(n.id)
      const parts: string[] = []
      let p: Element | null = n
      while (p && p.tagName !== 'HTML') {
        const tag = p.tagName.toLowerCase()
        const peers = p.parentElement
          ? [...p.parentElement.children].filter((e) => e.tagName === p!.tagName)
          : []
        parts.unshift(tag + ':nth-of-type(' + (peers.indexOf(p) + 1) + ')')
        p = p.parentElement
      }
      return 'html > ' + parts.join(' > ')
    }
    const nodes = all.slice(0, 500).map((n) => {
      const tag = n.tagName.toLowerCase(),
        raw = n.textContent?.trim() ?? '',
        r = n.getBoundingClientRect(),
        s = getComputedStyle(n)
      const attributes = Object.fromEntries(
        [
          'id',
          'type',
          'role',
          'aria-label',
          'aria-controls',
          'aria-describedby',
          'aria-expanded',
          'aria-selected',
          'aria-pressed',
          'maxlength',
        ].flatMap((k) => (n.hasAttribute(k) ? [[k, n.getAttribute(k)!.slice(0, 1000)]] : [])),
      )
      const labels =
        'labels' in n
          ? [...((n as HTMLInputElement).labels ?? [])].map((e) => e.textContent?.trim()).join(' ')
          : ''
      const name = n.getAttribute('aria-label') ?? (labels || raw)
      const value =
        n instanceof HTMLInputElement && n.type === 'password'
          ? undefined
          : 'value' in n
            ? String((n as HTMLInputElement).value).slice(0, 1000)
            : undefined
      const selectedLabel =
        n instanceof HTMLSelectElement && n.selectedOptions.length === 1
          ? n.selectedOptions[0]!.label
          : undefined
      return {
        selector: css(n),
        path: fullPath(n),
        leaf: n.childElementCount === 0,
        incidental: tag === 'time' || attributes.role === 'timer',
        parentSelector: n.parentElement ? css(n.parentElement) : undefined,
        tag,
        name: name.slice(0, 500),
        text: raw.slice(0, 1000),
        visible: r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden',
        attributes,
        value,
        selectedLabel,
        truncated: raw.length > 1000 || name.length > 500,
      }
    })
    return {
      url: location.href,
      nodes,
      total: all.length,
      complete:
        all.length <= 500 &&
        nodes.every(
          (n) =>
            !n.truncated ||
            (!n.leaf && !['button', 'input', 'select', 'textarea', 'summary'].includes(n.tag)),
        ),
    }
  })
  return { ...result, documentVersion }
}
export const stablePublicPage = (p: PublicCheckPage) =>
  checkHash(
    p.nodes
      .filter((n) => !n.incidental)
      .map(({ selector, text, visible, value, selectedLabel, attributes, name, leaf, tag }) => ({
        selector,
        text: leaf ? text : undefined,
        visible,
        value,
        selectedLabel,
        attributes,
        name: ['button', 'input', 'select', 'textarea', 'summary'].includes(tag) ? name : undefined,
      })),
  )
export const effectKey = (e: EffectRequirement) =>
  checkHash({
    kind: e.sourceKind,
    id: e.sourceId,
    text: e.sourceHash,
    control: { selector: e.controlBinding.selector },
    action: e.actionContract,
    predicate: e.predicate,
    point: e.evaluationPoint,
  })
type Sample = { at: number; offsetMs: number; page: PublicCheckPage; refs: string[] }
type Original = {
  itemId: string
  actionId: string
  checkRef: string
  version: number
  root: ElementHandle<Element>
  url: string
  before: Sample
  after: Sample[]
  checks: ItemChecks
  attempts: number
  hashes: Record<string, string>
  bindings: Map<string, ElementHandle<Element>>
  sourceSelector: string
  inspected: Map<string, PublicNode>
  action: { type: string; value?: string }
}
export function createDefaultCheckRuntime(host: {
  contract: UiContractSnapshot
  inspection: InspectionHost
  page(): Page
  version(): number
  documentVersion(): string
  ruleSources(): ItemChecks['sourceReview']['ruleChecks']
  clean(): boolean
  guard(): void
  rulesPending(): Promise<number>
  observe(): Promise<unknown>
  save(type: string, body: string | Buffer): Promise<string>
  hashRefs(refs: string[]): Promise<Record<string, string>>
  emit(
    type: string,
    payload: Record<string, unknown>,
    refs?: string[],
    actionId?: string,
  ): Promise<RunEvent>
  publishFailure(
    requirement: EffectRequirement,
    original: Original,
    measurementRef: string,
    measurement: unknown,
    refs: string[],
  ): Promise<string>
}) {
  const reviewedPages = new Set<string>()
  const originals = new Map<string, Original>(),
    itemRefs = new Map<string, string>(),
    reviewed = new Set<string>()
  const current = (itemId: string) =>
    host.inspection.scope.snapshot().items.find((i) => i.itemId === itemId)
  async function publicSample(offsetMs: number): Promise<Sample> {
    host.guard()
    const page = await readPublicCheckPage(host.page(), host.documentVersion())
    host.guard()
    const screenshot = await host.save(
      'screenshot',
      await host.page().screenshot({ scale: 'css', timeout: 3000 }),
    )
    const confirmed = await readPublicCheckPage(host.page(), host.documentVersion())
    if (stablePublicPage(confirmed) !== stablePublicPage(page)) page.complete = false
    const ref = await host.save('check-source-observation', JSON.stringify(page))
    return { at: Date.now(), offsetMs, page, refs: [screenshot, ref] }
  }
  async function review(itemId: string, selector: string, sample: Sample) {
    const item = current(itemId)
    if (!item?.checks) throw Error('v2-original-item-required')
    const control = sample.page.nodes.find((n) => n.selector === selector || n.path === selector)
    if (!control) throw Error('v2-control-source-not-readable')
    const boundIds = new Set(
      host.inspection
        .requiredChecks()
        .filter((r) => r.boundItemId === itemId)
        .map((r) => r.id),
    )
    const required = host.contract.requiredChecks?.filter((r) => boundIds.has(r.id)) ?? []
    const checks = reviewPublicSources({
      contract: host.contract,
      page: sample.page,
      control,
      refs: sample.refs,
      required,
    })
    if (item.checks.effects.length) {
      const keys = new Set(checks.effects.map(effectKey))
      if (item.checks.effects.some((e) => !keys.has(effectKey(e))))
        checks.sourceReview.reasons.push('frozen-source-missing-or-changed')
      checks.effects = checks.effects.map(
        (e) => item.checks!.effects.find((old) => effectKey(old) === effectKey(e)) ?? e,
      )
      checks.effects = [
        ...item.checks.effects.filter(
          (old) => !checks.effects.some((e) => e.requirementId === old.requirementId),
        ),
        ...checks.effects,
      ]
    }
    if (checks.sourceReview.reasons.length) checks.sourceReview.state = 'unresolved'
    checks.sourceReview.hash = checkHash({
      page: checks.sourceReview.page,
      goalHash: checks.sourceReview.goalHash,
      contractHash: checks.sourceReview.contractHash,
      effects: checks.effects.filter((e) => !e.late).map((e) => e.requirementHash),
      reasons: checks.sourceReview.reasons,
    })
    checks.sourceReview.ruleChecks = host.ruleSources()
    checks.sourceReview.hash = checkHash({
      page: checks.sourceReview.page,
      goalHash: checks.sourceReview.goalHash,
      contractHash: checks.sourceReview.contractHash,
      effects: checks.effects.filter((e) => !e.late).map((e) => e.requirementHash),
      reasons: checks.sourceReview.reasons,
      ruleChecks: checks.sourceReview.ruleChecks,
    })
    checks.generic = item.checks.generic
    await host.emit(
      'interaction:sources-reviewed-v2',
      {
        itemId,
        sourceReviewHash: checks.sourceReview.hash,
        selector: control.selector,
        sourceState: checks.sourceReview.state,
        evidenceHashes: await host.hashRefs(sample.refs),
      },
      sample.refs,
    )
    host.inspection.scope.updateChecks(
      itemId,
      checks,
      'Public sources reviewed before operation; missing semantics are not invented',
    )
    await host.inspection.flush()
    reviewed.add(itemId)
    if (checks.sourceReview.state === 'sealed')
      await host.inspection.goalSourceRegistered(itemId, control.name, sample.refs)
    return checks
  }
  async function assertOriginal(original: Original) {
    host.guard()
    if (
      !host.clean() ||
      original.version !== host.version() ||
      original.url !== host.page().url() ||
      !(await original.root.evaluate((n) => n.isConnected && n === document.documentElement))
    )
      throw Error('v2-original-action-stale-or-intervened')
    if (checkHash(await host.hashRefs(Object.keys(original.hashes))) !== checkHash(original.hashes))
      throw Error('v2-original-evidence-changed')
  }
  async function measure(
    original: Original,
    requirement: EffectRequirement,
    selector?: string,
    point = 'action-complete',
  ) {
    await assertOriginal(original)
    if (requirement.late) throw Error('v2-late-source-cannot-verify-original-action')
    const expected = requirement.predicate
    const candidateSelector = expected.selector ?? selector
    if (!candidateSelector) return null
    if (
      point === 'read-only-recovery' &&
      requirement.evaluationPoint === 'action-complete' &&
      !original.after[0]?.page.nodes.some(
        (n) =>
          n.selector === candidateSelector ||
          n.path === candidateSelector ||
          (candidateSelector.endsWith(' > *') &&
            n.parentSelector === candidateSelector.slice(0, -4)),
      )
    )
      throw Error('v2-result-not-observed-at-frozen-evaluation-point')
    if (expected.selector && selector && expected.selector !== selector)
      throw Error('v2-result-selector-frozen')
    if (!expected.selector) {
      const actual =
        original.inspected.get(candidateSelector) ??
        original.after
          .flatMap((s) => s.page.nodes)
          .find(
            (n) =>
              (n.selector === candidateSelector || n.path === candidateSelector) &&
              n.visible &&
              !['html', 'body', 'button', 'input', 'select', 'textarea', 'a', 'summary'].includes(
                n.tag,
              ),
          )
      const prior = original.before.page.nodes.find(
        (n) => n.selector === candidateSelector || n.path === candidateSelector,
      )
      if (!actual || (prior?.visible && prior.text === actual.text))
        throw Error('v2-result-not-actually-observed-or-unrelated')
    }
    const preValues = original.before.page.nodes
      .filter(
        (n) =>
          n.selector === candidateSelector ||
          (candidateSelector.endsWith(' > *') &&
            n.parentSelector === candidateSelector.slice(0, -4)),
      )
      .map((n) => (expected.condition === 'visible' ? String(n.visible) : n.text))
    const input: InteractionVerification = {
      ...expected,
      selector: candidateSelector,
      basis: `Frozen ${requirement.sourceKind}:${requirement.sourceId}; ${requirement.requirementHash}`,
    }
    if (
      !['value-equals', 'selected-label-equals'].includes(input.condition) &&
      evaluateInteraction(input, {
        supported: true,
        count: preValues.length,
        values: preValues,
      }) === 'verified'
    )
      throw Error('v2-effect-already-true-or-invariant')
    const bound = original.bindings.get(requirement.requirementId)
    if (
      bound &&
      !(await bound.evaluate(
        (n, s) => n.isConnected && document.querySelector(s) === n,
        candidateSelector,
      ))
    )
      throw Error('v2-result-binding-replaced')
    if (!bound && !input.condition.startsWith('numeric-')) {
      const h = await host.page().locator(candidateSelector).elementHandle()
      if (h) original.bindings.set(requirement.requirementId, h)
    }
    const measurement = await measureInteraction(host.page(), input, async () => [
      await host.save('screenshot', await host.page().screenshot({ scale: 'css', timeout: 3000 })),
    ])
    host.guard()
    const outcome =
      measurement.outcome === 'failed' && requirement.evaluationPoint === 'positive-only'
        ? 'unverified'
        : measurement.outcome
    if (point === 'read-only-recovery' && requirement.evaluationPoint === 'action-complete') {
      const sampled = original.after[0]!.page.nodes.filter(
        (n) =>
          n.selector === candidateSelector ||
          n.path === candidateSelector ||
          (candidateSelector.endsWith(' > *') &&
            n.parentSelector === candidateSelector.slice(0, -4)),
      ).map((n) =>
        input.condition === 'visible'
          ? String(n.visible)
          : input.condition === 'value-equals'
            ? (n.value ?? null)
            : input.condition === 'selected-label-equals'
              ? (n.selectedLabel ?? null)
              : input.condition === 'expanded-equals'
                ? (n.attributes['aria-expanded'] ?? null)
                : n.text,
      )
      if (checkHash(sampled) !== checkHash(measurement.measured?.values))
        throw Error('v2-frozen-evaluation-point-values-changed')
    }
    const body = {
      revision: 'effect-measurement-2',
      itemId: original.itemId,
      actionId: original.actionId,
      requirementId: requirement.requirementId,
      requirementHash: requirement.requirementHash,
      point,
      outcome,
      measurement,
    }
    const ref = await host.save('measurement', JSON.stringify(body))
    const event = await host.emit(
      'interaction:effect-measured-v2',
      { ...body, measurementRef: ref, sha256: checkHash(body) },
      [ref, ...measurement.evidenceRefs],
      original.actionId,
    )
    const checks = structuredClone(current(original.itemId)!.checks!)
    const effect = checks.effects.find((e) => e.requirementId === requirement.requirementId)!
    effect.state = outcome
    effect.measurementRefs = [ref, ...measurement.evidenceRefs]
    effect.eventIds = [event.id]
    if (outcome === 'failed') {
      const findingId = await host.publishFailure(requirement, original, ref, body, [
        ...original.before.refs,
        ref,
        ...measurement.evidenceRefs,
      ])
      await host.emit(
        'interaction:effect-finding-v2',
        {
          itemId: original.itemId,
          actionId: original.actionId,
          requirementId: requirement.requirementId,
          measurementRef: ref,
          findingId,
        },
        [ref, ...measurement.evidenceRefs],
        original.actionId,
      )
    }
    host.inspection.scope.updateChecks(
      original.itemId,
      checks,
      `Frozen effect ${requirement.requirementId}: ${outcome}`,
    )
    await host.inspection.settleRequired(original.itemId)
    await host.inspection.flush()
    return body
  }
  async function generic(original: Original) {
    await assertOriginal(original)
    const checks = structuredClone(current(original.itemId)!.checks!)
    const sourceInput = original.before.page.nodes.find(
      (n) => n.selector === original.sourceSelector || n.path === original.sourceSelector,
    )
    const maximum = Number(sourceInput?.attributes.maxlength)
    const boundary =
      host.contract.exploration &&
      original.action.type === 'fill' &&
      ['input', 'textarea'].includes(sourceInput?.tag ?? '') &&
      sourceInput?.attributes.maxlength !== undefined &&
      Number.isInteger(maximum) &&
      maximum >= 0 &&
      maximum <= 256 &&
      original.action.value?.length === maximum + 1
    const nativeConstraint = boundary
      ? {
          kind: 'maxlength',
          maximum,
          requestedLength: original.action.value!.length,
          values: original.after.map(
            (s) =>
              s.page.nodes.find(
                (n) => n.selector === original.sourceSelector || n.path === original.sourceSelector,
              )?.value ?? null,
          ),
          sourceRefs: original.before.refs,
        }
      : undefined
    const native =
      original.action.type !== 'fill' ||
      (!!nativeConstraint &&
        nativeConstraint.values.length === 2 &&
        nativeConstraint.values.every((v) => v === original.action.value!.slice(0, maximum))) ||
      original.after[0]?.page.nodes.some(
        (n) =>
          (n.selector === original.sourceSelector || n.path === original.sourceSelector) &&
          n.value === original.action.value,
      )
    const complete =
      native &&
      original.before.page.complete &&
      original.after.length === 2 &&
      original.after.every((s) => s.page.complete) &&
      host.clean() &&
      (await host.rulesPending()) === 0
    const stable = stablePublicPage
    const feedback = complete
      ? original.after.some((s) => stable(s.page) !== stable(original.before.page))
        ? 'change-observed'
        : 'no-change-observed'
      : 'indeterminate'
    const body = {
      ...(nativeConstraint ? { nativeConstraint } : {}),
      revision: 'generic-interaction-2',
      contractHash: host.contract.hash,
      itemId: original.itemId,
      actionId: original.actionId,
      checkRef: original.checkRef,
      action: original.action,
      controlSelector: original.sourceSelector,
      sourceReviewHash: original.checks.sourceReview.hash,
      incidental: original.after.flatMap((s) =>
        s.page.nodes
          .filter((n) => n.incidental)
          .map((n) => ({
            selector: n.selector,
            kind: 'public-time-or-timer',
            relation: 'unestablished',
          })),
      ),
      before: original.before,
      after: original.after,
      sameDocument: true,
      integrity: 'clean',
      rulesSettled: complete,
      feedback,
      comparisonScope:
        'bounded public DOM; changes are observations, not functional correctness; causality of incidental content not established',
    }
    const ref = await host.save('generic-interaction', JSON.stringify(body))
    const refs = [...original.before.refs, ...original.after.flatMap((s) => s.refs), ref]
    const event = await host.emit(
      'interaction:generic-collected-v2',
      {
        itemId: original.itemId,
        actionId: original.actionId,
        checkRef: original.checkRef,
        receiptRef: ref,
        receiptHash: checkHash(body),
        feedback,
        complete,
      },
      refs,
      original.actionId,
    )
    checks.generic = {
      state: complete ? 'collected' : 'unverified',
      actionId: original.actionId,
      checkRef: original.checkRef,
      receiptRef: ref,
      feedback,
      evidenceRefs: refs,
      eventIds: [event.id],
    }
    host.inspection.scope.updateChecks(
      original.itemId,
      checks,
      'Default generic inspection; functionality is only known for separately measured requirements',
    )
    await host.inspection.settleRequired(original.itemId)
    await host.inspection.flush()
    original.hashes = await host.hashRefs(refs)
    return body
  }
  return {
    async reviewSelected(candidates: { itemId: string; selector: string }[]) {
      const pending = candidates.filter((c) => !reviewed.has(c.itemId) && current(c.itemId)?.checks)
      if (!pending.length && reviewedPages.has(host.page().url())) return
      const sample = await publicSample(-1)
      if (!reviewedPages.has(sample.page.url)) {
        const item = host.inspection.scope.createItem({
          category: 'investigation',
          pageId: 'source-review',
          stateId: sample.page.documentVersion,
          url: sample.page.url,
          observationVersion: sample.page.documentVersion,
          basis: 'default-checks:page-source-review:' + sample.page.url,
          targetSource: 'executor',
        })
        host.inspection.scope.resolveItem(item.itemId, {
          status: sample.page.complete ? 'verified' : 'unverified',
          reasonCode: sample.page.complete ? undefined : 'source-review-incomplete',
          evidenceRefs: sample.refs,
          eventIds: [],
          detail: 'Bounded source observation completeness, not functional correctness',
        })
        await host.emit(
          'interaction:page-sources-reviewed-v2',
          {
            itemId: item.itemId,
            url: sample.page.url,
            pageRef: sample.refs[1],
            pageHash: checkHash(sample.page),
            complete: sample.page.complete,
          },
          sample.refs,
        )
        await host.inspection.flush()
        reviewedPages.add(sample.page.url)
      }
      for (const c of pending) await review(c.itemId, c.selector, sample)
    },
    async prepare(
      itemId: string,
      selector: string,
      action: {
        type: string
        value?: string
        verify?: InteractionVerification
        requirementId?: string
      },
    ) {
      if (itemRefs.has(itemId))
        throw Error('v2-original-item-already-dispatched: no repeated operation')
      const before = await publicSample(-1),
        checks = await review(itemId, selector, before)
      if (!before.page.complete) throw Error('v2-source-review-incomplete: no operation dispatched')
      for (const e of checks.effects)
        if (e.actionContract.type !== action.type || e.actionContract.value !== action.value)
          throw Error('v2-required-action-contract-mismatch')
      if (
        action.requirementId &&
        !checks.effects.some((e) => e.requirementId === action.requirementId)
      )
        throw Error('v2-requirement-not-owned')
      if (
        action.verify &&
        !checks.effects.some(
          (e) =>
            e.predicate.condition === action.verify!.condition &&
            e.predicate.expected === action.verify!.expected &&
            (!e.predicate.selector || e.predicate.selector === action.verify!.selector),
        )
      ) {
        const node = before.page.nodes.find((n) => n.selector === selector || n.path === selector)
        const native =
          action.type === 'fill' &&
          ['input', 'select', 'textarea'].includes(node?.tag ?? '') &&
          (action.verify.selector === selector || action.verify.selector === node?.selector) &&
          ((action.verify.condition === 'value-equals' &&
            action.verify.expected === action.value) ||
            (action.verify.condition === 'selected-label-equals' &&
              before.page.nodes.some(
                (n) =>
                  n.tag === 'option' &&
                  n.parentSelector === node?.selector &&
                  n.value === action.value &&
                  n.text === action.verify!.expected,
              )))
        if (!native) throw Error('v2-unregistered-effect: verify does not grant a source')
      }
      const root = await host.page().locator('html').elementHandle()
      if (!root) throw Error('v2-document-binding-missing')
      return { itemId, sourceSelector: selector, before, checks, root, action }
    },
    async settle(prepared: Awaited<ReturnType<any>>, actionId: string) {
      const original: Original = {
        ...prepared,
        actionId,
        checkRef: randomUUID(),
        version: host.version(),
        url: prepared.before.page.url,
        after: [],
        attempts: 0,
        hashes: await host.hashRefs(prepared.before.refs),
        bindings: new Map(),
        inspected: new Map(),
      }
      originals.set(original.checkRef, original)
      itemRefs.set(original.itemId, original.checkRef)
      original.after.push(await publicSample(0))
      for (const e of original.checks.effects) {
        let selector = e.predicate.selector
        if (!selector && e.predicate.expected) {
          const matches = original.after[0]!.page.nodes.filter(
            (n) =>
              n.visible &&
              !original.before.page.nodes.some(
                (old) => old.selector === n.selector && old.visible && old.text === n.text,
              ) &&
              !['html', 'body', 'button', 'input', 'select', 'textarea', 'a'].includes(n.tag) &&
              (e.predicate.condition === 'text-equals'
                ? n.text === e.predicate.expected
                : n.text.includes(e.predicate.expected!)),
          )
          const leaf = matches.filter(
            (n) => !matches.some((other) => other !== n && other.parentSelector === n.selector),
          )
          if (leaf.length === 1) selector = leaf[0]!.selector
          if (!selector) {
            const feedback = original.after[0]!.page.nodes.filter(
              (n) =>
                n.visible &&
                ['region', 'status', 'alert'].includes(n.attributes.role ?? '') &&
                !original.before.page.nodes.some(
                  (old) => old.selector === n.selector && old.visible && old.text === n.text,
                ),
            )
            if (feedback.length === 1) selector = feedback[0]!.selector
          }
        }
        try {
          await measure(original, e, selector)
        } catch (error) {
          host.guard()
          await host.emit(
            'interaction:effect-unverified-v2',
            { itemId: original.itemId, requirementId: e.requirementId, error: String(error) },
            [],
            actionId,
          )
        }
      }
      const delay = Math.max(0, 1000 - (Date.now() - original.after[0]!.at))
      await new Promise((r) => setTimeout(r, delay))
      host.guard()
      await host.observe()
      original.after.push(await publicSample(Date.now() - original.after[0]!.at))
      const latest = original.after[1]!
      const node = latest.page.nodes.find(
        (n) => n.selector === original.sourceSelector || n.path === original.sourceSelector,
      )
      if (node) {
        const post = reviewPublicSources({
          contract: host.contract,
          page: latest.page,
          control: node,
          refs: latest.refs,
          required:
            host.contract.requiredChecks?.filter((r) =>
              host.inspection
                .requiredChecks()
                .some((b) => b.id === r.id && b.boundItemId === original.itemId),
            ) ?? [],
        })
        const checks = structuredClone(current(original.itemId)!.checks!)
        for (const e of post.effects)
          if (!checks.effects.some((old) => effectKey(old) === effectKey(e))) {
            checks.effects.push({ ...e, late: true, state: 'unverified' })
            checks.sourceReview.state = 'unresolved'
            checks.sourceReview.reasons.push('late-source-unverified')
          }
        if (checks.effects.length > 12) {
          checks.effects = checks.effects.slice(0, 12)
          checks.sourceReview.state = 'unresolved'
          checks.sourceReview.reasons.push('source-overflow')
        }
        host.inspection.scope.updateChecks(
          original.itemId,
          checks,
          'Post-action source review retains any late mandatory requirement',
        )
      }
      await generic(original)
      return {
        itemId: original.itemId,
        actionId,
        checkRef: original.checkRef,
        checks: summary(current(original.itemId)!.checks!),
      }
    },
    owns(ref: string) {
      return originals.has(ref)
    },
    async noteInspected(elements: { selector: string; text: unknown }[], receiptRef: string) {
      for (const original of originals.values())
        if (original.version === host.version())
          for (const element of elements) {
            const node = await host.page().locator(element.selector).elementHandle()
            if (!node) continue
            try {
              if (
                (await node.evaluate((n) => (n.textContent ?? '').trim().slice(0, 160))) ===
                element.text
              ) {
                const page = await readPublicCheckPage(host.page(), host.documentVersion())
                const actual = page.nodes.find(
                  (n) => n.selector === element.selector || n.path === element.selector,
                )
                if (actual) {
                  original.inspected.set(element.selector, {
                    ...actual,
                    selector: element.selector,
                  })
                  Object.assign(original.hashes, await host.hashRefs([receiptRef]))
                  await host.emit(
                    'interaction:result-read-v2',
                    {
                      itemId: original.itemId,
                      actionId: original.actionId,
                      selector: element.selector,
                      receiptRef,
                      textHash: checkHash(element.text),
                    },
                    [receiptRef],
                    original.actionId,
                  )
                }
              }
            } finally {
              await node.dispose()
            }
          }
    },
    async physicalFailure(
      itemId: string,
      actionId: string,
      receiptRef: string,
      refs: string[],
      eventId: string,
    ) {
      const checks = structuredClone(current(itemId)!.checks!)
      checks.generic = {
        state: 'failed',
        actionId,
        receiptRef,
        feedback: 'indeterminate',
        evidenceRefs: refs,
        eventIds: [eventId],
      }
      host.inspection.scope.updateChecks(
        itemId,
        checks,
        'Corroborated physical interception; no effect is assumed without operation',
      )
      await host.inspection.flush()
    },
    async recover(
      ref: string,
      purpose: 'collect-interaction' | 'verify-effect',
      requirementId?: string,
      selector?: string,
    ) {
      const original = originals.get(ref)
      if (!original || original.attempts++ >= 2)
        throw Error('v2-original-recovery-exhausted-or-unknown')
      await assertOriginal(original)
      if (purpose === 'collect-interaction') {
        if (selector || requirementId)
          throw Error('v2-generic-recovery-cannot-change-expectation-or-selector')
        return generic(original)
      }
      const req = current(original.itemId)?.checks?.effects.find(
        (e) => e.requirementId === requirementId,
      )
      if (!req) throw Error('v2-requirement-not-owned')
      if (req.state === 'verified' || req.state === 'failed')
        return {
          reused: true,
          requirementId: req.requirementId,
          outcome: req.state,
          measurementRefs: req.measurementRefs,
        }
      if (
        selector &&
        !original.inspected.has(selector) &&
        !original.after.some((s) =>
          s.page.nodes.some((n) => n.selector === selector || n.path === selector),
        )
      )
        throw Error('v2-result-not-publicly-read')
      return measure(original, req, selector, 'read-only-recovery')
    },
    available() {
      return [...originals.values()].slice(-6).map((o) => ({
        checkRef: o.checkRef,
        itemId: o.itemId,
        actionId: o.actionId,
        attemptsRemaining: Math.max(0, 2 - o.attempts),
        requirements: summary(current(o.itemId)!.checks!).effects,
      }))
    },
    async dispose() {
      await Promise.allSettled(
        [...originals.values()].flatMap((o) => [
          o.root.dispose(),
          ...[...o.bindings.values()].map((h) => h.dispose()),
        ]),
      )
    },
  }
}
export function summary(c: ItemChecks) {
  return {
    ...c,
    sourceReview: { ...c.sourceReview, page: undefined },
    effects: c.effects.map((e) => ({ ...e, sourceText: undefined })),
  }
}
