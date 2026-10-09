import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createExport,
  fetchEligibility,
  fetchExport,
  fetchOptions,
  retryExport,
  type ExportJobState,
  type Option,
  type RecoveryEligibility,
} from './api.ts'

/**
 * Dataset export workspace.
 *
 * The page is an ordinary business UI: choose a dataset and a format, submit, then watch the job
 * until it settles. Two things are deliberate:
 *
 * - Nothing is pre-selected. The task is to make a selection, so a pre-filled form would let the
 *   flow appear complete without the choice having been made.
 * - The layout variant (E4) is expressed here as wording and order only. No selector, test id or
 *   attribute in this file distinguishes a defect variant, so an agent cannot locate the answer in
 *   the markup - it has to observe behaviour.
 */
interface WorkspaceProps {
  /** Presentation variant: E4 changes wording and layout order, nothing else. */
  readonly variant: 'default' | 'rewritten'
}

export function Workspace({ variant }: WorkspaceProps) {
  const [datasets, setDatasets] = useState<readonly Option[]>([])
  const [formats, setFormats] = useState<readonly Option[]>([])
  const [datasetId, setDatasetId] = useState('')
  const [format, setFormat] = useState('')
  const [job, setJob] = useState<ExportJobState | null>(null)
  const [eligibility, setEligibility] = useState<RecoveryEligibility | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetchOptions()
      .then((options) => {
        setDatasets(options.datasets)
        setFormats(options.formats)
      })
      .catch(() => setError('Could not load the available datasets.'))
  }, [])

  // A created job is polled until it settles. The terminal state comes from the server, so the
  // page cannot invent a success: it only renders what the public status reports.
  useEffect(() => {
    if (!job || job.phase !== 'processing') {
      if (poll.current) clearInterval(poll.current)
      poll.current = null
      return
    }
    poll.current = setInterval(() => {
      void fetchExport(job.jobId)
        .then(setJob)
        .catch(() => setError('Could not read the export status.'))
    }, 400)
    return () => {
      if (poll.current) clearInterval(poll.current)
    }
  }, [job])

  const submit = useCallback(async () => {
    setError('')
    setEligibility(null)
    setSubmitting(true)
    try {
      setJob(await createExport(datasetId, format))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the export.')
    } finally {
      setSubmitting(false)
    }
  }, [datasetId, format])

  // Recovery eligibility is asked of the server, not inferred from the job payload: this is the
  // authoritative prerequisite, and honouring it is what makes the recovery control's state correct.
  useEffect(() => {
    if (!job || job.phase !== 'failed') {
      setEligibility(null)
      return
    }
    void fetchEligibility(job.jobId)
      .then(setEligibility)
      .catch(() => setEligibility(null))
  }, [job])

  const retry = useCallback(async () => {
    if (!job) return
    setError('')
    setRetrying(true)
    try {
      setJob(await retryExport(job.jobId))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not retry the export.')
    } finally {
      setRetrying(false)
    }
  }, [job])

  const ready = Boolean(datasetId && format) && !submitting
  const heading = variant === 'rewritten' ? 'Data Delivery' : 'Dataset Export'

  return (
    <section>
      <h2>{heading}</h2>
      <p className="muted">
        Choose a dataset and an output format, then start the export. Large exports continue in the
        background and report their status here.
      </p>

      <fieldset disabled={Boolean(job) && job!.phase === 'processing'}>
        <legend>Export request</legend>
        <div className="field">
          <span className="label" id="dataset-label">
            Dataset
          </span>
          <div className="choices" role="radiogroup" aria-labelledby="dataset-label">
            {datasets.map((d) => (
              <label key={d.id} className="choice">
                <input
                  type="radio"
                  name="dataset"
                  value={d.id}
                  checked={datasetId === d.id}
                  onChange={() => setDatasetId(d.id)}
                />
                <span>{d.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="label" id="format-label">
            {variant === 'rewritten' ? 'Output type' : 'Format'}
          </span>
          <div className="choices" role="radiogroup" aria-labelledby="format-label">
            {/* E4 presents the same two options in the other order, with different wording. */}
            {(variant === 'rewritten' ? [...formats].reverse() : formats).map((f) => (
              <label key={f.id} className="choice">
                <input
                  type="radio"
                  name="format"
                  value={f.id}
                  checked={format === f.id}
                  onChange={() => setFormat(f.id)}
                />
                <span>{variant === 'rewritten' ? `Export as ${f.name}` : f.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={!ready || Boolean(job)}
          >
            {variant === 'rewritten' ? 'Generate export' : 'Start export'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setJob(null)}>
            {variant === 'rewritten' ? 'Clear' : 'Reset'}
          </button>
        </div>
      </fieldset>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}

      {job && (
        <div className="result">
          <h3>
            {job.phase === 'processing'
              ? 'Export in progress'
              : job.phase === 'succeeded'
                ? variant === 'rewritten'
                  ? 'Export delivered'
                  : 'Export complete'
                : job.phase === 'rejected'
                  ? 'Export not permitted'
                  : variant === 'rewritten'
                    ? 'Export could not be delivered'
                    : 'Export failed'}
          </h3>
          <p className="muted">Job {job.jobId}</p>
          {job.notice && <p className="notice">{job.notice}</p>}
          <dl className="facts">
            <div>
              <dt>Dataset</dt>
              <dd>{datasets.find((d) => d.id === job.datasetId)?.name ?? job.datasetId}</dd>
            </div>
            <div>
              <dt>Format</dt>
              <dd>{job.format.toUpperCase()}</dd>
            </div>
            <div>
              <dt>Attempt</dt>
              <dd>{job.attempt}</dd>
            </div>
          </dl>
          {job.phase === 'succeeded' && (
            <a className="btn btn-primary" href={`/api/exports/${job.jobId}/download`}>
              {variant === 'rewritten' ? 'Get your file' : 'Download export'}
            </a>
          )}
          {job.phase === 'failed' &&
            // The control is rendered only once the server has stated the prerequisite, so the
            // element a user sees is never a placeholder whose state is about to change.
            (eligibility === null ? (
              <p className="muted">Checking whether this export can be retried…</p>
            ) : (
              <>
                {!eligibility.prerequisite.met && (
                  <p className="notice">{eligibility.prerequisite.note}</p>
                )}
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={retry}
                  // Inoperable means inoperable: a control whose prerequisite is unmet is not left
                  // clickable, and the business reason is stated next to it.
                  disabled={!eligibility.prerequisite.met || retrying}
                >
                  {retrying
                    ? 'Retrying…'
                    : variant === 'rewritten'
                      ? 'Regenerate export'
                      : 'Try again'}
                </button>
              </>
            ))}
        </div>
      )}
    </section>
  )
}
