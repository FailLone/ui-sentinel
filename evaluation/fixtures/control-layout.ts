/** Synthetic evaluation only. No expected verdicts, flags or private hints in the product DOM. */
export function controlLayoutFixture(
  mode:
    | 'healthy'
    | 'clipped'
    | 'overlap'
    | 'ellipsis'
    | 'scroll'
    | 'alternative'
    | 'unknown'
    | 'disabled'
    | 'layer'
    | 'budget',
  renamed = false,
) {
  const labels = renamed ? ['Archive receipt', 'Later'] : ['Review invoice', 'Next']
  const clipping = mode === 'clipped' ? 'height:12px;overflow:clip;' : ''
  const alternate = mode === 'alternative' ? 'title="Full action description"' : ''
  let buttons = `<button ${alternate} style="${clipping}${mode === 'ellipsis' ? 'width:60px;overflow:hidden;text-overflow:ellipsis;' : ''}${mode === 'scroll' ? 'width:60px;overflow:auto;' : ''}${mode === 'unknown' ? 'color:navy;' : ''}" ${mode === 'disabled' ? 'disabled' : ''}>${labels[0]}</button><button style="text-align:right;${mode === 'overlap' ? 'left:-110px;pointer-events:none;' : ''}">${labels[1]}</button>`
  if (mode === 'budget')
    buttons = Array.from({ length: 12 }, (_, i) => `<button>Item ${i}</button>`).join('')
  const group = renamed ? `<fieldset>${buttons}</fieldset>` : `<nav>${buttons}</nav>`
  return `<!doctype html><html><head><title>Local layout sample</title><style>html{background:white}body{margin:20px}nav,fieldset{display:block;white-space:nowrap;border:0;padding:0;margin:0}button{position:relative;appearance:none;border:0;border-radius:0;box-shadow:none;outline:none;padding:0;margin:0;width:200px;height:40px;background:white;color:black;font:400 20px Arial;line-height:24px;text-align:left;white-space:nowrap;overflow:visible}</style></head><body>${mode === 'layer' ? `<div role="dialog" aria-modal="true">${group}</div>` : group}</body></html>`
}
