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

const REGION_STYLE: Record<SearchPresent, React.CSSProperties> = {
  // A continuous light field with no inner border. The real input is visibly narrower than the field.
  one: {
    background: '#f4f6f8',
    border: 'none',
    padding: '10px 64px',
    borderRadius: 6,
  },
  // The same field, drawn the same way; the difference is behavioural, not visual.
  two: {
    background: '#f4f6f8',
    border: 'none',
    padding: '10px 64px',
    borderRadius: 6,
  },
}

const INPUT_STYLE: React.CSSProperties = {
  width: 240,
  height: 28,
  border: 'none',
  outline: 'none',
  background: '#ffffff',
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
