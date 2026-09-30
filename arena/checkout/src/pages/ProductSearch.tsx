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
 * Each presentation draws one search area. None of them names a case or states what is expected, and
 * nothing in the rendered markup reports which behaviour the area has: a marker such as
 * `data-proxy="label"` would tell the agent which page is the healthy one.
 */

/**
 * Show how one presentation draws its search area.
 *
 * Tokens arrive as opaque `vN` strings. An unrecognised token falls back to the plain field rather
 * than rendering nothing, so a mismatch is a visible search area the tests can catch instead of a
 * silent absence that every assertion would pass over.
 */
interface Layout {
  /** The wide shape a user would click. */
  readonly field: React.CSSProperties
  /** The real input's own box; no fill of its own, so it never reads as a second control. */
  readonly input: React.CSSProperties
  /** How the wide shape hands focus to the input, if at all. */
  readonly proxy: 'field' | 'label' | 'none'
  /** Visible label text, associated with the input by `for`/`id`. */
  readonly label: string | null
  /** A decorative glyph. Not part of the input, whether it sits inside the field or beside it. */
  readonly icon: string | null
  readonly iconInsideField: boolean
  /** Padding belonging to the surrounding card rather than to the input. */
  readonly cardPaddingPx: number
  /** Where the area sits in the column. Lets a case be genuinely elsewhere, not just redrawn. */
  readonly wrap?: React.CSSProperties
}

const FIELD = {
  plain: {
    background: '#ffffff',
    border: '1px solid #b9c2cf',
    padding: '10px 64px',
    borderRadius: 8,
  },
  // A different place, width, corner radius and palette for the same class of defect.
  warm: {
    background: '#f3f0ea',
    border: '1px solid #cdbfa6',
    padding: '12px 56px',
    borderRadius: 4,
  },
  pill: {
    background: '#ffffff',
    border: '2px solid #b9c2cf',
    padding: '12px 52px',
    borderRadius: 999,
  },
  // No shape of its own: the input's own border is the whole control.
  none: { background: 'transparent', border: 'none', padding: 0, borderRadius: 0 },
} satisfies Record<string, React.CSSProperties>

const INPUT = {
  bare: { height: 28, border: 'none', outline: 'none', background: 'transparent', font: 'inherit' },
  bordered: {
    height: 34,
    background: '#ffffff',
    border: '1px solid #9aa4b2',
    borderRadius: 6,
    padding: '0 10px',
    outline: 'none',
    font: 'inherit',
  },
} satisfies Record<string, React.CSSProperties>

/**
 * v1/v2 are the wide-field pair; v3 is the bordered-input-in-a-card case; v4 is the warm offset
 * field; v5/v6 are the labelled pair, defect and healthy twin.
 *
 * v5 and v6 share their drawing but differ in `proxy`, which is the one thing a screenshot cannot
 * show and only real interaction can decide - exactly the split the round is about.
 */
const LAYOUTS: Record<string, Layout> = {
  v1: {
    field: FIELD.plain,
    input: { ...INPUT.bare, width: 240 },
    proxy: 'none',
    label: null,
    icon: null,
    iconInsideField: false,
    cardPaddingPx: 0,
  },
  v2: {
    field: FIELD.plain,
    input: { ...INPUT.bare, width: 240 },
    proxy: 'field',
    label: null,
    icon: null,
    iconInsideField: false,
    cardPaddingPx: 0,
  },
  v3: {
    field: FIELD.none,
    input: { ...INPUT.bordered, width: 260 },
    proxy: 'none',
    label: null,
    icon: '🔎',
    iconInsideField: false,
    cardPaddingPx: 28,
  },
  v4: {
    field: FIELD.warm,
    input: { ...INPUT.bare, width: 180 },
    proxy: 'none',
    label: null,
    icon: null,
    iconInsideField: false,
    cardPaddingPx: 0,
    // Right-aligned and narrower than the column, so this case is in a different place at a
    // different size rather than the same rectangle in different colours.
    wrap: { display: 'flex', justifyContent: 'flex-end', paddingRight: 24 },
  },
  v5: {
    field: FIELD.pill,
    input: { ...INPUT.bare, width: 200 },
    proxy: 'none',
    label: 'Search products',
    icon: '⌕',
    iconInsideField: true,
    cardPaddingPx: 0,
  },
  v6: {
    field: FIELD.pill,
    input: { ...INPUT.bare, width: 200 },
    proxy: 'label',
    label: 'Search products',
    icon: '⌕',
    iconInsideField: true,
    cardPaddingPx: 0,
  },
}

const DEFAULT_LAYOUT = LAYOUTS.v1!
const INPUT_ID = 'product-search-input'

export function ProductSearch({ onQueryChange }: { onQueryChange: (query: string) => void }) {
  const [present, setPresent] = useState<SearchPresent | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetchVariantConfig().then((config) => setPresent(config.search?.present ?? null))
  }, [])

  if (present === null) return null

  const layout = LAYOUTS[present] ?? DEFAULT_LAYOUT
  const icon =
    layout.icon === null ? null : (
      <span className="visual-search-icon" aria-hidden="true">
        {layout.icon}
      </span>
    )

  const field = (
    <div
      className="visual-search-region"
      style={layout.field}
      onClick={(event) => {
        // Only a click on the field itself: a click on the input must not be re-handled here.
        if (layout.proxy === 'field' && event.target === event.currentTarget)
          event.currentTarget.querySelector('input')?.focus()
      }}
    >
      {layout.iconInsideField ? icon : null}
      <input
        id={INPUT_ID}
        type="search"
        aria-label="Search products"
        placeholder="Search products"
        style={layout.input}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          onQueryChange(event.target.value)
        }}
      />
    </div>
  )

  const labelled = (
    <div className="visual-search-wrap" style={layout.wrap}>
      {layout.label === null ? null : (
        <label htmlFor={INPUT_ID} className="visual-search-label">
          {layout.label}
        </label>
      )}
      {layout.proxy === 'label' ? (
        // A label delegate: focus follows a click anywhere in the labelled group, the way a real
        // label-for-control behaves.
        <div onClick={() => document.getElementById(INPUT_ID)?.focus()}>{field}</div>
      ) : (
        field
      )}
    </div>
  )

  // Card presentations carry the glyph and padding outside the control, so the control is only ever
  // the input itself.
  if (layout.cardPaddingPx > 0)
    return (
      <div className="visual-search-card" style={{ padding: layout.cardPaddingPx }}>
        <div className="visual-search-row">
          {icon}
          {field}
        </div>
      </div>
    )

  return labelled
}
