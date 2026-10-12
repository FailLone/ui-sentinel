import {
  checkHash,
  type PublicCheckPage,
  type PublicNode,
} from '../../inspection/check-contract.ts'
import {
  PRODUCT_SKILL_REVISION,
  productPlan,
  validateProductPlan,
  type ProductPlan,
} from '../../inspection/product-path.ts'
import { projectInspectionScope } from '../../inspection/scope.ts'
import type { UiContractSnapshot } from '../../inspection/contract.ts'
import type { RunEvent } from '../../shared/types.ts'
import { getDbClient } from '../../storage/database.ts'

export type TargetDescription = {
  selector: string
  tag: string
  attributes: Record<string, string>
  name?: string
  parent?: { tag: string; attributes: Record<string, string> }
}
const attributes = (n: PublicNode) =>
  Object.fromEntries(
    ['id', 'type', 'role', 'aria-label', 'aria-controls', 'aria-describedby'].flatMap((k) =>
      n.attributes[k] === undefined ? [] : [[k, n.attributes[k]]],
    ),
  )
export function describeTarget(
  page: PublicCheckPage,
  selector: string,
  control = false,
): TargetDescription {
  const matches = page.nodes.filter((n) => n.selector === selector || n.path === selector)
  if (!page.complete || matches.length !== 1 || matches[0]!.truncated)
    throw Error('target-missing-or-ambiguous')
  const node = matches[0]!
  const parent = page.nodes.find((n) => n.selector === node.parentSelector)
  return {
    selector,
    tag: node.tag,
    attributes: attributes(node),
    ...(control ? { name: node.name } : {}),
    ...(parent ? { parent: { tag: parent.tag, attributes: attributes(parent) } } : {}),
  }
}
export function matchTarget(page: PublicCheckPage, target: TargetDescription) {
  const actual = describeTarget(page, target.selector, target.name !== undefined)
  if (checkHash(actual) !== checkHash(target)) throw Error('target-description-changed')
  const node = page.nodes.find((n) => n.selector === target.selector || n.path === target.selector)!
  if (!node.visible || !node.identity) throw Error('target-not-visible-or-unidentified')
  return node
}
export interface PathProgram {
  id: string
  revision: 'path-reuse-1'
  skillRevision: string
  entryUrl: string
  origin: string
  source: { sourceId: string; contentHash: string; version: string }
  plan: ProductPlan
  bindings: {
    control: TargetDescription
    result: TargetDescription
    preconditions: TargetDescription[]
  }[]
  provenance: { runId: string; actionIds: string[] }
  invalidation: readonly string[]
}
export function derivePathProgram(
  runId: string,
  contract: UiContractSnapshot,
  events: readonly RunEvent[],
): PathProgram {
  if (
    !contract.productSource ||
    contract.session !== 'anonymous' ||
    contract.businessWrites !== 'none'
  )
    throw Error('anonymous-product-path-required')
  const plan = validateProductPlan(contract.productSource, productPlan(events))
  if (
    events.find((e) => e.type === 'product:planned')?.payload.revision !== PRODUCT_SKILL_REVISION ||
    plan.assumptions.length
  )
    throw Error('unsupported-path-revision')
  const items = projectInspectionScope(events).snapshot().items
  const actionIds: string[] = []
  const bindings = plan.steps.map((step, index) => {
    if (
      step.certainty !== 'explicit' ||
      !step.expectation ||
      step.preconditions.some((p) => !p.expectation)
    )
      throw Error('explicit-measurable-path-required')
    const bindings = events.filter((e) => e.type === 'product:bound' && e.payload.step === index)
    if (bindings.length !== 1) throw Error('unique-original-binding-required')
    const binding = bindings[0]!.payload
    const item = items.find((i) => i.itemId === binding.itemId)
    const page = item?.checks?.sourceReview.page
    const actionId = item?.checks?.generic.actionId
    if (!page || !actionId || item?.status !== 'verified')
      throw Error('verified-original-target-required')
    const completion = events.find((e) => e.type === 'action:completed' && e.actionId === actionId)
    if (!completion || completion.payload.networkWrites !== 0)
      throw Error('write-free-completion-required')
    actionIds.push(actionId)
    const control = describeTarget(page, String(binding.selector), true)
    if (control.name !== (step.targetName ?? step.title))
      throw Error('source-named-control-required')
    return {
      control,
      result: describeTarget(page, String(binding.resultSelector)),
      preconditions: (binding.checks as { input: { selector: string } }[]).map((c) =>
        describeTarget(page, c.input.selector),
      ),
    }
  })
  if (events.filter((e) => e.type === 'action:executing').length !== plan.steps.length)
    throw Error('path-only-run-required')
  const body: Omit<PathProgram, 'id'> = {
    revision: 'path-reuse-1',
    skillRevision: PRODUCT_SKILL_REVISION,
    entryUrl: contract.entryUrl,
    origin: contract.origin,
    source: {
      sourceId: contract.productSource.sourceId,
      contentHash: contract.productSource.contentHash,
      version: contract.productSource.version,
    },
    plan,
    bindings,
    provenance: { runId, actionIds },
    invalidation: [
      'source-or-entry-mismatch',
      'target-missing-or-ambiguous',
      'target-description-changed',
      'live-node-replaced',
      'precondition-unmet',
      'original-executor-boundary',
    ],
  }
  return { id: 'path-' + checkHash(body), ...body }
}
export function validPathProgram(program: PathProgram): boolean {
  try {
    const { id, ...body } = program
    return (
      id === 'path-' + checkHash(body) &&
      program.revision === 'path-reuse-1' &&
      program.skillRevision === PRODUCT_SKILL_REVISION &&
      program.bindings.length === program.plan.steps.length
    )
  } catch {
    return false
  }
}
export async function savePathProgram(program: PathProgram) {
  if (!validPathProgram(program)) throw Error('invalid-path-program')
  await getDbClient().execute({
    sql: 'INSERT OR IGNORE INTO path_programs (id,program) VALUES (?,?)',
    args: [program.id, JSON.stringify(program)],
  })
  return program
}
export async function loadPathProgram(id: string): Promise<PathProgram | undefined> {
  const rows = await getDbClient().execute({
    sql: 'SELECT program FROM path_programs WHERE id=?',
    args: [id],
  })
  if (!rows.rows.length) return undefined
  try {
    const program = JSON.parse(String(rows.rows[0]!.program)) as PathProgram
    return program.id === id && validPathProgram(program) ? program : undefined
  } catch {
    return undefined
  }
}
