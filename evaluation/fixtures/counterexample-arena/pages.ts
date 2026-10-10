import { controlLayoutFixture } from '../control-layout.ts'
import { imageHtml } from '../image-shape.ts'

/** Product requirement, shared by every contracted image presentation, never an answer. */
export const brandRequirement =
  'Keep the supplied brand emblem in its original proportions. Cropping and empty margins are permitted.'

export function brandPage(style: string, withRequirement: boolean) {
  return imageHtml(style, '/emblem.png')
    .replace('Synthetic image shape fixture', 'Brand assets')
    .replace(
      '<div',
      `<h1>Brand assets</h1>${withRequirement ? `<p>${brandRequirement}</p>` : ''}<div`,
    )
}

export function layoutPage(mode: Parameters<typeof controlLayoutFixture>[0]) {
  return controlLayoutFixture(mode)
}

export function popupPage(body: string) {
  return `<!doctype html><html><head><title>Workspace</title><style>[hidden]{display:none!important}dialog{position:fixed}</style></head><body><p>After clicking "Open details", show popup "Details overview".</p>${body}</body></html>`
}
