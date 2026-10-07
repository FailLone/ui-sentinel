import { z } from 'zod'

export const metrics = [
  'exists',
  'displayed',
  'enabled',
  'focused',
  'text',
  'x',
  'y',
  'width',
  'height',
  'viewportFraction',
  'unclippedFraction',
  'hitFraction',
  'scrollX',
  'scrollY',
] as const
const name = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/)
const scalar = z.union([z.number().finite(), z.boolean(), z.string().max(500)])
const reference = z.object({ sample: name, target: name, metric: z.enum(metrics) }).strict()
const operand = z.union([reference, z.object({ value: scalar }).strict()])
export const inspectInput = z
  .object({
    selector: z
      .string()
      .min(1)
      .max(400)
      .default('button, a, input, select, textarea, [role], [aria-live], h1, h2, p, label'),
    offset: z.number().int().min(0).max(2000).default(0),
  })
  .strict()

export const programInput = z
  .object({
    version: z.literal(1),
    phenomenon: z
      .string()
      .min(1)
      .max(800)
      .describe('One short sentence naming the observed question; do not copy page text.'),
    basis: z
      .string()
      .min(1)
      .max(1600)
      .describe(
        'One concise sentence grounding the expectation. Avoid long quotations, repeated selectors or a narrative of previous tools.',
      ),
    targets: z
      .array(
        z
          .object({
            name,
            selector: z.string().min(1).max(400),
            binding: z
              .enum(['node', 'post-action'])
              .optional()
              .describe(
                'Default node preserves identity throughout. post-action is a result slot explicitly read and bound by bind_results after the last action; never an action target.',
              ),
          })
          .strict(),
      )
      .min(1)
      .max(6)
      .describe(
        'Only targets required by this question, usually one or two. Do not include every page control.',
      ),
    steps: z
      .array(
        z.discriminatedUnion('op', [
          z.object({ op: z.literal('bind_results') }).strict(),
          z
            .object({
              op: z.literal('measure'),
              name: name.describe(
                'Names a point in time. One measure captures ALL declared targets; reuse this sample in multiple assertions. Measure again only after a relevant change or wait.',
              ),
            })
            .strict(),
          z.object({ op: z.literal('wait'), ms: z.number().int().min(1).max(2000) }).strict(),
          z
            .object({
              op: z.literal('act'),
              type: z.enum(['click', 'fill', 'scroll']),
              target: name.optional(),
              value: z.string().max(500).optional(),
              scrollY: z.number().int().min(-1000).max(1000).optional(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(10),
    assertions: z
      .array(
        z
          .object({
            expectation: z.string().min(1).max(500),
            left: reference,
            operator: z.enum(['eq', 'gte', 'lte']),
            right: operand,
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict()
  .superRefine((p, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    const targets = new Set(p.targets.map((t) => t.name))
    if (targets.size !== p.targets.length) issue('Duplicate target name')
    const samples = new Set<string>()
    const resultTargets = new Set(
      p.targets.filter((t) => t.binding === 'post-action').map((t) => t.name),
    )
    const lastAct = p.steps.map((s) => s.op).lastIndexOf('act')
    const boundSamples = new Set<string>()
    let resultsBound = false
    let waits = 0,
      actions = 0
    for (const s of p.steps) {
      if (s.op === 'measure') {
        if (samples.has(s.name)) issue('Duplicate sample name')
        samples.add(s.name)
        if (resultsBound) boundSamples.add(s.name)
      }
      if (s.op === 'bind_results') {
        if (!resultTargets.size || p.steps.indexOf(s) <= lastAct || lastAct < 0)
          issue('Result binding requires a preceding final action and declared result targets')
        resultsBound = true
      }
      if (s.op === 'wait') waits += s.ms
      if (s.op === 'act') {
        if (s.target && resultTargets.has(s.target)) issue('Result targets cannot be acted on')
        actions++
        if (s.type === 'scroll' ? s.scrollY === undefined : !s.target || !targets.has(s.target))
          issue('Action requires a declared target or scrollY')
        if (s.type === 'fill' && s.value === undefined) issue('Fill requires value')
      }
    }
    if (waits > 4000 || actions > 3) issue('Program exceeds 4000ms wait or three-action budget')
    if (!samples.size) issue('At least one measurement is required')
    for (const a of p.assertions) {
      for (const r of [a.left, a.right]) {
        if ('sample' in r && (!samples.has(r.sample) || !targets.has(r.target)))
          issue('Unknown measurement reference')
        if ('sample' in r && resultTargets.has(r.target) && !boundSamples.has(r.sample))
          issue('Result assertion requires explicit post-action binding')
      }
      if (JSON.stringify(a.left) === JSON.stringify(a.right))
        issue('Self comparison is not a check')
      if (a.operator !== 'eq' && 'value' in a.right && typeof a.right.value !== 'number')
        issue('Ordering requires numeric values')
    }
  })
export type InvestigationProgram = z.infer<typeof programInput>
export type Metric = (typeof metrics)[number]
export type Measurement = Record<Metric, string | number | boolean | null>
export type Samples = Record<string, Record<string, Measurement>>
export type Verdict = 'pass' | 'fail' | 'unknown'
export function evaluateProgram(program: InvestigationProgram, samples: Samples) {
  const read = (r: z.infer<typeof operand>) =>
    'value' in r ? r.value : (samples[r.sample]?.[r.target]?.[r.metric] ?? null)
  const assertions = program.assertions.map((a) => {
    const left = read(a.left),
      right = read(a.right)
    let verdict: Verdict = 'unknown'
    if (
      left !== null &&
      right !== null &&
      typeof left === typeof right &&
      (typeof left !== 'number' || (Number.isFinite(left) && Number.isFinite(right)))
    ) {
      if (a.operator === 'eq') verdict = left === right ? 'pass' : 'fail'
      else if (typeof left === 'number' && typeof right === 'number')
        verdict = (a.operator === 'gte' ? left >= right : left <= right) ? 'pass' : 'fail'
    }
    return { ...a, actualLeft: left, actualRight: right, verdict }
  })
  const verdict: Verdict = assertions.some((a) => a.verdict === 'unknown')
    ? 'unknown'
    : assertions.some((a) => a.verdict === 'fail')
      ? 'fail'
      : 'pass'
  return { assertions, verdict }
}
export const programInstructions =
  'For new spatial or before/after questions, compose a minimal investigation_run: short phenomenon/basis, only relevant targets, and usually one measure shared by all assertions. Every assertion must directly match the grounded requirement; do not add unrequested layout relationships or collateral checks. Bind selectors only to inspected elements whose text or role confirms their meaning. For content that appears after an operation, act and inspect it before binding; do not guess a future selector. Save a bounded check of the current contradiction before navigating or resetting. A current-state expectation does not need a before sample unless the question actually compares a change. Do not substitute a time-window condition for the geometry you intend to test. page_inspect reads public DOM text and geometric facts, including noninteractive content, without classifying defects. Use its CSS selectors to declare targets in investigation_run. Compose a version 1 program with measure(name), ordinary act(click/fill/scroll) and bounded wait(ms) steps; assertions compare a measured {sample,target,metric} with {value} or another measurement. Explain your observed phenomenon and the source of the expectation in basis. No issue-category enum or arbitrary JavaScript is needed. A program runs serially, saves its source, screenshots, measured facts and computed comparisons. Use separate measure steps before/after an operation for changes. Metrics describe rectangular DOM geometry and sampled hit tests, not visual meaning or universal usability. Missing/ambiguous/replaced/unsupported targets yield unknown, not proof of failure. Targets default to binding=node and keep the same identity. For result content expected to be rebuilt by an action, explicitly declare binding=post-action, execute the action, then bind_results before measuring. bind_results reads the current public nodes at those declared result selectors. Never use result targets for actions or same-node before/after assertions. Prefer an available specialized probe when its measured scope matches the question. A fail proves only the declared bounded comparison; subjective expectations remain your interpretation. Do not repeat business writes to investigate. Complete remaining scope or run_finish after reading the receipt; do not resubmit its finding. Saved programs are investigation recipes, not automatically approved global rules.'
