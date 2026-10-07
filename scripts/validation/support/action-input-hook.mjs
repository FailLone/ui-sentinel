// Test-only observation of browser operations; never rewrites production events or state.
import { chromium } from 'playwright'
let armed = false,
  counts = {},
  executionFailure = false
process.on('message', (m) => {
  if (m.command === 'arm-input-window') {
    armed = true
    counts = {}
    process.send?.({ event: 'input-window-armed' })
  } else if (m.command === 'arm-execution-failure') {
    executionFailure = true
    process.send?.({ event: 'execution-failure-armed' })
  } else if (m.command === 'close-input-window') {
    armed = false
    process.send?.({ event: 'input-window-closed', counts })
  }
})
const launch = chromium.launch
chromium.launch = async function (...args) {
  const browser = await launch.apply(this, args)
  const newContext = browser.newContext.bind(browser)
  browser.newContext = async (...args) => {
    const context = await newContext(...args),
      newPage = context.newPage.bind(context)
    context.newPage = async (...args) => {
      const page = await newPage(...args)
      for (const method of ['goto', 'evaluate', 'screenshot', 'locator', 'getByRole']) {
        const original = page[method].bind(page)
        page[method] = (...args) => {
          if (armed) counts[method] = (counts[method] ?? 0) + 1
          const result = original(...args)
          if (['locator', 'getByRole'].includes(method)) {
            const click = result.click.bind(result)
            result.click = async (...clickArgs) => {
              if (executionFailure && clickArgs[0]?.trial) {
                executionFailure = false
                await click(...clickArgs)
                await context.close()
                process.send?.({ event: 'execution-browser-closed-after-successful-trial' })
                return
              }
              return click(...clickArgs)
            }
          }
          return result
        }
      }
      const wheel = page.mouse.wheel.bind(page.mouse)
      page.mouse.wheel = (...args) => {
        if (armed) counts.wheel = (counts.wheel ?? 0) + 1
        return wheel(...args)
      }
      return page
    }
    return context
  }
  return browser
}
