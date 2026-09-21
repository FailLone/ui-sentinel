import { registerRule } from '../engine.ts'
import { overlayBlockingRule } from './overlay-blocking.ts'
import { businessOutcomeRule } from './business-outcome.ts'
import { responseTimeRule } from './response-time.ts'

export function registerBuiltinRules(): void {
  registerRule(overlayBlockingRule)
  registerRule(businessOutcomeRule)
  registerRule(responseTimeRule)
}

export { overlayBlockingRule, businessOutcomeRule, responseTimeRule }
