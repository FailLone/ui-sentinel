import { useState, useEffect, useCallback } from 'react'
import { ProductList } from './pages/ProductList.tsx'
import { Cart } from './pages/Cart.tsx'
import { Checkout } from './pages/Checkout.tsx'
import { fetchCart, fetchVariantConfig, type CartResponse, type VariantConfig } from './api.ts'

type Page = 'products' | 'cart' | 'checkout'

export function App() {
  const [page, setPage] = useState<Page>('products')
  const [cart, setCart] = useState<CartResponse>({ items: [], total: 0 })
  const [variantConfig, setVariantConfig] = useState<VariantConfig>({
    overlay: false,
    overlayClosable: false,
    buttonRenamed: false,
    buttonMoved: false,
  })

  const refreshCart = useCallback(async () => {
    const data = await fetchCart()
    setCart(data)
  }, [])

  useEffect(() => {
    refreshCart()
    fetchVariantConfig().then(setVariantConfig)
  }, [refreshCart])

  const onCartUpdate = useCallback((data: CartResponse) => {
    setCart(data)
  }, [])

  return (
    <div className="app">
      <header>
        <h1>TechMart</h1>
        <nav>
          <a href="#" onClick={() => setPage('products')}>
            Products
          </a>
          <a href="#" onClick={() => setPage('cart')}>
            Cart
            {cart.items.length > 0 && <span className="badge">{cart.items.length}</span>}
          </a>
        </nav>
      </header>

      {page === 'products' && (
        <ProductList onCartUpdate={onCartUpdate} onGoToCart={() => setPage('cart')} />
      )}
      {page === 'cart' && (
        <Cart
          cart={cart}
          onCartUpdate={onCartUpdate}
          onCheckout={() => setPage('checkout')}
          onContinueShopping={() => setPage('products')}
        />
      )}
      {page === 'checkout' && (
        <Checkout
          cart={cart}
          variantConfig={variantConfig}
          onCartUpdate={onCartUpdate}
          onBackToProducts={() => setPage('products')}
        />
      )}
    </div>
  )
}
