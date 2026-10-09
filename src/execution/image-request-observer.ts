import type { Page, Request } from 'playwright'
import type { ImageRequestReceipt } from '../experiments/image-fallback-review.ts'

/** Passive bounded receipt collection, installed before navigation; no fetch/retry. */
export function observeImageRequests(page: Page) {
  const requests: ImageRequestReceipt[] = [],
    requestMap = new WeakMap<Request, ImageRequestReceipt>()
  let truncated = false
  const onRequest = (request: Request) => {
    if (request.resourceType() !== 'image') return
    if (requests.length >= 256) {
      truncated = true
      return
    }
    const record = {
      id: requests.length + 1,
      url: request.url(),
      startedAt: new Date().toISOString(),
    }
    requests.push(record)
    requestMap.set(request, record)
  }
  const onResponse = (response: import('playwright').Response) => {
    const r = requestMap.get(response.request())
    if (r) r.status = response.status()
  }
  const onFailed = (request: Request) => {
    const r = requestMap.get(request)
    if (r) r.failed = request.failure()?.errorText ?? 'request-failed'
  }
  const onFinished = (request: Request) => {
    const r = requestMap.get(request)
    if (r) r.finished = true
  }
  page.on('request', onRequest)
  page.on('response', onResponse)
  page.on('requestfailed', onFailed)
  page.on('requestfinished', onFinished)
  return {
    snapshot: () => ({ requests: structuredClone(requests), truncated }),
    close: () => {
      page.off('request', onRequest)
      page.off('response', onResponse)
      page.off('requestfailed', onFailed)
      page.off('requestfinished', onFinished)
    },
  }
}
