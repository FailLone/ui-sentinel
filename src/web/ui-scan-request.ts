/**
 * Building the workbench's `ui-scan` request (plan 3.2 step 2).
 *
 * The client is a convenience, never the authority: the server re-resolves and can refuse anything
 * sent here. What this module owes is a body the API will accept - the right discriminant, no fields
 * the mode does not have, and empty option groups omitted rather than sent as zeroes that would read
 * as "the user asked for the smallest possible run".
 */

export interface UiScanFormInput {
  readonly entryUrl: string
  readonly goal?: string
  readonly maxPages?: number
  readonly maxDepth?: number
  readonly resourceOrigins?: string
  readonly dataOrigins?: string
  readonly maxActions?: number
  readonly maxModelCalls?: number
  readonly totalTimeoutMs?: number
}

/** Origins as the advanced field holds them: whitespace, commas or newlines between exact origins. */
function splitOrigins(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
}

/** A blank or absent numeric field means "not narrowed", never zero. */
function positive(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function zeroAllowed(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined
}

export function buildUiScanRequest(input: UiScanFormInput): Record<string, unknown> {
  const goal = input.goal?.trim()
  const resourceOrigins = splitOrigins(input.resourceOrigins)
  const dataOrigins = splitOrigins(input.dataOrigins)
  const scope = {
    ...(positive(input.maxPages) === undefined ? {} : { maxPages: positive(input.maxPages)! }),
    ...(zeroAllowed(input.maxDepth) === undefined
      ? {}
      : { maxDepth: zeroAllowed(input.maxDepth)! }),
  }
  const access = {
    ...(resourceOrigins.length ? { resourceOrigins } : {}),
    ...(dataOrigins.length ? { dataOrigins } : {}),
  }
  const budget = {
    ...(positive(input.maxActions) === undefined
      ? {}
      : { maxActions: positive(input.maxActions)! }),
    ...(positive(input.maxModelCalls) === undefined
      ? {}
      : { maxModelCalls: positive(input.maxModelCalls)! }),
    ...(positive(input.totalTimeoutMs) === undefined
      ? {}
      : { totalTimeoutMs: positive(input.totalTimeoutMs)! }),
  }
  return {
    kind: 'ui-scan',
    entryUrl: input.entryUrl.trim(),
    ...(goal ? { goal } : {}),
    ...(Object.keys(scope).length ? { scope } : {}),
    ...(Object.keys(access).length ? { access } : {}),
    ...(Object.keys(budget).length ? { budget } : {}),
  }
}

/**
 * A pre-send hint, or `null` when nothing obvious is wrong.
 *
 * Deliberately narrow: it only catches what a person would call a mistake at a glance - a relative
 * address or a scheme that cannot be a web page. It does **not** judge the host, because whether a
 * private-looking address is an allowed fixture origin is server configuration, and guessing would
 * either block a valid fixture or imply an approval the client has no authority to give.
 */
export function uiScanClientHint(entryUrl: string): string | null {
  const trimmed = entryUrl.trim()
  if (!trimmed) return '请输入完整网址，例如 https://example.org/page。'
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed))
    return '请输入包含协议的完整网址（http 或 https），例如 https://example.org/page。'
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return '这个网址无法解析，请检查拼写。'
  }
  if (!/^https?:$/.test(url.protocol)) return '只支持 http 和 https 网址。'
  return null
}
