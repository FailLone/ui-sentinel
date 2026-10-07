import type { Locator } from 'playwright'

/** Public semantics supplement transport restrictions; neither button text nor GET grants writes. */
export async function uiActionRefusal(locator: Locator, type: string): Promise<string | null> {
  const target = await locator.evaluate((element) => ({
    tag: element.tagName.toLowerCase(),
    type: element.getAttribute('type')?.toLowerCase(),
    form: !!element.closest('form'),
    download: element.hasAttribute('download'),
    href: element.getAttribute('href') ?? '',
    label: `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.trim(),
    editable: element.getAttribute('contenteditable'),
  }))
  if (target.download || ['file', 'password', 'submit', 'image'].includes(target.type ?? ''))
    return 'unsupported-input-or-submit'
  if (
    type === 'click' &&
    target.form &&
    target.tag === 'button' &&
    target.type !== 'button' &&
    target.type !== 'reset'
  )
    return 'form-submit-not-permitted'
  if (target.type === 'reset') return 'form-reset-outside-sampling-scope'
  if (
    type === 'fill' &&
    (!['input', 'textarea', 'select'].includes(target.tag) || target.editable === 'true')
  )
    return 'unsupported-edit-target'
  const writing =
    /\b(log\s*out|sign\s*out|delete|purchase|buy|checkout|subscribe|unsubscribe|send|publish|pay|place order)\b|注销|退出登录|删除|购买|支付|提交订单|发布|发送|订阅/i
  if (
    writing.test(target.label) ||
    /\/(logout|signout|delete|checkout|unsubscribe)(?:[/?#]|$)/i.test(target.href)
  )
    return 'public-write-semantics'
  return null
}
