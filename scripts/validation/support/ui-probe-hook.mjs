// Test-only browser barriers. No production branch, SQL or event is rewritten.
import { chromium } from 'playwright'
let mode = '',
  armed = false,
  release
process.on('message', (m) => {
  if (m.command === 'arm') {
    mode = m.mode
    armed = true
    process.send?.({ event: 'armed' })
  }
  if (m.command === 'release') release?.()
})
const launch = chromium.launch
chromium.launch = async function (...args) {
  const browser = await launch.apply(this, args)
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async (...args) => {
    const context = await newContext(...args),
      newPage = context.newPage.bind(context)
    context.newPage = async (...args) => {
      const page = await newPage(...args),
        locator = page.locator.bind(page)
      page.locator = (...args) => {
        const l = locator(...args),
          elementHandle = l.elementHandle.bind(l)
        l.elementHandle = async (...args) => {
          const h = await elementHandle(...args)
          if (h) {
            const click = h.click.bind(h)
            h.click = async (...args) => {
              if (armed && args[0]?.trial) {
                armed = false
                if (mode === 'cancel') {
                  await new Promise((r) => {
                    release = r
                    process.send?.({ event: 'probe-paused' })
                  })
                } else if (mode === 'closed') await context.close()
                else if (mode === 'replaced')
                  await h.evaluate((n) => {
                    n.outerHTML = n.outerHTML
                  })
              }
              return click(...args)
            }
          }
          return h
        }
        return l
      }
      return page
    }
    return context
  }
  return browser
}
