/** Synthetic protocol fixtures; never imported by runtime modules. */
import { readFileSync } from 'node:fs'
import type { ExplorationInput } from '../../src/agent/decisions/exploration/contracts.ts'
import type { Compiled } from '../../src/agent/decisions/jev-provider/compile.ts'
import { DEFAULT_PROFILE } from '../../src/agent/decisions/jev-provider/profile.ts'
export function testInput(): ExplorationInput {
  const data = JSON.parse(readFileSync('evaluation/r1-jev-quality/development-inputs.json', 'utf8'))
  const input = data.cases[0].input as ExplorationInput
  input.state.cacheable = true
  return input
}
export function replyFor(compiled: Pick<Compiled, 'questions'>, highIndex = 1) {
  const answers: Record<string, any> = {}
  for (const [key, q] of Object.entries(compiled.questions)) {
    if (q.type === 'choice')
      answers[key] = {
        type: 'choice',
        choice: 'scoreable',
        confidence: 1,
        probabilities: {
          scoreable: 1,
          'insufficient-information': 0,
          'requires-agent-investigation': 0,
        },
      }
    else {
      const grade = key.startsWith(`c${highIndex}_`) ? 3 : 1
      answers[key] = {
        type: 'score',
        score: grade,
        confidence: 1,
        probabilities: Object.fromEntries(
          [0, 1, 2, 3].map((x) => [x.toString(), x === grade ? 1 : 0]),
        ),
        legend: Object.fromEntries(
          (q.criteria as readonly string[]).map((v, i) => [i.toString(), v]),
        ),
      }
    }
  }
  return {
    id: 'gen-test-1',
    model: DEFAULT_PROFILE.expectedModel,
    provider: 'TypeSafe',
    answers,
    usage: { input_tokens: 300, output_tokens: 20, cost: 0.001 },
  }
}
export function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
}
