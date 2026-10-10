/** Public rendered surface evidence, not a claim about the cause or intended meaning. */
export type FloatingSurface = {
  position: string
  border: boolean
  shadow: boolean
  opaque: boolean
}
export function floatingSurface(kind: string, surface?: FloatingSurface, tag?: string) {
  return (
    kind === 'native' ||
    kind === 'dialog-role' ||
    (kind === 'custom' &&
      // Match the geometry collector's exclusion of ordinary controls and media.
      !['button', 'a', 'input', 'select', 'textarea', 'img', 'svg'].includes(
        tag?.toLowerCase() ?? '',
      ) &&
      !!surface &&
      surface.position === 'fixed' &&
      surface.opaque &&
      (surface.border || surface.shadow))
  )
}
