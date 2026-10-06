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
  iconAfter?: boolean
  icon?: string
  card?: boolean
  clear?: boolean
  wrap?: CSSProperties
}
// Fresh P4 presentations use grid/flex allocation rather than the original padding-only boxes.
const trailing: Layout = {
  field: {
    display: 'flex',
    justifyContent: 'center',
    width: 360,
    height: 60,
    gap: 20,
    background: '#eef5ff',
    border: '1px solid #8faed0',
    borderRadius: 12,
  },
  input: { ...bare, width: 164 },
  label: 'Browse the collection',
  placeholder: 'Find a product',
  icon: '⌕',
  iconAfter: true,
  wrap: { width: 360, marginTop: 22, marginRight: 92 },
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
  'search-sage-grid-field': {
    field: {
      display: 'grid',
      gridTemplateColumns: '82px 196px 80px',
      gap: 0,
      width: 360,
      height: 64,
      background: '#edf5ef',
      border: '1px solid #95b49f',
      borderRadius: 16,
    },
    input: { ...bare, width: 196, gridColumn: 2 },
    placeholder: 'Look up an item',
    wrap: { marginTop: 18, marginLeft: 126 },
  },
  'search-blue-trailing-field': trailing,
  'search-blue-trailing-proxy': { ...trailing, delegate: true, clear: true },
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
      {layout.card || layout.iconAfter ? null : icon}
      <input
        id={inputId}
        type="search"
        aria-label={layout.placeholder}
        placeholder={layout.placeholder}
        style={layout.input}
      />
      {layout.iconAfter ? icon : null}
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
