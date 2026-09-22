import { useState, useEffect } from 'react'
import {
  fetchProducts,
  checkout,
  type Product,
  type CartResponse,
  type PaymentResult,
  type VariantConfig,
} from '../api.ts'

interface Props {
  cart: CartResponse
  variantConfig: VariantConfig
  onCartUpdate: (cart: CartResponse) => void
  onBackToProducts: () => void
}

export function Checkout({ cart, variantConfig, onCartUpdate, onBackToProducts }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState<PaymentResult | null>(null)
  const [overlayVisible, setOverlayVisible] = useState(variantConfig.overlay)
  const [retryDisabled, setRetryDisabled] = useState(false)

  useEffect(() => {
    fetchProducts().then(setProducts)
  }, [])

  useEffect(() => {
    if (variantConfig.overlay) {
      setOverlayVisible(true)
    }
  }, [variantConfig.overlay])

  function getProduct(productId: string): Product | undefined {
    return products.find((p) => p.id === productId)
  }

  async function handlePayment() {
    setProcessing(true)
    setResult(null)
    try {
      const paymentResult = await checkout()
      setResult(paymentResult)
      setRetryDisabled(paymentResult.retryAvailable === false)
      if (paymentResult.success) {
        onCartUpdate({ items: [], total: 0 })
      }
    } catch {
      setResult({
        success: false,
        orderId: '',
        status: 'error',
        message: 'An unexpected error occurred. Please try again.',
        canRetry: true,
      })
    } finally {
      setProcessing(false)
    }
  }

  async function handleRetry() {
    setRetryDisabled(true)
    await handlePayment()
  }

  const submitLabel = variantConfig.buttonRenamed ? 'Complete Purchase' : 'Pay Now'

  if (cart.items.length === 0 && !result) {
    return (
      <div className="checkout-page">
        <h2>Checkout</h2>
        <div className="empty-cart">
          <p>Your cart is empty</p>
          <button className="btn btn-primary" onClick={onBackToProducts}>
            Browse Products
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="checkout-page">
      <h2>Checkout</h2>

      {!result && (
        <>
          <div className="order-summary">
            <h3>Order Summary</h3>
            {cart.items.map((item) => {
              const product = getProduct(item.productId)
              return (
                <div
                  key={item.productId}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}
                >
                  <span>
                    {product?.name ?? item.productId} × {item.quantity}
                  </span>
                  <span>${((product?.price ?? 0) * item.quantity).toFixed(2)}</span>
                </div>
              )
            })}
            <div
              style={{
                borderTop: '1px solid #ddd',
                paddingTop: 8,
                marginTop: 8,
                fontWeight: 700,
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>Total</span>
              <span>${cart.total.toFixed(2)}</span>
            </div>
          </div>

          <div
            style={
              variantConfig.buttonMoved
                ? { display: 'flex', flexDirection: 'row-reverse', gap: 12 }
                : { display: 'flex', gap: 12 }
            }
          >
            <button
              className="btn btn-primary"
              onClick={handlePayment}
              disabled={processing}
              data-testid="pay-button"
            >
              {processing ? 'Processing...' : submitLabel}
            </button>
            <button className="btn btn-secondary" onClick={onBackToProducts}>
              Back
            </button>
          </div>
        </>
      )}

      {result && (
        <div className={`payment-result ${result.success ? 'success' : 'error'}`}>
          <h3>{result.success ? 'Order Confirmed!' : 'Payment Failed'}</h3>
          <p>{result.message}</p>
          {result.orderId && (
            <p style={{ fontSize: '0.85rem', color: '#888' }}>Order ID: {result.orderId}</p>
          )}
          <div className="payment-actions">
            {result.success && (
              <button className="btn btn-primary" onClick={onBackToProducts}>
                Continue Shopping
              </button>
            )}
            {!result.success && result.canRetry && (
              <button
                className="btn btn-primary"
                onClick={handleRetry}
                disabled={retryDisabled}
                data-testid="retry-button"
              >
                {retryDisabled ? 'Retrying...' : 'Try Again'}
              </button>
            )}
            {!result.success && (
              <button className="btn btn-secondary" onClick={onBackToProducts}>
                Back to Products
              </button>
            )}
          </div>
        </div>
      )}

      {overlayVisible && (
        <div className="overlay" data-testid="checkout-overlay">
          <div className="overlay-content">
            <h2>🎉 Special Offer!</h2>
            <p>
              Get 50% off on your next purchase! Use code <strong>SAVE50</strong> at checkout.
              Limited time offer - don't miss out!
            </p>
            <p style={{ fontSize: '0.85rem', color: '#999' }}>
              This promotion is available for a limited time only.
            </p>
            {variantConfig.overlayClosable && (
              <div className="overlay-close">
                <button
                  className="btn btn-secondary"
                  onClick={() => setOverlayVisible(false)}
                  data-testid="close-overlay"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
