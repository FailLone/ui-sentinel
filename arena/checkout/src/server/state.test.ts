import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetState,
  getVariant,
  getProducts,
  getCart,
  getCartTotal,
  addToCart,
  removeFromCart,
  clearCart,
  processPayment,
  getOrders,
  getArenaState,
} from './state.ts'

describe('arena state', () => {
  beforeEach(() => {
    resetState('C0')
  })

  it('has 3 products', () => {
    expect(getProducts()).toHaveLength(3)
    expect(getProducts()[0]).toHaveProperty('id')
    expect(getProducts()[0]).toHaveProperty('price')
  })

  it('starts with empty cart', () => {
    expect(getCart()).toHaveLength(0)
    expect(getCartTotal()).toBe(0)
  })

  it('adds items to cart', () => {
    addToCart('prod-001', 1)
    expect(getCart()).toHaveLength(1)
    expect(getCart()[0].productId).toBe('prod-001')
    expect(getCart()[0].quantity).toBe(1)
  })

  it('increments quantity for duplicate add', () => {
    addToCart('prod-001', 1)
    addToCart('prod-001', 2)
    expect(getCart()).toHaveLength(1)
    expect(getCart()[0].quantity).toBe(3)
  })

  it('calculates cart total', () => {
    addToCart('prod-001', 1)
    addToCart('prod-002', 2)
    expect(getCartTotal()).toBeCloseTo(79.99 + 29.99 * 2)
  })

  it('removes items from cart', () => {
    addToCart('prod-001', 1)
    addToCart('prod-002', 1)
    removeFromCart('prod-001')
    expect(getCart()).toHaveLength(1)
    expect(getCart()[0].productId).toBe('prod-002')
  })

  it('clears cart', () => {
    addToCart('prod-001', 1)
    clearCart()
    expect(getCart()).toHaveLength(0)
  })

  it('throws on invalid product', () => {
    expect(() => addToCart('invalid', 1)).toThrow('Product not found')
  })
})

describe('payment variants', () => {
  beforeEach(() => {
    resetState('C0')
  })

  it('C0: payment succeeds', () => {
    addToCart('prod-001', 1)
    const result = processPayment()
    expect(result.success).toBe(true)
    expect(result.status).toBe('paid')
    expect(getCart()).toHaveLength(0)
    expect(getOrders()).toHaveLength(1)
  })

  it('C4: payment rejected with clear message', () => {
    resetState('C4')
    addToCart('prod-001', 1)
    const result = processPayment()
    expect(result.success).toBe(false)
    expect(result.status).toBe('rejected')
    expect(result.message).toContain('Insufficient funds')
    expect(result.canRetry).toBe(true)
  })

  it('C5: payment always fails even on retry', () => {
    resetState('C5')
    addToCart('prod-001', 1)

    const first = processPayment()
    expect(first.success).toBe(false)
    expect(first.status).toBe('failed')
    expect(first.canRetry).toBe(true)

    addToCart('prod-002', 1)
    const second = processPayment()
    expect(second.success).toBe(false)
    expect(second.status).toBe('failed')

    expect(getArenaState().paymentRetryCount).toBe(2)
  })

  it('throws when cart is empty', () => {
    expect(() => processPayment()).toThrow('Cart is empty')
  })
})

describe('variant config', () => {
  it('tracks variant state', () => {
    resetState('C3')
    expect(getVariant()).toBe('C3')
    expect(getArenaState().variant).toBe('C3')
  })

  it('resets all state on variant change', () => {
    addToCart('prod-001', 1)
    processPayment()
    resetState('C1')
    expect(getCart()).toHaveLength(0)
    expect(getOrders()).toHaveLength(0)
    expect(getVariant()).toBe('C1')
  })
})

it('isolates the healthy learning counterexample and restores the original C5 defect on reset', () => {
  resetState('C5', true)
  addToCart('prod-001', 1)
  expect(processPayment()).toMatchObject({
    success: false,
    status: 'failed',
    canRetry: true,
    retryAvailable: true,
  })
  resetState('C5')
  addToCart('prod-001', 1)
  expect(processPayment()).toMatchObject({
    success: false,
    status: 'failed',
    canRetry: true,
    retryAvailable: false,
  })
  expect(() => resetState('C0', true)).toThrow('only valid')
})
