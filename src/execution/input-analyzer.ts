export interface InputComposition {
  readonly totalBytes: number
  readonly parts: {
    readonly goal: number
    readonly rules: number
    readonly observation: number
    readonly history: number
    readonly notes: number
    readonly budget: number
  }
  readonly observationBreakdown: {
    readonly elements: number
    readonly hitSamples: number
    readonly text: number
    readonly metadata: number
  } | null
}

export function analyzeInputComposition(input: {
  goal: string
  knownRules: readonly unknown[]
  observation: unknown
  history: readonly unknown[]
  notes: readonly unknown[]
  budgetRemaining: unknown
}): InputComposition {
  const goalStr = JSON.stringify(input.goal)
  const rulesStr = JSON.stringify(input.knownRules)
  const observationStr = JSON.stringify(input.observation)
  const historyStr = JSON.stringify(input.history)
  const notesStr = JSON.stringify(input.notes)
  const budgetStr = JSON.stringify(input.budgetRemaining)

  const goalBytes = byteLength(goalStr)
  const rulesBytes = byteLength(rulesStr)
  const observationBytes = byteLength(observationStr)
  const historyBytes = byteLength(historyStr)
  const notesBytes = byteLength(notesStr)
  const budgetBytes = byteLength(budgetStr)

  const observationBreakdown = breakdownObservation(input.observation)

  return {
    totalBytes: goalBytes + rulesBytes + observationBytes + historyBytes + notesBytes + budgetBytes,
    parts: {
      goal: goalBytes,
      rules: rulesBytes,
      observation: observationBytes,
      history: historyBytes,
      notes: notesBytes,
      budget: budgetBytes,
    },
    observationBreakdown,
  }
}

function breakdownObservation(obs: unknown): InputComposition['observationBreakdown'] {
  if (!obs || typeof obs !== 'object') return null
  const snapshot = extractSnapshot(obs)
  if (!snapshot) return null

  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : []
  const elementsStr = JSON.stringify(elements)
  const elementsBytes = byteLength(elementsStr)

  let hitSamplesBytes = 0
  for (const el of elements) {
    if (el && typeof el === 'object') {
      if ('hitSamples' in el) hitSamplesBytes += byteLength(JSON.stringify(el.hitSamples))
      else if ('hit' in el) hitSamplesBytes += byteLength(JSON.stringify(el.hit))
    }
  }

  const textField =
    typeof snapshot.text === 'string'
      ? snapshot.text
      : typeof snapshot.pageText === 'string'
        ? snapshot.pageText
        : null
  const textBytes = textField !== null ? byteLength(JSON.stringify(textField)) : 0

  const metadataBytes = Math.max(
    0,
    byteLength(JSON.stringify(snapshot)) - elementsBytes - textBytes,
  )

  return {
    elements: elementsBytes,
    hitSamples: hitSamplesBytes,
    text: textBytes,
    metadata: metadataBytes,
  }
}

function extractSnapshot(obs: unknown): Record<string, unknown> | null {
  if (!obs || typeof obs !== 'object') return null
  const o = obs as Record<string, unknown>
  if ('snapshot' in o && o.snapshot && typeof o.snapshot === 'object') {
    return o.snapshot as Record<string, unknown>
  }
  if ('elements' in o) return o
  return null
}

function byteLength(str: string): number {
  return new TextEncoder().encode(str).byteLength
}

export function formatCompositionReport(comp: InputComposition): string {
  const pct = (bytes: number) =>
    comp.totalBytes > 0 ? `${((bytes / comp.totalBytes) * 100).toFixed(1)}%` : '0%'

  const lines = [
    `Total: ${comp.totalBytes} bytes`,
    `  goal: ${comp.parts.goal} (${pct(comp.parts.goal)})`,
    `  rules: ${comp.parts.rules} (${pct(comp.parts.rules)})`,
    `  observation: ${comp.parts.observation} (${pct(comp.parts.observation)})`,
    `  history: ${comp.parts.history} (${pct(comp.parts.history)})`,
    `  notes: ${comp.parts.notes} (${pct(comp.parts.notes)})`,
    `  budget: ${comp.parts.budget} (${pct(comp.parts.budget)})`,
  ]

  if (comp.observationBreakdown) {
    const ob = comp.observationBreakdown
    const obPct = (bytes: number) =>
      ob.elements > 0 ? `${((bytes / comp.parts.observation) * 100).toFixed(1)}%` : '0%'
    lines.push(
      `  observation breakdown:`,
      `    elements: ${ob.elements} (${obPct(ob.elements)})`,
      `    hitSamples: ${ob.hitSamples} (${obPct(ob.hitSamples)})`,
      `    text: ${ob.text} (${obPct(ob.text)})`,
      `    metadata: ${ob.metadata} (${obPct(ob.metadata)})`,
    )
  }

  return lines.join('\n')
}
