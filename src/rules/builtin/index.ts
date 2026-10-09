import { controlTextDisappearanceRule } from './control-text-disappearance.ts'
import { imageShapeDistortionRule } from './image-shape-distortion.ts'
import { registerRule } from '../engine.ts'
import { overlayBlockingRule } from './overlay-blocking.ts'
import { businessOutcomeRule } from './business-outcome.ts'
import { responseTimeRule } from './response-time.ts'

export function registerBuiltinRules(): void {
  registerRule(controlTextDisappearanceRule)
  registerRule(imageShapeDistortionRule)
  registerRule(overlayBlockingRule)
  registerRule(businessOutcomeRule)
  registerRule(responseTimeRule)
}

export { overlayBlockingRule, businessOutcomeRule, responseTimeRule }

export {
  imageShapeDistortionRule,
  createImageShapeDistortionRule,
} from './image-shape-distortion.ts'

export {
  controlTextDisappearanceRule,
  createControlTextDisappearanceRule,
} from './control-text-disappearance.ts'
