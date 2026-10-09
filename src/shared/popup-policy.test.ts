import { it, expect } from 'vitest'
import { POPUP_POLICY, validPopupPolicy } from './popup-policy.ts'
import {
  resolveUiScanContract,
  verifyUiContractSnapshot,
  uiScanRequestSchema,
} from '../inspection/contract.ts'
import { buildUiScanRequest } from '../web/ui-scan-request.ts'
it('freezes a URL-only popup subtask without widening original permissions and keeps the default request unchanged', () => {
  const request = buildUiScanRequest({
    entryUrl: 'https://example.org',
    popupCheck: true,
    exploration: true,
  })
  expect(request.exploration).toBeUndefined()
  const result = resolveUiScanContract(request, { reachableOrigins: [] })
  expect(result.kind).toBe('resolved')
  if (result.kind !== 'resolved') throw Error(JSON.stringify(result))
  expect(result.contract.popupCheck).toEqual(POPUP_POLICY)
  expect(verifyUiContractSnapshot(result.contract)).toBe(true)
  expect(validPopupPolicy({ ...POPUP_POLICY, maxActions: 100 })).toBe(false)
  expect(
    uiScanRequestSchema.safeParse({
      ...request,
      popupCheck: { mode: 'popup-viewport', maxActions: 100 },
    }).success,
  ).toBe(false)
  expect(buildUiScanRequest({ entryUrl: 'https://example.org' }).popupCheck).toBeUndefined()
})
