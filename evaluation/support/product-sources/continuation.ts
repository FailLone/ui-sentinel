/** Test-author continuation of preserved real failures; never imported by the product. */
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
export const continuationRows = JSON.parse(
  readFileSync('evaluation/private/product-sources/continuation-failures.json', 'utf8'),
).rows as any[]
export function continuationReply(mode: string, turn: number, packet: any) {
  const wrongBinding = mode === 'continuation-defect'
  const row = continuationRows.find((r) => r.row === (wrongBinding ? 'R5' : 'R1'))!
  let name = 'run_finish',
    args: any = {
      reason: mode.includes('unavailable') ? 'unverified-scope' : 'scope-covered',
    }
  const additionalCalls: { name: string; args: any }[] = []
  const execution = packet.productPath.execution
  const inspect = () => {
    name = 'page_inspect'
    args = { selector: 'main section, main section p, main button', offset: 0 }
  }
  const bind = (step: number) => {
    const elements = packet.latestToolResults.tools.find(
      (t: any) => t.tool === 'page_inspect',
    ).elements
    const slot = (label: string) => {
      const sections = elements.filter((e: any) => e.tag === 'section' && e.ariaLabel === label)
      assert.equal(sections.length, 1)
      const values = elements.filter(
        (e: any) => e.tag === 'p' && e.selector.startsWith(sections[0].selector + ' > '),
      )
      assert.equal(values.length, 1)
      return values[0].selector
    }
    assert.equal(execution.step, step)
    assert.ok(['bind-next-step', 'inspect-binding'].includes(execution.phase))
    const target = row.report.plan.steps[step].targetName
    const candidate = packet.inspectionScope.candidates.find((c: any) =>
      c.description.includes(target),
    )
    assert.ok(candidate)
    name = 'product_path_bind'
    args = {
      step,
      ref: candidate.ref,
      resultSelector: slot(step === 0 ? '预览状态' : '详情状态'),
      preconditionSelectors: [slot(step === 0 ? '目录可用状态' : '预览状态')],
    }
    if (wrongBinding && turn === 4) {
      // Exact original erroneous selectors, with only the fresh run's control ref substituted.
      args = { ...row.originalBindCalls[0].input, ref: candidate.ref }
    }
  }
  const act = () => {
    assert.equal(execution.phase, 'act-bound-step')
    name = 'page_act'
    args = { type: execution.action, ref: execution.ref }
  }
  if (turn === 0) {
    name = 'product_source_read'
    args = { offset: 0 }
  } else if (turn === 1) {
    const quotes = [
      ...new Set<string>(
        row.report.plan.steps.flatMap((s: any) =>
          [s, ...s.preconditions].map((c: any) => c.citation.quote),
        ),
      ),
    ]
    name = 'product_source_search'
    args = { quote: quotes[0], offset: 0 }
    for (const quote of quotes.slice(1)) additionalCalls.push({ name, args: { quote, offset: 0 } })
  } else if (turn === 2) {
    name = 'product_path_register'
    args = structuredClone(row.originalRegistration.input)
    for (const s of args.steps) {
      for (const key of ['value', 'limitation']) if (s[key] === null) delete s[key]
      if (s.review.substringJustification === null) delete s.review.substringJustification
    }
  } else if (turn === 3) inspect()
  else if (turn === 4 && mode === 'continuation-unavailable') {
    const elements = packet.latestToolResults.tools.find(
      (t: any) => t.tool === 'page_inspect',
    ).elements
    assert.ok(elements.some((e: any) => e.tag === 'p' && e.text === '暂不可用'))
    assert.ok(
      elements.some((e: any) => e.tag === 'button' && e.text === '预览目录' && e.enabled === false),
    )
  } else if (turn === 4) bind(0)
  else if (mode === 'continuation-unavailable-enabled') {
    assert.equal(execution.phase, 'prerequisite-not-satisfied')
    if (turn === 5) {
      name = 'page_act'
      args = { type: 'click', role: 'button', name: '预览目录' }
    }
  } else if (wrongBinding && turn === 5) {
    assert.equal(execution.phase, 'inspect-binding')
    assert.equal(execution.diagnostics[0].measured.count, 0)
    assert.equal(packet.latestToolResults.tools[0].execution.phase, 'inspect-binding')
    inspect()
  } else if (wrongBinding && turn === 6) bind(0)
  else {
    const next = turn - (wrongBinding ? 2 : 0)
    if (next === 5 || next === 8) act()
    else if (next === 6) {
      assert.equal(execution.step, 1)
      assert.deepEqual(execution.completedSteps, [0])
      inspect()
    } else if (next === 7) bind(1)
    else assert.equal(execution.phase, wrongBinding ? 'effect-failed' : 'path-evaluated')
  }
  return { name, args, additionalCalls }
}
