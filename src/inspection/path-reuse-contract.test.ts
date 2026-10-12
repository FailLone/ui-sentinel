import { expect, it } from 'vitest'
import { resolveUiScanContract, verifyUiContractSnapshot } from './contract.ts'
import { buildUiScanRequest } from '../web/ui-scan-request.ts'
const id = 'path-' + 'a'.repeat(64)
const source = { title: 'Spec', version: '2', markdown: 'Click Preview immediately shows Ready.' }
it('freezes explicit reuse selection into the new run contract without changing permissions', () => {
  const result = resolveUiScanContract(
    { kind: 'ui-scan', entryUrl: 'https://example.org/', productSource: source, pathProgramId: id },
    { reachableOrigins: [] },
  )
  expect(result.kind).toBe('resolved')
  if (result.kind !== 'resolved') return
  expect(result.contract.pathProgramId).toBe(id)
  expect(result.contract.businessWrites).toBe('none')
  expect(result.contract.session).toBe('anonymous')
  expect(verifyUiContractSnapshot(result.contract)).toBe(true)
  expect(
    verifyUiContractSnapshot({ ...result.contract, pathProgramId: 'path-' + 'b'.repeat(64) }),
  ).toBe(false)
})
it('requires current source and does not accept executable candidate bodies', () => {
  for (const extra of [
    { pathProgramId: id },
    { productSource: source, pathProgramId: '../file' },
    { productSource: source, pathProgram: { code: 'alert(1)' } },
  ]) {
    expect(
      resolveUiScanContract(
        { kind: 'ui-scan', entryUrl: 'https://example.org/', ...extra },
        { reachableOrigins: [] },
      ).kind,
    ).toBe('refused')
  }
})
it('workbench carries current source version and explicit program ID', () => {
  expect(
    buildUiScanRequest({
      entryUrl: 'https://example.org/',
      productSourceTitle: source.title,
      productSourceVersion: source.version,
      productSourceMarkdown: source.markdown,
      pathProgramId: ' ' + id + ' ',
    }),
  ).toMatchObject({ productSource: source, pathProgramId: id })
})
