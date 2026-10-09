const BASE = ''

export interface Option {
  readonly id: string
  readonly name: string
}

export interface ExportJobState {
  readonly jobId: string
  readonly attempt: number
  readonly version: number
  readonly phase: 'processing' | 'succeeded' | 'rejected' | 'failed'
  readonly notice: string | null
  readonly retry: {
    readonly permitted: boolean
    readonly remaining: number
    readonly afterMs: number
    readonly prerequisitesMet: boolean
  }
  readonly datasetId: string
  readonly format: string
}

export interface OptionsResponse {
  readonly datasets: readonly Option[]
  readonly formats: readonly Option[]
}

/** The published recovery prerequisite. `met` is the eligibility the workspace must honour. */
export interface RecoveryEligibility {
  readonly jobId: string
  readonly prerequisite: {
    readonly scope: string
    readonly note: string
    readonly met: boolean
  }
  /** The backend's own answer, published so the workspace's decision can be contradicted. */
  readonly backendPermitsRetry: boolean
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const body = (await res.json().catch(() => null)) as T | { message?: string } | null
  if (!res.ok) throw new Error((body as { message?: string })?.message ?? 'Request failed')
  return body as T
}

export function fetchOptions(): Promise<OptionsResponse> {
  return request('/api/exports/datasets')
}

export function createExport(datasetId: string, format: string): Promise<ExportJobState> {
  return request('/api/exports', {
    method: 'POST',
    body: JSON.stringify({ datasetId, format }),
  })
}

export function fetchExport(jobId: string): Promise<ExportJobState> {
  return request(`/api/exports/${jobId}`)
}

export function fetchEligibility(jobId: string): Promise<RecoveryEligibility> {
  return request(`/api/exports/${jobId}/eligibility`)
}

export function retryExport(jobId: string): Promise<ExportJobState> {
  return request(`/api/exports/${jobId}/retry`, { method: 'POST' })
}
