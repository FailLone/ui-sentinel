import type { BusinessProfile } from '../types.ts'

/**
 * Shopping profile. Wording is the public requirement set the shopping inspection has always
 * declared; it is now versioned data instead of prose buried in the policy string, so a report
 * can show which revision produced a verdict.
 */
export const checkoutProfile: BusinessProfile = Object.freeze({
  id: 'checkout' as const,
  revision: '1',
  name: 'Shopping checkout',
  description:
    'Complete one purchase and inspect its payment outcome, recovery control and campaign overlay behaviour.',
  adapterRevision: '1',
  requirements: Object.freeze([
    Object.freeze({
      id: 'overlay-not-blocking',
      revision: '1',
      text: 'Campaign overlays must not block the primary submit action.',
      source: Object.freeze({ kind: 'project-config' as const, ref: 'profiles/checkout#overlay' }),
    }),
    Object.freeze({
      id: 'rejection-reason-visible',
      revision: '1',
      text: 'A payment rejection is acceptable when its reason is clearly communicated.',
      source: Object.freeze({
        kind: 'project-config' as const,
        ref: 'profiles/checkout#rejection',
      }),
    }),
    Object.freeze({
      id: 'retry-operable-window',
      revision: '1',
      text: 'A retryable failure must offer an operable retry within 5 seconds.',
      source: Object.freeze({ kind: 'project-config' as const, ref: 'profiles/checkout#retry' }),
    }),
    Object.freeze({
      id: 'feedback-within-warning',
      revision: '1',
      text: 'Feedback arriving later than 10 seconds is a warning, not a failure.',
      source: Object.freeze({ kind: 'project-config' as const, ref: 'profiles/checkout#feedback' }),
    }),
    Object.freeze({
      id: 'one-order-only',
      revision: '1',
      text: 'This inspection permits exactly one order; further network writes are refused.',
      source: Object.freeze({
        kind: 'project-config' as const,
        ref: 'profiles/checkout#order-limit',
      }),
    }),
  ]),
  retryAvailabilityMs: 5000,
  feedbackWarningMs: 10000,
  effects: Object.freeze({ maxCreates: 1, maxRetriesPerOperation: 0 }),
  environments: Object.freeze(['default', 'arena'] as const),
  defaultEnvironment: 'arena' as const,
  entryPath: '/',
  // Cart mutation is preparation for the single checkout; the checkout itself consumes the
  // create budget. Both stay refused once the order has been produced.
  prepareWrites: Object.freeze([
    Object.freeze({ method: 'POST', path: '/api/cart/add' }),
    Object.freeze({ method: 'POST', path: '/api/cart/remove' }),
  ]),
})

/**
 * Export profile. Declares no prepare writes: creating the job is the only write, and the one
 * permitted retry belongs to that same job rather than being a second create.
 */
export const exportProfile: BusinessProfile = Object.freeze({
  id: 'export' as const,
  revision: '1',
  name: 'Dataset export',
  description:
    'Create one dataset export job and inspect its asynchronous outcome and recovery experience.',
  adapterRevision: '1',
  requirements: Object.freeze([
    Object.freeze({
      id: 'recovery-operable-window',
      revision: '1',
      text: 'A recoverable failure should offer an operable recovery entry within the 5 second check window.',
      source: Object.freeze({ kind: 'project-config' as const, ref: 'profiles/export#recovery' }),
    }),
    Object.freeze({
      id: 'single-retry-allowed',
      revision: '1',
      text: 'When explicitly permitted, the same export job may be retried once.',
      source: Object.freeze({ kind: 'project-config' as const, ref: 'profiles/export#retry' }),
    }),
    Object.freeze({
      id: 'rejection-not-defect',
      revision: '1',
      text: 'A justified business rejection is not a product fault.',
      source: Object.freeze({ kind: 'project-config' as const, ref: 'profiles/export#rejection' }),
    }),
  ]),
  retryAvailabilityMs: 5000,
  feedbackWarningMs: 10000,
  effects: Object.freeze({ maxCreates: 1, maxRetriesPerOperation: 1 }),
  environments: Object.freeze(['export-arena'] as const),
  defaultEnvironment: 'export-arena' as const,
  entryPath: '/',
  prepareWrites: Object.freeze([]),
})
