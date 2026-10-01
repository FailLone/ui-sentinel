import type { Rect } from './focus-geometry.ts'

/**
 * A binding witness: the public identity of the node a focus probe actually bound.
 *
 * A receipt records `nodeIdentity` as `node-<uuid>`, generated at bind time. It proves the probe
 * stayed on one node, but nothing outside that run can check it against the intended target, because
 * no other process ever produced that uuid. The witness closes that gap: captured from the same
 * ElementHandle at bind time, it records the node's native tag/type and its public attributes, so an
 * independent scorer can compare the bound node against the intended target from facts it can read
 * itself.
 *
 * Everything here is public DOM data - exactly what any observer of the page could read. It carries no
 * private selector, no expected outcome and no coordinate that the agent could not already see.
 */
export interface BindingWitness {
  readonly version: 1
  readonly candidateId: string
  readonly elementRef: string
  readonly snapshotRef: string
  readonly documentEpoch: string
  readonly nodeIdentity: string
  /** Native tag/type and the public attributes that single the node out, as the page reported them. */
  readonly native: {
    readonly tag: string
    readonly type?: string
    readonly id?: string
    readonly role?: string
    readonly ariaLabel?: string
    readonly placeholder?: string
  }
  /** The public nth-of-type path the observation recorded for this element. */
  readonly domPath: readonly string[]
  readonly bounds: Rect
  readonly capturedAt: string
}

/** The public identity of an element, from the fields an observation records for it. */
export function witnessFromElement(input: {
  candidateId: string
  elementRef: string
  snapshotRef: string
  documentEpoch: string
  nodeIdentity: string
  selector: string
  tag: string
  attributes: Record<string, string>
  bounds: Rect
  capturedAt: string
}): BindingWitness {
  const attributes = input.attributes
  return {
    version: 1,
    candidateId: input.candidateId,
    elementRef: input.elementRef,
    snapshotRef: input.snapshotRef,
    documentEpoch: input.documentEpoch,
    nodeIdentity: input.nodeIdentity,
    native: {
      tag: input.tag,
      ...(attributes.type ? { type: attributes.type } : {}),
      ...(attributes.id ? { id: attributes.id } : {}),
      ...(attributes.role ? { role: attributes.role } : {}),
      ...(attributes['aria-label'] ? { ariaLabel: attributes['aria-label'] } : {}),
      ...(attributes.placeholder ? { placeholder: attributes.placeholder } : {}),
    },
    domPath: input.selector.split(' > '),
    bounds: input.bounds,
    capturedAt: input.capturedAt,
  }
}
