export interface RuleContext {
  readonly runId: string
  readonly currentUrl: string
  readonly pageTitle: string
  readonly timestamp: string
  readonly events: readonly RuleEvent[]
  readonly snapshot: PageSnapshot
}

export interface RuleEvent {
  readonly type: string
  readonly timestamp: string
  readonly payload: Record<string, unknown>
}

export interface PageSnapshot {
  readonly url: string
  readonly title: string
  readonly viewport: { readonly width: number; readonly height: number }
  readonly elements: readonly PageElement[]
  readonly screenshotPath?: string
  readonly transitionObservations?: readonly import('./transition.ts').TransitionObservation[]
}

export interface PageElement {
  readonly selector: string
  readonly tag: string
  readonly text: string
  readonly visible: boolean
  readonly bounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
  readonly attributes: Record<string, string>
  readonly enabled?: boolean
  readonly hitSamples?: readonly {
    readonly x: number
    readonly y: number
    readonly hitSelector: string | null
    readonly relation: 'self' | 'descendant' | 'ancestor' | 'unrelated' | 'none'
    readonly blockerBounds?: { x: number; y: number; width: number; height: number }
  }[]
}

export type RuleVerdict = 'pass' | 'fail' | 'unknown' | 'not-applicable'

export interface RuleResult {
  readonly ruleId: string
  readonly ruleRevision: string
  readonly verdict: RuleVerdict
  readonly severity: 'error' | 'warning' | 'info'
  readonly title: string
  readonly expected: string
  readonly actual: string
  readonly evidenceRefs: readonly string[]
  readonly confidence: number
  readonly details: Record<string, unknown>
}

export interface Rule {
  readonly declaration?: import('./transition.ts').TransitionRuleConfig
  readonly id: string
  readonly revision: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly enabled: boolean
  evaluate(context: RuleContext): Promise<RuleResult>
}
