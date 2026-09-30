import { useState, useEffect } from 'react'
import { fetchVariantConfig, type SearchPresent } from '../api.ts'

/**
 * Local product search.
 *
 * The search filters the list in the browser and never calls a business write, so the purchase flow
 * is untouched. It renders nothing unless the private controller asked for a search presentation, so
 * C0-C5 are unaffected, and it never filters on load - the evaluator clicks the first exact
 * "Add to Cart", so all products must stay visible until someone types.
 *
 * The two presentations differ only in how the same wide light area is drawn: one shows a narrow
 * native input centred in the padding, the other lets the whole reasonable area focus that input.
 * Nothing here names a case or states what is expected.
 */

/**
 * One field, drawn once and shared by both presentations.
 *
 * The two presentations differ only in whether a click on the field hands focus to the input, so
 * they must render identically or the comparison would be between two different pictures. Sharing
 * the object makes that structural: there is no second style to drift.
 *
 * The fill, border and radius are what make the field readable as a single input at all. An earlier
 * version drew it as `#f4f6f8` on a `#f5f5f5` page with no border - three levels out of 255 - which
 * is below the point where the shape is visible. The fixture then asked a vision model to report a
 * region that the screenshot did not contain.
 */
const FIELD_STYLE: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #b9c2cf',
  padding: '10px 64px',
  borderRadius: 8,
}

const REGION_STYLE: Record<SearchPresent, React.CSSProperties> = {
  one: FIELD_STYLE,
  two: FIELD_STYLE,
}

/**
 * The real input inside the field: no fill and no border of its own.
 *
 * Plan 1's case only exists when the field reads as one input whose text-entry part is narrower than
 * the shape. A white input on a tinted field draws two nested controls, and the real vision model
 * duly reported the inner box - so the region the fixture is about was never the one measured. With
 * the input transparent the bordered field is the single visible control, which is both how ordinary
 * search bars are built and what makes the case meaningful.
 */
const INPUT_STYLE: React.CSSProperties = {
  width: 240,
  height: 28,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  font: 'inherit',
  padding: '0 8px',
}

export function ProductSearch({ onQueryChange }: { onQueryChange: (query: string) => void }) {
  const [present, setPresent] = useState<SearchPresent | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetchVariantConfig().then((config) => setPresent(config.search?.present ?? null))
  }, [])

  if (present === null) return null

  const update = (value: string) => {
    setQuery(value)
    onQueryChange(value)
  }

  // The proxied presentation hands focus to the input from anywhere in the region, the way a label
  // or a container event delegate would. The padded one has no such delegate.
  const proxied = present === 'two'

  return (
    <div
      className="visual-search-region"
      style={REGION_STYLE[present]}
      onClick={(event) => {
        if (proxied && event.target === event.currentTarget) {
          event.currentTarget.querySelector('input')?.focus()
        }
      }}
    >
      <input
        type="search"
        aria-label="Search products"
        placeholder="Search products"
        style={INPUT_STYLE}
        value={query}
        onChange={(event) => update(event.target.value)}
      />
    </div>
  )
}
