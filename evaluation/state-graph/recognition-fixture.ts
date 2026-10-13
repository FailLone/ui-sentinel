import { complexFixtureHtml } from './complex-fixture.ts'

/** Recognition arena: no predicted headings on ordinary controls; oracle stays outside HTML. */
export function recognitionFixtureHtml(shelves = 28): string {
  return complexFixtureHtml(false)
    .replace('length:28', `length:${shelves}`)
    .replace(
      `'<button aria-description="Displays the heading '+heading+'. '+extra+'" data-target="'+target+'">'`,
      `'<button data-target="'+target+'">'`,
    )
    .replace(' aria-description="Editing keeps the heading Search records."', '')
    .replace(
      "+button('Delete workspace','delete','Deleted');",
      "+button('Refresh view','noop','')+button('Delete history guide','guide','')+button('Delete workspace','delete','Deleted');",
    )
    .replace(
      'let target=b.dataset.target;',
      "let target=b.dataset.target;if(target==='noop')return;",
    )
    .replace(
      'Usage rules: Continue opens the heading Receipt verified and displays Received via support.',
      'Usage rules: For offline support, choose Continue. Back leaves this guide without opening offline support.',
    )
    .replace(
      'Read the Usage rules in the full page text to find the destination heading and required receipt text.',
      'Consult the Usage rules near the end of this guide to understand the support action.',
    )
}
