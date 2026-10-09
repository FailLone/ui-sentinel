/** One bounded scheduling opportunity; tool errors never become evidence or progress facts. */
export function createToolContractRepair() {
  let used = false
  let errors: { tool: string; message: string }[] = []
  return {
    observe(results: readonly unknown[]) {
      errors = results.flatMap((value) => {
        const payload = (value as any)?.payload
        const result = payload?.result
        return typeof payload?.toolName === 'string' &&
          result?.error === true &&
          result.validationErrors &&
          typeof result.message === 'string'
          ? [{ tool: payload.toolName, message: result.message.slice(0, 1800) }]
          : []
      })
    },
    take() {
      if (used || !errors.length) return undefined
      used = true
      return {
        errors,
        allowance: 'one-model-turn',
        instruction:
          'Correct the tool input contract using these errors and the schema. Rejected input-validation calls did not dispatch actions or establish evidence. Other calls in that round may have executed; read their receipts and do not repeat them. This is the only contract repair opportunity; unchanged facts on the next turn finalize partial. Keep the original goal, expectations and unresolved items. Do not replay a prior dispatched action or business write.',
      }
    },
  }
}
