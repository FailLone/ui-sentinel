import { z } from 'zod'
import { parseRequestedProfile, resolveProfile, type RequestedProfile } from './registry.ts'

/**
 * Strict validation for the businessProfile field of POST /api/runs.
 *
 * The schema accepts only an id/revision pair. Unknown fields are rejected, so a caller cannot
 * smuggle source code, a module path, a private endpoint, an adapter override or requirements
 * text through the request. Anything that parses here is still resolved through the registry:
 * a syntactically valid pair naming an unregistered revision is not a configuration.
 */
export const businessConfigSchema = z
  .object({
    id: z.enum(['checkout', 'export']),
    revision: z.string().min(1).max(16),
  })
  .strict()

export type BusinessConfig = z.infer<typeof businessConfigSchema>

/** Accepts a raw field and returns the normalized config, or undefined when invalid. */
export function validateBusinessConfig(value: unknown): BusinessConfig | undefined {
  const parsed = businessConfigSchema.safeParse(value)
  if (!parsed.success) return undefined
  const profile = resolveProfile(parsed.data)
  if (!profile) return undefined
  return { id: profile.id, revision: profile.revision }
}

export function resolveRequested(value: unknown): RequestedProfile {
  return parseRequestedProfile(value)
}
