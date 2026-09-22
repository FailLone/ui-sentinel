import { useState, useEffect } from 'react'
import { fetchProducts, removeFromCart, type Product, type CartResponse } from '../api.ts'

interface Props {
  cart: CartResponse
  onCartUpdate: (cart: CartResponse) => void
  onCheckout: () => void
  onContinueShopping: () => void
}

export function Cart({ cart, onCartUpdate, onCheckout, onContinueShopping }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    fetchProducts().then(setProducts)
  }, [])

  function getProduct(productId: string): Product | undefined {
    return products.find((p) => p.id === productId)
  }

  async function handleRemove(productId: string) {
    setRemoving(productId)
    try {
      const updated = await removeFromCart(productId)
      onCartUpdate(updated)
    } finally {
      setRemoving(null)
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="cart-page">
        <h2>Shopping Cart</h2>
        <div className="empty-cart">
          <p>Your cart is empty</p>
          <button
            className="btn btn-primary"
            onClick={onContinueShopping}
            style={{ marginTop: 16 }}
          >
            Continue Shopping
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="cart-page">
      <h2>Shopping Cart</h2>
      {cart.items.map((item) => {
        const product = getProduct(item.productId)
        return (
          <div key={item.productId} className="cart-item">
            <div>
              <strong>{product?.name ?? item.productId}</strong>
              <div style={{ color: '#666', fontSize: '0.9rem' }}>
                Qty: {item.quantity} × ${product?.price.toFixed(2) ?? '?'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700 }}>
                ${((product?.price ?? 0) * item.quantity).toFixed(2)}
              </span>
              <button
                className="btn btn-danger"
                onClick={() => handleRemove(item.productId)}
                disabled={removing === item.productId}
                style={{ padding: '6px 12px', fontSize: '0.85rem' }}
              >
                Remove
              </button>
            </div>
          </div>
        )
      })}
      <div className="cart-summary">
        <span className="total">Total: ${cart.total.toFixed(2)}</span>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-secondary" onClick={onContinueShopping}>
            Continue Shopping
          </button>
          <button className="btn btn-primary" onClick={onCheckout}>
            Proceed to Checkout
          </button>
        </div>
      </div>
    </div>
  )
}
