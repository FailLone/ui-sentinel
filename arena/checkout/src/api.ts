const BASE = ''

interface Product {
  readonly id: string
  readonly name: string
  readonly price: number
  readonly image: string
  readonly description: string
}

interface CartItem {
  readonly productId: string
  readonly quantity: number
}

interface CartResponse {
  readonly items: readonly CartItem[]
  readonly total: number
}

interface PaymentResult {
  readonly success: boolean
  readonly orderId: string
  readonly status: string
  readonly message: string
  readonly canRetry: boolean
  readonly retryAvailable?: boolean
}

interface VariantConfig {
  readonly overlay: boolean
  readonly overlayClosable: boolean
  readonly buttonRenamed: boolean
  readonly buttonMoved: boolean
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  return res.json() as Promise<T>
}

export function fetchProducts(): Promise<Product[]> {
  return request('/api/products')
}

export function fetchCart(): Promise<CartResponse> {
  return request('/api/cart')
}

export function addToCart(productId: string, quantity = 1): Promise<CartResponse> {
  return request('/api/cart/add', {
    method: 'POST',
    body: JSON.stringify({ productId, quantity }),
  })
}

export function removeFromCart(productId: string): Promise<CartResponse> {
  return request('/api/cart/remove', {
    method: 'POST',
    body: JSON.stringify({ productId }),
  })
}

export function checkout(): Promise<PaymentResult> {
  return request('/api/checkout', { method: 'POST' })
}

export function fetchVariantConfig(): Promise<VariantConfig> {
  return request('/api/variant-config')
}

export type { Product, CartItem, CartResponse, PaymentResult, VariantConfig }
