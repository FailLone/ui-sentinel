import type { CSSProperties } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { VisualPresent } from './state.ts'

// This module is server-only. Public markup describes the current DOM, not a scenario token or truth.
const inputId = 'product-search-input'
const bare: CSSProperties = {
  height: 28,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  font: 'inherit',
}
const plain: CSSProperties = {
  background: '#fff',
  border: '1px solid #b9c2cf',
  padding: '10px 64px',
  borderRadius: 8,
}
const pill: CSSProperties = {
  background: '#fff',
  border: '2px solid #b9c2cf',
  padding: '12px 52px',
  borderRadius: 999,
}

interface Layout {
  field: CSSProperties
  input: CSSProperties
  delegate?: boolean
  label?: string
  placeholder: string
  icon?: string
  card?: boolean
  clear?: boolean
  wrap?: CSSProperties
}
const layouts: Record<VisualPresent, Layout> = {
  'search-padded-narrow-input': {
    field: plain,
    input: { ...bare, width: 240 },
    placeholder: 'Search products',
  },
  'search-proxied-wide-region': {
    field: plain,
    input: { ...bare, width: 240 },
    placeholder: 'Search products',
    delegate: true,
  },
  'search-bounded-line-card': {
    field: { background: 'transparent', border: 'none', padding: 0 },
    input: {
      height: 34,
      width: 260,
      background: '#fff',
      border: '1px solid #9aa4b2',
      borderRadius: 6,
      padding: '0 10px',
      outline: 'none',
      font: 'inherit',
    },
    placeholder: 'Search products',
    icon: '🔎',
    card: true,
  },
  'search-warm-offset-field': {
    field: {
      background: '#f3f0ea',
      border: '1px solid #cdbfa6',
      padding: '12px 56px',
      borderRadius: 4,
    },
    input: { ...bare, width: 180 },
    placeholder: 'Find accessories',
    wrap: { display: 'flex', justifyContent: 'flex-end', paddingRight: 24 },
  },
  'search-label-icon-field': {
    field: pill,
    input: { ...bare, width: 200 },
    label: 'Search products',
    placeholder: 'Search products',
    icon: '⌕',
  },
  'search-labelled-proxy-field': {
    field: pill,
    input: { ...bare, width: 200 },
    label: 'Search products',
    placeholder: 'Search products',
    icon: '⌕',
    delegate: true,
    clear: true,
  },
}

export function renderSearch(presentation: VisualPresent): string {
  const layout = layouts[presentation]
  if (!layout) throw Error('Unknown search presentation')
  const Field = layout.delegate ? 'label' : 'div'
  const icon = layout.icon ? (
    <span className="visual-search-icon" aria-hidden="true">
      {layout.icon}
    </span>
  ) : null
  const field = (
    <Field
      className="visual-search-region"
      style={layout.field}
      {...(layout.delegate ? { htmlFor: inputId } : {})}
    >
      {layout.card ? null : icon}
      <input
        id={inputId}
        type="search"
        aria-label={layout.placeholder}
        placeholder={layout.placeholder}
        style={layout.input}
      />
    </Field>
  )
  return renderToStaticMarkup(
    layout.card ? (
      <div className="visual-search-card" style={{ padding: 28 }}>
        <div className="visual-search-row">
          {icon}
          {field}
        </div>
      </div>
    ) : (
      <div className="visual-search-wrap" style={layout.wrap}>
        {layout.label ? (
          <label htmlFor={inputId} className="visual-search-label">
            {layout.label}
          </label>
        ) : null}
        {field}
        {layout.clear ? (
          <button type="button" className="visual-search-clear">
            Clear search
          </button>
        ) : null}
      </div>
    ),
  )
}
