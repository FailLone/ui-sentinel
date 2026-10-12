import { createOpenAI } from '@ai-sdk/openai'
import { Agent } from '@mastra/core/agent'
import type { MastraModelConfig } from '@mastra/core/llm'
import { it, expect, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { progressHarness } from '../../../evaluation/support/product-sources/progress.ts'
import { decisionMemory } from '../context/decision-memory.ts'
import { productPathSkill } from '../skills/product-path.ts'
vi.mock('../../shared/config.ts', () => ({
  config: { budget: { modelRequestTimeoutMs: 5000, modelRequestMaxRetries: 0 } },
}))
import { executeModelRequest } from './request.ts'
const original = JSON.parse(
  readFileSync('evaluation/private/product-sources/registration-recovery-failure.json', 'utf8'),
)
it.each(['short', 'long'])(
  'puts %s faulty-field source on actual compact SDK wire without JSON recovery calls',
  async (variant) => {
    const h = progressHarness(
      {
        ...original.source,
        markdown:
          original.source.markdown + (variant === 'long' ? '\n' + '附录正文。'.repeat(2000) : ''),
      },
      true,
    )
    const read = await h.call('product_source_read', { offset: 0 })
    const initial = structuredClone(
      original.events.find((e: any) => e.type === 'agent:response' && e.payload.requestSeq === 1)
        .payload.toolResults,
    )
    initial[1].payload.result = read
    h.history.push({ text: '', toolResults: JSON.stringify(initial) })
    const bad = structuredClone(
      original.events.find((e: any) => e.type === 'product:decision').payload.decision.plan,
    )
    bad.sourceId = h.source.sourceId
    bad.contentHash = h.source.contentHash
    for (const step of bad.steps)
      for (const requirement of [step, ...step.preconditions])
        requirement.citation = { citationId: read.citation.citationId }
    const corrected = structuredClone(bad)
    corrected.steps[1].preconditions.pop()
    corrected.rationale =
      '作者选择的修正版：原文“查看详情”标识待操作目标，其存在与唯一身份归入 targetName/bind 结构准入；业务前置仍为预览状态“预览就绪”，由独立原槽测量。此修改是作者的来源解释，不是程序自动删条件。'
    const wires: any[] = [],
      results: any[] = []
    const model = createOpenAI({
      apiKey: 'local-only',
      fetch: async (_url, init) => {
        const wire = JSON.parse(String(init?.body))
        wires.push(wire)
        expect(wire.tools.map((t: any) => t.function.name)).toEqual(['product_path_decide'])
        expect(wire.tool_choice).toEqual({
          type: 'function',
          function: { name: 'product_path_decide' },
        })
        const packet = JSON.parse(wire.messages.find((m: any) => m.role === 'user').content)
        if (wires.length === 2) {
          const repair = packet.productPath.registration.repairContext
          expect(repair.fields[0].field).toBe('steps[1].preconditions[1].expectation')
          expect(repair.fields[0].requirement.expectation).toBeNull()
          expect(repair.fields[0].excerpt.text).toBe(
            h.source.markdown.slice(0, repair.fields[0].excerpt.end),
          )
          expect(repair.fields[0].excerpt.text).toContain(original.source.markdown)
          expect(repair.fields[0].excerpt.omitted).toBe(variant === 'long')
          expect(Buffer.byteLength(JSON.stringify(repair))).toBeLessThanOrEqual(6000)
          if (variant === 'long')
            expect(repair.fields[0].sourceRead.args.offset).toBe(repair.fields[0].excerpt.end)
          expect(packet.productPath.source.markdown).toBeUndefined()
        }
        return Response.json({
          id: 'local',
          created: 1,
          model: wire.model,
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call-' + wires.length,
                    type: 'function',
                    function: {
                      name: 'product_path_decide',
                      arguments: JSON.stringify({
                        decision: { kind: 'draft', plan: wires.length === 1 ? bad : corrected },
                      }),
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        })
      },
    }).chat('fixed-local') as unknown as MastraModelConfig
    const agent = new Agent({
      id: 'repair-contract',
      name: 'Repair contract',
      instructions: productPathSkill,
      model,
      tools: h.tools,
    })
    for (let i = 0; i < 2; i++) {
      const status = await h.runtime.status()
      // Same compact product projection as executor: source identity, never hidden full report text.
      const packet = {
        productPath: {
          source: { sourceId: h.source.sourceId, contentHash: h.source.contentHash },
          registration: status.registration,
          stage: status.stage,
        },
        ...decisionMemory(h.history),
      }
      const result = await executeModelRequest(agent, JSON.stringify(packet), {
        activeTools: ['product_path_decide'],
        requiredTool: 'product_path_decide',
        requireTool: true,
        transport: 'generate',
        runSignal: new AbortController().signal,
        timeRemainingMs: 10000,
        attemptBudget: 1,
      })
      results.push(result)
      h.history.push({ text: result.text, toolResults: JSON.stringify(result.toolResults) })
    }
    expect(h.events.filter((e) => e.type === 'product:registration-rejected')).toHaveLength(1)
    expect((await h.runtime.status()).plan).toBeTruthy()
    expect(wires).toHaveLength(2)
    const dir = process.env.R2_RECOVERY_EVIDENCE_DIR
    if (dir)
      writeFileSync(
        resolve(dir, `sdk-repair-wire-${variant}.json`),
        JSON.stringify(
          {
            paidCalls: 0,
            authorChosenCorrection: true,
            limitation:
              'Fixed replies prove information delivery and validator path, not live repair success.',
            originalRequests: original.requests,
            wires,
            results,
            events: h.events,
          },
          null,
          2,
        ) + '\n',
      )
  },
)
