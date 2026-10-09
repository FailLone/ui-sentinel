import { describe, it, expect, vi, beforeEach } from 'vitest'
const mocks = vi.hoisted(() => ({
  launch: vi.fn(),
  contextClose: vi.fn(),
  browserClose: vi.fn(),
  newContext: vi.fn(),
  init: vi.fn(),
  page: vi.fn(),
}))
vi.mock('playwright', () => ({ chromium: { launch: mocks.launch } }))
import { launchBrowser } from '../browser.ts'
beforeEach(() => {
  vi.resetAllMocks()
  mocks.contextClose.mockResolvedValue(undefined)
  mocks.browserClose.mockResolvedValue(undefined)
  mocks.init.mockResolvedValue(undefined)
  mocks.page.mockResolvedValue({})
  mocks.newContext.mockResolvedValue({
    close: mocks.contextClose,
    addInitScript: mocks.init,
    newPage: mocks.page,
  })
  mocks.launch.mockResolvedValue({ newContext: mocks.newContext, close: mocks.browserClose })
})
describe('original browser resource ownership under preparation failure', () => {
  it('closes the browser if context creation fails', async () => {
    mocks.newContext.mockRejectedValue(Error('prepare-failed'))
    await expect(launchBrowser({ uiScan: true })).rejects.toThrow('prepare-failed')
    expect(mocks.browserClose).toHaveBeenCalledTimes(1)
  })
  it('closes context and browser if initialization fails', async () => {
    mocks.init.mockRejectedValue(Error('init-failed'))
    await expect(launchBrowser({ uiScan: true })).rejects.toThrow('init-failed')
    expect(mocks.contextClose).toHaveBeenCalledTimes(1)
    expect(mocks.browserClose).toHaveBeenCalledTimes(1)
  })
  it('always closes the owned process, even if context close fails, and closes only once', async () => {
    const worker = await launchBrowser({ uiScan: true })
    mocks.contextClose.mockRejectedValue(Error('close-failed'))
    await expect(worker.close()).rejects.toThrow('close-failed')
    await expect(worker.close()).rejects.toThrow('close-failed')
    expect(mocks.browserClose).toHaveBeenCalledTimes(1)
  })
})
