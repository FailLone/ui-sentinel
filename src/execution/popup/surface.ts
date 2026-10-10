/** Public rendered surface evidence, not a claim about the cause or intended meaning. */
export type FloatingSurface = {
  position: string
  border: boolean
  shadow: boolean
  opaque: boolean
}
export function floatingSurface(kind: string, surface?: FloatingSurface) {
  return (
    kind === 'native' ||
    kind === 'dialog-role' ||
    (kind === 'custom' &&
      !!surface &&
      surface.position === 'fixed' &&
      surface.opaque &&
      (surface.border || surface.shadow))
  )
}
