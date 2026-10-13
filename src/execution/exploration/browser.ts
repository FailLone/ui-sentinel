import type { Page } from 'playwright'
import {
  actionKey,
  stateKey,
  type Control,
  type Observation,
} from '../../inspection/exploration-graph.ts'

export interface ObservationPolicy {
  /** Finite input equivalence classes supplied by the caller, never guessed from fixture internals. */
  inputValues?: Record<string, string[]>
  quietMs?: number
  timeoutMs?: number
}

async function collect(
  page: Page,
  context: string | null,
  policy: ObservationPolicy,
): Promise<Observation> {
  const data = await page.evaluate(
    ({ inputValues }) => {
      const visible = (element: Element) => {
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          !element.closest('[hidden],[inert],[aria-hidden="true"]')
        )
      }
      const dialogs = [
        ...document.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]'),
      ].filter(visible)
      const root = dialogs.at(-1) ?? document.body
      const gaps: string[] = []
      const selector = (element: Element): string => {
        const parts: string[] = []
        let node: Element | null = element
        while (node && node !== document.documentElement) {
          const siblings: Element[] = node.parentElement
            ? [...node.parentElement.children].filter((other) => other.tagName === node!.tagName)
            : []
          parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`)
          node = node.parentElement
        }
        return 'html > ' + parts.join(' > ')
      }
      const label = (element: Element) => {
        const labelled = element
          .getAttribute('aria-labelledby')
          ?.split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? '')
          .join(' ')
          .trim()
        const labelNode = (element as HTMLInputElement).labels?.[0]?.cloneNode(true) as
          | Element
          | undefined
        labelNode?.querySelectorAll('input,select,textarea').forEach((node) => node.remove())
        return (
          labelled ||
          element.getAttribute('aria-label') ||
          labelNode?.textContent?.trim() ||
          element.textContent?.trim() ||
          element.getAttribute('title') ||
          ''
        )
      }
      const controls: Control[] = []
      for (const element of [root, ...root.querySelectorAll('*')]) {
        if (!visible(element)) continue
        if (
          element.matches(
            'iframe,canvas,[contenteditable="true"],[aria-rowcount],[aria-setsize]',
          ) ||
          element.shadowRoot
        )
          gaps.push(`unsupported-surface:${element.tagName.toLowerCase()}`)
        const explicitRole = element.getAttribute('role')
        if (
          explicitRole &&
          ['slider', 'tree', 'grid', 'combobox', 'menuitem', 'switch'].includes(explicitRole)
        )
          gaps.push(`unsupported-role:${explicitRole}`)
        if (
          !element.matches(
            'button,a[href],input:not([type="hidden"]),textarea,select,summary,[role="button"],[role="tab"],[role="checkbox"]',
          )
        ) {
          if (element.hasAttribute('onclick') || element.hasAttribute('tabindex'))
            gaps.push('unsupported-interactive-element')
          continue
        }
        const name = label(element)
        if (!name) {
          gaps.push('unnamed-control')
          continue
        }
        const regions: string[] = []
        let parent = element.parentElement
        while (parent && root.contains(parent)) {
          if (parent.matches('section,form,fieldset,nav,[role="region"],[role="group"],dialog')) {
            const regionName =
              parent.getAttribute('aria-label') ||
              parent
                .querySelector(':scope > legend,:scope > h1,:scope > h2,:scope > h3')
                ?.textContent?.trim()
            if (regionName) regions.unshift(regionName)
          }
          if (parent === root) break
          parent = parent.parentElement
        }
        const role =
          explicitRole ||
          (element.tagName === 'A'
            ? 'link'
            : element.tagName === 'SELECT'
              ? 'combobox'
              : element.tagName === 'INPUT' || element.tagName === 'TEXTAREA'
                ? (element as HTMLInputElement).type === 'checkbox'
                  ? 'checkbox'
                  : 'textbox'
                : 'button')
        const description =
          element.getAttribute('aria-description') ||
          element
            .getAttribute('aria-describedby')
            ?.split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ') ||
          ''
        const common = {
          name,
          description,
          role,
          region: regions.join(' / ') || 'Page',
          selector: selector(element),
          enabled:
            !element.matches(':disabled') && element.getAttribute('aria-disabled') !== 'true',
        }
        const add = (operation: Control['operation'], value?: string, currentValue?: string) =>
          controls.push({
            ...common,
            ref: `a${controls.length}`,
            operation,
            ...(value !== undefined ? { value } : {}),
            ...(currentValue !== undefined ? { currentValue } : {}),
          })
        if (element instanceof HTMLSelectElement) {
          for (const option of element.options)
            if (!option.disabled && option.value !== element.value)
              add('select', option.value, element.value)
        } else if (element instanceof HTMLInputElement && element.type === 'checkbox') {
          add('check', String(!element.checked), String(element.checked))
        } else if (
          element instanceof HTMLTextAreaElement ||
          (element instanceof HTMLInputElement &&
            !['button', 'submit', 'reset'].includes(element.type))
        ) {
          if (
            element instanceof HTMLInputElement &&
            !['text', 'search', 'email', 'number', 'tel', 'url'].includes(element.type)
          ) {
            gaps.push(`unsupported-input:${element.type}`)
            continue
          }
          const values = inputValues[`${common.region}|${name}`] ?? inputValues[name]
          if (!values?.length) {
            gaps.push(`unbounded-input:${name}`)
            continue
          }
          for (const value of [...new Set(values)])
            if (value !== element.value) add('fill', value, element.value)
        } else
          add(
            'click',
            undefined,
            element.getAttribute('aria-selected') ??
              element.getAttribute('aria-checked') ??
              undefined,
          )
      }
      return {
        heading: root.querySelector('h1,h2,[role="heading"]')?.textContent?.trim() ?? '',
        text: (root as HTMLElement).innerText.replace(/\s+/g, ' ').trim(),
        controls,
        gaps: [...new Set(gaps)],
        busy:
          !!root.querySelector('[aria-busy="true"]') || root.getAttribute('aria-busy') === 'true',
      }
    },
    { inputValues: policy.inputValues ?? {} },
  )
  const { busy, gaps, ...rest } = data
  if (busy) gaps.push('busy')
  return { url: page.url(), ...rest, gaps, complete: gaps.length === 0, context }
}

/** DOM quietness is bounded evidence, not proof that arbitrary future timers cannot fire. */
export async function observe(
  page: Page,
  context: string | null,
  policy: ObservationPolicy = {},
): Promise<Observation> {
  const deadline = Date.now() + (policy.timeoutMs ?? 2500)
  let previous = await collect(page, context, policy)
  let quietSince = Date.now()
  while (Date.now() < deadline) {
    await page.waitForTimeout(50)
    const current = await collect(page, context, policy)
    if (stateKey(previous) !== stateKey(current)) quietSince = Date.now()
    if (!current.gaps?.includes('busy') && Date.now() - quietSince >= (policy.quietMs ?? 120))
      return current
    previous = current
  }
  return { ...previous, complete: false, gaps: [...(previous.gaps ?? []), 'settle-timeout'] }
}

export function controlsPage(observation: Observation, offset: number, size = 24) {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(size) || size < 1)
    throw Error('invalid-page')
  const controls = observation.controls.slice(offset, offset + size)
  return {
    controls,
    total: observation.controls.length,
    nextOffset:
      offset + controls.length < observation.controls.length ? offset + controls.length : null,
  }
}

export async function click(
  page: Page,
  before: Observation,
  key: string,
  policy: ObservationPolicy = {},
) {
  const fresh = await observe(page, before.context, policy)
  if (stateKey(fresh) !== stateKey(before)) throw Error('stale-state')
  const matches = before.controls.filter((control) => actionKey(control) === key)
  if (matches.length !== 1) throw Error('ambiguous-target')
  const control = matches[0]
  if (!control?.enabled || !control.selector) throw Error('unavailable-action')
  if (
    fresh.controls.find((candidate) => actionKey(candidate) === key)?.selector !== control.selector
  )
    throw Error('stale-binding')
  const locator = page.locator(control.selector)
  if ((await locator.count()) !== 1) throw Error('ambiguous-target')
  switch (control.operation) {
    case 'fill':
      await locator.fill(control.value!, { timeout: 2000 })
      break
    case 'select':
      await locator.selectOption(control.value!, { timeout: 2000 })
      break
    case 'check':
      await locator.setChecked(control.value === 'true', { timeout: 2000 })
      break
    default:
      await locator.click({ timeout: 2000 })
  }
}
