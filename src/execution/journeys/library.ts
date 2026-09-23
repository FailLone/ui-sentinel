import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { getDbClient } from '../../storage/database.ts'
import type { RunEvent } from '../../shared/types.ts'
import type { PageSnapshot } from '../../rules/types.ts'

export interface JourneyStep {
  action: { type: 'click'; role: 'button' | 'link'; name: string }
  before: { pathname: string; headings: string[] }
  after: { pathname: string; headings: string[] }
  source: { actionId: string; beforeRefs: string[]; afterRefs: string[] }
}
export interface Journey {
  id: string
  revision: '1'
  sourceRunId: string
  environmentId: string
  writePolicy: 'read-only'
  steps: JourneyStep[]
}
const normalized = (s: string) => s.replace(/\s+/g, ' ').trim()
export function stateCondition(snapshot: PageSnapshot) {
  return {
    pathname: new URL(snapshot.url).pathname,
    headings: [
      ...new Set(
        snapshot.elements
          .filter((e) => e.visible && ['h1', 'h2'].includes(e.tag))
          .map((e) => normalized(e.text)),
      ),
    ].slice(0, 8),
  }
}
export function conditionMatches(condition: JourneyStep['before'], snapshot: PageSnapshot) {
  const actual = stateCondition(snapshot)
  return (
    condition.headings.length > 0 &&
    actual.pathname === condition.pathname &&
    condition.headings.every((h) => actual.headings.includes(h))
  )
}

/** Only evidenced, uniquely identified, write-free consecutive actions become reusable. */
export function deriveJourneys(
  runId: string,
  environmentId: string,
  events: readonly RunEvent[],
  snapshots: ReadonlyMap<string, PageSnapshot>,
): Journey[] {
  const journeys: Journey[] = []
  let segment: JourneyStep[] = []
  const flush = () => {
    if (segment.length >= 2) {
      const steps = segment.slice(0, 3)
      const id =
        'journey-' +
        createHash('sha256')
          .update(
            JSON.stringify([
              environmentId,
              steps.map(({ action, before, after }) => ({ action, before, after })),
            ]),
          )
          .digest('hex')
          .slice(0, 20)
      journeys.push({
        id,
        revision: '1',
        sourceRunId: runId,
        environmentId,
        writePolicy: 'read-only',
        steps,
      })
    }
    segment = []
  }
  for (let i = 0; i < events.length; i++) {
    const start = events[i]!
    if (start.type !== 'action:executing') continue
    const nextIndex = events.findIndex((e, j) => j > i && e.type === 'action:executing')
    const interval = events.slice(i + 1, nextIndex < 0 ? events.length : nextIndex)
    const completed = interval.find(
      (e) => e.type === 'action:completed' && e.actionId === start.actionId,
    )
    const observation = interval.find(
      (e) => e.type === 'page:observed' && completed && e.seq > completed.seq,
    )
    const before = start.evidenceRefs.map((id) => snapshots.get(id)).find(Boolean)
    const after = observation?.evidenceRefs.map((id) => snapshots.get(id)).find(Boolean)
    const match = /^(button|link)\[([^\[\]]+)\](?:\[0\])?$/.exec(String(start.payload.target ?? ''))
    const sourceDefect =
      after?.elements.some(
        (e) =>
          e.visible && e.enabled !== false && e.hitSamples?.some((s) => s.relation === 'unrelated'),
      ) || interval.some((e) => e.type === 'rule:evaluated' && e.payload.verdict === 'fail')
    if (
      !completed ||
      completed.payload.networkWrites !== 0 ||
      start.payload.type !== 'click' ||
      !match ||
      !before ||
      !after ||
      !start.actionId ||
      sourceDefect
    ) {
      flush()
      continue
    }
    const role = match[1] as 'button' | 'link',
      name = normalized(match[2]!)
    const targets = before.elements.filter(
      (e) =>
        e.visible &&
        e.enabled !== false &&
        (e.attributes.role ?? (e.tag === 'a' ? 'link' : e.tag)) === role &&
        normalized(e.attributes['aria-label'] ?? e.text) === name,
    )
    const pre = stateCondition(before),
      post = stateCondition(after)
    if (
      targets.length !== 1 ||
      !pre.headings.length ||
      !post.headings.length ||
      /order[- ]\d/i.test(JSON.stringify([pre, post, name])) ||
      JSON.stringify(pre) === JSON.stringify(post)
    ) {
      flush()
      continue
    }
    segment.push({
      action: { type: 'click', role, name },
      before: pre,
      after: post,
      source: {
        actionId: start.actionId,
        beforeRefs: [...start.evidenceRefs],
        afterRefs: [...observation!.evidenceRefs],
      },
    })
    if (segment.length === 3) flush()
  }
  flush()
  return journeys
}

export async function loadJourneys(
  environmentId: string,
  currentRunId: string,
): Promise<Journey[]> {
  const db = getDbClient()
  const candidates = await db.execute({
    sql: "SELECT id FROM runs WHERE id != ? AND status IN ('completed','blocked') AND stop_reason IN ('goal-reached','blocked') ORDER BY rowid DESC LIMIT 20",
    args: [currentRunId],
  })
  const unique = new Map<string, Journey>()
  for (const row of candidates.rows) {
    const sourceId = String(row.id)
    const stored = (await db.execute({ sql: 'SELECT spec FROM runs WHERE id=?', args: [sourceId] }))
      .rows[0]
    if (JSON.parse(String(stored!.spec)).environmentId !== environmentId) continue
    const { getEvents } = await import('../run-manager.ts')
    const events = await getEvents(sourceId)
    if (!events.some((e) => e.type === 'finish:accepted')) continue
    if (!events.some((e) => e.type === 'action:completed' && e.payload.networkWrites === 0))
      continue
    const files = await db.execute({
      sql: "SELECT id,file_path FROM artifacts WHERE run_id=? AND type='snapshot'",
      args: [sourceId],
    })
    const snapshots = new Map<string, PageSnapshot>()
    for (const file of files.rows) {
      try {
        snapshots.set(String(file.id), JSON.parse(await readFile(String(file.file_path), 'utf8')))
      } catch {
        /* Missing evidence cannot produce a reusable step. */
      }
    }
    for (const journey of deriveJourneys(sourceId, environmentId, events, snapshots))
      if (!unique.has(journey.id)) unique.set(journey.id, journey)
  }
  // Persist the exact derived contract and provenance; do not synthesize missing historical write evidence.
  for (const journey of unique.values())
    await db.execute({
      sql: 'INSERT OR IGNORE INTO journeys (id,revision,source_run_id,contract) VALUES (?,?,?,?)',
      args: [journey.id, journey.revision, journey.sourceRunId, JSON.stringify(journey)],
    })
  return [...unique.values()]
}
