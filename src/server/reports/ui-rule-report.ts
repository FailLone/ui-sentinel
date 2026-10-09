import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { RunEvent } from '../../shared/types.ts'
import type { UiRuleReportBody } from '../../execution/ui-rule-observation.ts'

export interface UiRuleReportEntry {
  eventId: string
  artifactRef: string
  available: boolean
  reason?: string
  body?: UiRuleReportBody
}
/** Historical projection only; exact persisted artifact digest, no live DOM or registry inference. */
export async function projectUiRuleReports(
  runId: string,
  events: readonly RunEvent[],
  artifacts: readonly { id: unknown; file_path: unknown }[],
): Promise<UiRuleReportEntry[]> {
  const paths = new Map(artifacts.map((a) => [String(a.id), String(a.file_path)]))
  return Promise.all(
    events
      .filter((e) => e.type === 'ui-rules:observed')
      .map(async (event) => {
        const artifactRef = String(event.payload.artifactRef ?? ''),
          base = { eventId: event.id, artifactRef, available: false }
        try {
          const path = paths.get(artifactRef)
          if (!path) throw Error('材料未保存')
          const bytes = await readFile(path)
          if (
            bytes.length > 2 * 1024 * 1024 ||
            createHash('sha256').update(bytes).digest('hex') !== event.payload.sha256
          )
            throw Error('材料摘要不匹配')
          const body = JSON.parse(bytes.toString()) as UiRuleReportBody
          if (
            body.version !== 'ui-rule-observation-1' ||
            body.runId !== runId ||
            !Array.isArray(body.controls?.rows) ||
            !Array.isArray(body.images?.rows)
          )
            throw Error('材料版本不受支持')
          const screenshotPath = paths.get(body.screenshotRef)
          if (
            !screenshotPath ||
            createHash('sha256')
              .update(await readFile(screenshotPath))
              .digest('hex') !== body.screenshotSha256
          )
            throw Error('同次截图缺失或摘要不匹配')
          for (const ref of body.evidenceRefs) {
            const p = paths.get(ref)
            if (!p) throw Error('关联证据缺失')
            const linked = await readFile(p)
            const expected = body.layout?.evidenceDigests?.[ref]
            if (expected && createHash('sha256').update(linked).digest('hex') !== expected)
              throw Error('布局关联证据摘要不匹配')
          }
          return { ...base, available: true, body }
        } catch (error) {
          return { ...base, reason: String(error) }
        }
      }),
  )
}
