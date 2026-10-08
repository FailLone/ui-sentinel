import { actionInput } from '../action-input.ts'
import { z } from 'zod'
import { exploratoryEffectInput } from '../interaction-exploration.ts'

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
    exploration: z
      .object({
        expectedEffect: exploratoryEffectInput
          .nullish()
          .transform((v) => v ?? undefined)
          .optional(),
      })
      .strict()
      .nullish()
      .transform((v) => v ?? undefined)
      .optional()
      .describe(
        'UI only: one selected local click collects evidence, not an effect pass. assertions must be empty. Optional literal effect expectation must be grounded in the original user goal and is frozen before the click; no result selector is guessed.',
      ),
    targets: z
      .array(
        z
          .object({
            name,
            selector: z.string().min(1).max(400),
            identityBasis: z
              .string()
              .min(1)
              .max(500)
              .nullish()
              .transform((value) => value ?? undefined)
              .optional()
              .describe(
                'For an identity-sensitive post-action-only check, explain why the original node itself must persist. Never use this for ordinary result content.',
              ),
            binding: z
              .enum(['node', 'post-action'])
              .nullish()
              .transform((value) => value ?? undefined)
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
              target: name
                .nullish()
                .transform((value) => value ?? undefined)
                .optional(),
              value: z
                .string()
                .max(500)
                .nullish()
                .transform((value) => value ?? undefined)
                .optional(),
              scrollY: z
                .number()
                .int()
                .min(-1000)
                .max(1000)
                .nullish()
                .transform((value) => value ?? undefined)
                .optional(),
            })
            .strict(),
        ]),
      )
      .min(1)
      .max(10)
      .describe(
        'At most THREE act steps per program, at most 4000ms total wait. For post-action targets, bind_results must follow the FINAL action, then measure. Split separate action/result phases into separate bounded programs.',
      ),
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
      .min(0)
      .max(8),
  })
  .strict()
  .superRefine((p, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (p.exploration) {
      if (p.assertions.length) issue('Exploration does not accept effect or placeholder assertions')
      const acts = p.steps.filter((s) => s.op === 'act')
      if (acts.length !== 1 || acts[0]?.type !== 'click')
        issue('Exploration requires exactly one local click')
      if (p.targets.length !== 1 || p.targets[0]?.binding === 'post-action')
        issue(
          'Exploration declares only its known control; inspect unknown result content afterwards',
        )
    } else if (!p.assertions.length) issue('A comparison program requires assertions')
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
        // Validate the entire program before any browser binding/measurement. Nested actions
        // share the same operand contract as page_act rather than silently ignoring fields.
        const action = actionInput.safeParse({
          type: s.type,
          ...(s.target ? { selector: s.target } : {}),
          value: s.value,
          scrollY: s.scrollY,
        })
        if (!action.success)
          for (const error of action.error.issues)
            ctx.addIssue({
              code: 'custom',
              path: ['steps', p.steps.indexOf(s), ...error.path],
              message: error.message,
            })
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

/** UI-only preflight: reject an ambiguous result contract before any action or hypothesis. */
export function assertUiProgramBindings(program: InvestigationProgram): void {
  const lastAction = program.steps.map((step) => step.op).lastIndexOf('act')
  if (lastAction < 0) return
  for (const target of program.targets) {
    if (
      target.binding === 'post-action' ||
      target.identityBasis ||
      program.steps.some((step) => step.op === 'act' && step.target === target.name)
    )
      continue
    const references = program.assertions
      .flatMap((a) => [a.left, a.right])
      .filter(
        (r): r is InvestigationProgram['assertions'][number]['left'] =>
          'sample' in r && r.target === target.name,
      )
    if (
      references.length &&
      references.every(
        (r) =>
          program.steps.findIndex((step) => step.op === 'measure' && step.name === r.sample) >
          lastAction,
      )
    )
      throw Error(
        `ambiguous-result-binding: ${target.name} only checks the post-action result. Declare binding=post-action and bind_results after the final action, or identityBasis for a genuinely identity-sensitive check. No action dispatched.`,
      )
  }
}
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
  'For a selected pending UI control with unknown result location, investigation_run exploration:{} with exactly one click and assertions:[] collects evidence only. Do not repeat the operation to bind its result. An optional expectedEffect literal must already be supported by the original user goal and is frozen before operating. Afterwards use page_inspect to read the actual noninteractive feedback, then interaction_verify(checkRef,selector) from exploratoryInteractions for that original action. Without an independent expectation keep the item pending. Existing comparisons still require grounded assertions. For new spatial or before/after questions, compose a minimal investigation_run (at most three actions, ten steps, and 4000ms total wait; one final result binding phase): short phenomenon/basis, only relevant targets, and usually one measure shared by all assertions. Every assertion must directly match the grounded requirement; do not add unrequested layout relationships or collateral checks. Bind selectors only to inspected elements whose text or role confirms their meaning. For content that appears after an operation, act and inspect it before binding; do not guess a future selector. Save a bounded check of the current contradiction before navigating or resetting. A current-state expectation does not need a before sample unless the question actually compares a change. Do not substitute a time-window condition for the geometry you intend to test. page_inspect reads public DOM text and geometric facts, including noninteractive content, without classifying defects. Use its CSS selectors to declare targets in investigation_run. Compose a version 1 program with measure(name), ordinary act(click/fill/scroll) and bounded wait(ms) steps; assertions compare a measured {sample,target,metric} with {value} or another measurement. Explain your observed phenomenon and the source of the expectation in basis. No issue-category enum or arbitrary JavaScript is needed. A program runs serially, saves its source, screenshots, measured facts and computed comparisons. Use separate measure steps before/after an operation for changes. Metrics describe rectangular DOM geometry and sampled hit tests, not visual meaning or universal usability. Missing/ambiguous/replaced/unsupported targets yield unknown, not proof of failure. Targets default to binding=node and keep the same identity. For result content expected to be rebuilt by an action, explicitly declare binding=post-action, execute the action, then bind_results before measuring. bind_results reads the current public nodes at those declared result selectors. Never use result targets for actions or same-node before/after assertions. Prefer an available specialized probe when its measured scope matches the question. A fail proves only the declared bounded comparison; subjective expectations remain your interpretation. Do not repeat business writes to investigate. Complete remaining scope or run_finish after reading the receipt; do not resubmit its finding. Saved programs are investigation recipes, not automatically approved global rules.'
