import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { RegressionReport } from './regression-report.tsx'
it('describes changed control names even when the HTML button value is empty', () => {
  const fact = (name: string) => ({ tag: 'button', name, text: name, value: '' })
  const report: any = {
    identity: {
      entryMatches: true,
      sourceMatches: true,
      previous: { source: { version: '1' } },
      current: { source: { version: '1' } },
    },
    steps: [
      {
        index: 0,
        title: 'Preview',
        state: 'unchecked',
        invalidated: true,
        change: {
          classification: 'dependency-change',
          dependencies: [
            {
              role: 'control',
              state: 'target-description-changed',
              factsChanged: true,
              before: [fact('Preview')],
              after: [fact('Other')],
            },
          ],
          outsideChanges: [],
          outsideChangeCount: 0,
        },
      },
    ],
  }
  expect(renderToStaticMarkup(RegressionReport({ report }))).toContain(
    '公开事实由 Preview 变为 Other',
  )
})
