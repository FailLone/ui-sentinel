import { useState, useEffect } from 'react'
import { fetchProducts, addToCart, type Product, type CartResponse } from '../api.ts'
import { ProductSearch } from './ProductSearch.tsx'

interface Props {
  onCartUpdate: (cart: CartResponse) => void
  onGoToCart: () => void
}

const PRODUCT_ICONS: Record<string, string> = {
  'prod-001': '🎧',
  'prod-002': '🔌',
  'prod-003': '💻',
}

export function ProductList({ onCartUpdate, onGoToCart }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    fetchProducts().then(setProducts)
  }, [])

  async function handleAdd(productId: string) {
    setAdding(productId)
    try {
      const cart = await addToCart(productId)
      onCartUpdate(cart)
    } finally {
      setAdding(null)
    }
  }

  if (products.length === 0) {
    return <div className="loading">Loading products...</div>
  }

  // Local filter only. An empty query shows everything, so the purchase flow never depends on search.
  const normalized = query.trim().toLowerCase()
  const visible = normalized
    ? products.filter((product) => product.name.toLowerCase().includes(normalized))
    : products

  return (
    <div>
      <h2>Our Products</h2>
      <div style={{ maxWidth: 420, margin: '0 auto 20px' }}>
        <ProductSearch onQueryChange={setQuery} />
      </div>
      <div className="product-grid" data-product-count={visible.length}>
        {visible.map((product) => (
          <div key={product.id} className="product-card">
            <div className="product-image">{PRODUCT_ICONS[product.id] ?? '📦'}</div>
            <h3>{product.name}</h3>
            <div className="price">${product.price.toFixed(2)}</div>
            <p>{product.description}</p>
            <button
              className="btn btn-primary"
              onClick={() => handleAdd(product.id)}
              disabled={adding === product.id}
            >
              {adding === product.id ? 'Adding...' : 'Add to Cart'}
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <button className="btn btn-secondary" onClick={onGoToCart}>
          View Cart →
        </button>
      </div>
    </div>
  )
}
