import { z } from 'zod'
import { interactionVerificationInput } from './interaction-verification.ts'

// OpenAI-compatible tools send null for unused optional fields. Null means absent, never a default
// destination, target, value or scroll amount. Keep this flat schema for the existing SDK converter.
const absent = <T extends z.ZodType>(schema: T) =>
  schema
    .nullish()
    .transform((value) => value ?? undefined)
    .optional()

export const actionInput = z
  .object({
    type: z.enum(['click', 'probe', 'fill', 'navigate', 'scroll']),
    verify: absent(interactionVerificationInput).describe(
      'Only click/fill: bounded post-action measurement grounded in public evidence. Not an action receipt.',
    ),
    ref: absent(z.string().max(40)).describe(
      'Observed element ref. May accompany one locator method to cross-check the same target; UI supports ref alone.',
    ),
    role: absent(z.string()),
    name: absent(z.string()),
    nth: absent(z.number().int().min(0)).describe('0-based index; requires role and name'),
    selector: absent(z.string()),
    visualDescription: absent(z.string()),
    value: absent(z.string()).describe(
      'Required for fill; empty string explicitly clears the field',
    ),
    url: absent(z.string()).describe(
      'Required for navigate: explicit absolute HTTP(S) destination',
    ),
    scrollY: absent(z.number().min(-1000).max(1000)).describe(
      'Required for scroll; no implicit default',
    ),
  })
  .strict()
  .superRefine((input, ctx) => {
    const issue = (field: keyof typeof input, message: string) =>
      ctx.addIssue({ code: 'custom', path: [field], message })
    const targetFields = ['ref', 'role', 'name', 'selector', 'visualDescription', 'nth'] as const
    const forbid = (fields: readonly (keyof typeof input)[]) => {
      for (const field of fields)
        if (input[field] !== undefined) issue(field, `${field} is not allowed for ${input.type}`)
    }
    if (input.type === 'navigate') {
      if (!input.url?.trim()) issue('url', 'navigate requires an explicit absolute HTTP(S) url')
      else {
        try {
          const url = new URL(input.url)
          if (!['http:', 'https:'].includes(url.protocol)) throw Error('unsupported protocol')
        } catch {
          issue('url', 'navigate requires an explicit absolute HTTP(S) url; no URL is inferred')
        }
      }
      forbid([...targetFields, 'value', 'scrollY', 'verify'])
      return
    }
    if (input.type === 'scroll') {
      if (input.scrollY === undefined) issue('scrollY', 'scroll requires an explicit scrollY')
      forbid([...targetFields, 'value', 'url', 'verify'])
      return
    }
    for (const field of ['ref', 'role', 'name', 'selector', 'visualDescription'] as const)
      if (input[field] !== undefined && !input[field]?.trim())
        issue(field, `${field} must not be blank`)
    if ((input.role === undefined) !== (input.name === undefined))
      issue(input.role === undefined ? 'role' : 'name', 'role and name must be supplied together')
    if (input.nth !== undefined && (input.role === undefined || input.name === undefined))
      issue('nth', 'nth requires role and name')
    const methods = [
      input.role !== undefined || input.name !== undefined,
      input.selector !== undefined,
      input.visualDescription !== undefined,
    ]
    if (methods.filter(Boolean).length > 1)
      issue(
        'selector',
        'Choose one locator method: role+name, selector, or visualDescription; ref may cross-check it',
      )
    if (!input.ref && !methods.some(Boolean))
      issue(
        'ref',
        `${input.type} requires a target: observed ref, role+name, selector, or visualDescription`,
      )
    if (input.type === 'fill' && input.value === undefined)
      issue('value', 'fill requires value; use an explicit empty string to clear')
    forbid([
      'url',
      'scrollY',
      ...(input.type === 'fill' ? [] : (['value'] as const)),
      ...(input.type === 'probe' ? (['verify'] as const) : []),
    ])
  })

/** Same validation-error shape consumed by the existing one-turn contract repair. Also guards
 * internal action callers, which do not pass through the SDK's input validator. */
export function actionInputValidationError(input: unknown, options: { allowRefOnly: boolean }) {
  const parsed = actionInput.safeParse(input)
  const errors = parsed.success
    ? !options.allowRefOnly &&
      ['click', 'probe', 'fill'].includes(parsed.data.type) &&
      !parsed.data.role &&
      !parsed.data.selector &&
      !parsed.data.visualDescription
      ? [
          'target: this execution mode requires role+name, selector, or visualDescription; ref alone is not a locator',
        ]
      : []
    : parsed.error.issues.map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
  if (!errors.length) return undefined
  return {
    error: true as const,
    message: `page_act input validation failed before browser operations:\n${errors.join('\n')}`,
    validationErrors: { errors },
    dispatched: false as const,
  }
}
