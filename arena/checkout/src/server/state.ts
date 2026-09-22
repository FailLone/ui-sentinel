export type VariantId = 'C0' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5'

export interface Product {
  readonly id: string
  readonly name: string
  readonly price: number
  readonly image: string
  readonly description: string
}

export interface CartItem {
  readonly productId: string
  readonly quantity: number
}

export interface Order {
  readonly id: string
  readonly items: readonly CartItem[]
  readonly total: number
  readonly status: 'pending' | 'paid' | 'rejected' | 'failed'
  readonly paymentMessage?: string
  readonly createdAt: string
}

const PRODUCTS: readonly Product[] = Object.freeze([
  {
    id: 'prod-001',
    name: 'Wireless Bluetooth Headphones',
    price: 79.99,
    image: '/images/headphones.svg',
    description: 'High-quality wireless headphones with noise cancellation.',
  },
  {
    id: 'prod-002',
    name: 'USB-C Fast Charger',
    price: 29.99,
    image: '/images/charger.svg',
    description: 'Quick charge adapter supporting up to 65W output.',
  },
  {
    id: 'prod-003',
    name: 'Laptop Stand',
    price: 49.99,
    image: '/images/stand.svg',
    description: 'Adjustable aluminum laptop stand for ergonomic working.',
  },
])

interface ArenaState {
  variant: VariantId
  cart: CartItem[]
  orders: Order[]
  paymentRetryCount: number
}

let state: ArenaState = createFreshState('C0')

function createFreshState(variant: VariantId): ArenaState {
  return {
    variant,
    cart: [],
    orders: [],
    paymentRetryCount: 0,
  }
}

export function getVariant(): VariantId {
  return state.variant
}

export function getProducts(): readonly Product[] {
  return PRODUCTS
}

export function getCart(): readonly CartItem[] {
  return state.cart
}

export function getCartTotal(): number {
  return state.cart.reduce((sum, item) => {
    const product = PRODUCTS.find((p) => p.id === item.productId)
    return sum + (product?.price ?? 0) * item.quantity
  }, 0)
}

export function addToCart(productId: string, quantity: number): readonly CartItem[] {
  const product = PRODUCTS.find((p) => p.id === productId)
  if (!product) throw new Error(`Product not found: ${productId}`)

  const existing = state.cart.find((item) => item.productId === productId)
  if (existing) {
    state = {
      ...state,
      cart: state.cart.map((item) =>
        item.productId === productId ? { ...item, quantity: item.quantity + quantity } : item,
      ),
    }
  } else {
    state = {
      ...state,
      cart: [...state.cart, { productId, quantity }],
    }
  }
  return state.cart
}

export function removeFromCart(productId: string): readonly CartItem[] {
  state = {
    ...state,
    cart: state.cart.filter((item) => item.productId !== productId),
  }
  return state.cart
}

export function clearCart(): void {
  state = { ...state, cart: [] }
}

export interface PaymentResult {
  readonly success: boolean
  readonly orderId: string
  readonly status: Order['status']
  readonly message: string
  readonly canRetry: boolean
  readonly retryAvailable?: boolean
}

export function processPayment(): PaymentResult {
  if (state.cart.length === 0) {
    throw new Error('Cart is empty')
  }

  const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const total = getCartTotal()

  switch (state.variant) {
    case 'C4': {
      const order: Order = {
        id: orderId,
        items: [...state.cart],
        total,
        status: 'rejected',
        paymentMessage:
          'Payment declined: Insufficient funds. Please use a different payment method.',
        createdAt: new Date().toISOString(),
      }
      state = { ...state, orders: [...state.orders, order] }
      return {
        success: false,
        orderId,
        status: 'rejected',
        message: order.paymentMessage!,
        canRetry: true,
      }
    }

    case 'C5': {
      state = { ...state, paymentRetryCount: state.paymentRetryCount + 1 }
      const order: Order = {
        id: orderId,
        items: [...state.cart],
        total,
        status: 'failed',
        paymentMessage: 'Payment processing failed. Please try again.',
        createdAt: new Date().toISOString(),
      }
      state = { ...state, orders: [...state.orders, order] }
      return {
        success: false,
        orderId,
        status: 'failed',
        message: order.paymentMessage!,
        canRetry: true,
        retryAvailable: false,
      }
    }

    default: {
      const order: Order = {
        id: orderId,
        items: [...state.cart],
        total,
        status: 'paid',
        paymentMessage: 'Payment successful! Your order has been confirmed.',
        createdAt: new Date().toISOString(),
      }
      state = { ...state, orders: [...state.orders, order], cart: [] }
      return {
        success: true,
        orderId,
        status: 'paid',
        message: order.paymentMessage!,
        canRetry: false,
      }
    }
  }
}

export function getOrders(): readonly Order[] {
  return state.orders
}

export function resetState(variant: VariantId): void {
  state = createFreshState(variant)
}

export function getArenaState() {
  return {
    variant: state.variant,
    cartSize: state.cart.length,
    orderCount: state.orders.length,
    paymentRetryCount: state.paymentRetryCount,
  }
}
