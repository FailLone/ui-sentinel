import type { Decide } from '../../src/execution/exploration/run.ts'
/** Fixed public-evidence driver used only for free plumbing checks. */
export const complexScriptedDecision: Decide = async (input, read) => {
  const control = input.candidates[0]!
  if (control.name === 'Continue' && input.heading === 'Usage guide') {
    const text = read({ kind: 'text', offset: 2000 }) as { text: string }
    const expectedHeading = /heading (.+?) and displays/.exec(text.text)?.[1]
    if (!expectedHeading) throw Error('missing-guide-evidence')
    return { ref: control.ref, expectedHeading, expectedText: 'Received via support' }
  }
  if (input.heading === 'Session')
    return {
      ref: control.ref,
      expectedHeading:
        control.name === 'Prepare'
          ? 'Session'
          : input.journey?.some((hop) => hop.control === 'Prepare')
            ? 'Ready'
            : 'Not ready',
    }
  const expectedHeading = /heading ([^.]+)\./i.exec(control.description)?.[1]
  if (!expectedHeading) throw Error('missing-public-expectation')
  return {
    ref: control.ref,
    expectedHeading,
    expectedText: /result identifies ([^.]+)\./.exec(control.description)?.[1],
  }
}
