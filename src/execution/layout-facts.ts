import type { Page } from 'playwright'

/** Bounded public DOM facts. No private fixture labels, business names or page mutation. */
export async function readLayoutFacts(page: Page) {
  return page.evaluate(() => {
    const host = window as typeof window & {
      __sentinelLayout?: {
        ids: WeakMap<Element, number>
        next: number
        documentId: string
        epoch: number
      }
    }
    if (!host.__sentinelLayout) {
      host.__sentinelLayout = {
        ids: new WeakMap(),
        next: 1,
        documentId: Math.random().toString(36),
        epoch: 0,
      }
      new MutationObserver(() => host.__sentinelLayout!.epoch++).observe(document, {
        subtree: true,
        attributes: true,
        childList: true,
        characterData: true,
      })
    }
    const store = host.__sentinelLayout
    const id = (e: Element) => {
      if (!store.ids.has(e)) store.ids.set(e, store.next++)
      return store.ids.get(e)!
    }
    const rect = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })
    const intersects = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
      a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
    function selector(e: Element) {
      const parts: string[] = []
      for (
        let n: Element | null = e;
        n && n !== document.documentElement && parts.length < 32;
        n = n.parentElement
      ) {
        const siblings: HTMLCollection | undefined = n.parentElement?.children
        let position = 1
        if (siblings)
          for (let i = 0; i < siblings.length && siblings[i] !== n; i++)
            if (siblings[i]!.tagName === n.tagName) position++
        parts.unshift(`${n.tagName.toLowerCase()}:nth-of-type(${position})`)
      }
      return 'html > ' + parts.join(' > ')
    }
    const started = performance.now(),
      nodes: Element[] = [],
      issues: string[] = []
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT)
    let next: Node | null = walker.currentNode
    while (next && nodes.length < 512 && performance.now() - started < 40) {
      nodes.push(next as Element)
      next = walker.nextNode()
    }
    if (next) issues.push('document-budget')
    if (
      document.readyState !== 'complete' ||
      document.fonts.status !== 'loaded' ||
      document.fonts.size
    )
      issues.push('loading-or-custom-font')
    if (innerWidth * innerHeight > 2_000_000) issues.push('viewport-budget')
    if (devicePixelRatio !== 1 || visualViewport?.scale !== 1)
      issues.push('unsupported-pixel-scale')
    const native = nodes.filter(
      (e) =>
        e instanceof HTMLButtonElement ||
        (e instanceof HTMLAnchorElement && e.hasAttribute('href')),
    )
    const recoveryIssues: string[] = []
    const resourceEntries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    if (resourceEntries.length > 512) recoveryIssues.push('resource-history-budget')
    const resourceEpoch = resourceEntries
      .slice(0, 512)
      .map((r) => ({
        name: r.name.slice(0, 4096),
        start: r.startTime,
        end: r.responseEnd,
        type: r.initiatorType,
      }))
    if (
      nodes.some(
        (e) =>
          e.tagName === 'SCRIPT' || Array.from(e.attributes).some((a) => a.name.startsWith('on')),
      ) ||
      resourceEpoch.some((r) => r.type === 'script')
    )
      recoveryIssues.push('scripted-recovery-unmeasured')
    if (
      nodes.some((e) =>
        e.matches('[aria-controls],[aria-expanded],[popovertarget],details,[popover]'),
      )
    )
      recoveryIssues.push('public-recovery-control-unmeasured')
    let cssCount = 0
    const pending: CSSRule[] = []
    if (document.styleSheets.length > 8) recoveryIssues.push('stylesheet-budget')
    for (const sheet of Array.from(document.styleSheets).slice(0, 8)) {
      try {
        for (let i = 0; i < sheet.cssRules.length && pending.length < 257; i++)
          pending.push(sheet.cssRules[i]!)
      } catch {
        recoveryIssues.push('stylesheet-recovery-unreadable')
      }
    }
    while (pending.length && cssCount++ < 256) {
      const rule = pending.shift()!
      if (
        /:(hover|focus|active|checked|target|has)/i.test((rule as CSSStyleRule).selectorText ?? '')
      )
        recoveryIssues.push('state-dependent-recovery-unmeasured')
      if (rule.type === CSSRule.IMPORT_RULE) recoveryIssues.push('imported-recovery-unmeasured')
      const children = (rule as CSSGroupingRule).cssRules
      if (children)
        for (let i = 0; i < children.length && pending.length < 257; i++) pending.push(children[i]!)
    }
    if (pending.length) recoveryIssues.push('stylesheet-budget')
    const candidates = native.slice(0, 8)
    const styles = new Map(nodes.map((e) => [e, getComputedStyle(e)]))
    const boxes = new Map(nodes.map((e) => [e, rect(e.getBoundingClientRect())]))
    // Any unbounded paint/animation can invalidate a local flat raster proof.
    for (const e of nodes) {
      const s = styles.get(e)!
      if (
        e.shadowRoot ||
        e.localName.includes('-') ||
        e.namespaceURI !== 'http://www.w3.org/1999/xhtml' ||
        ['IFRAME', 'CANVAS', 'SVG', 'VIDEO', 'OBJECT', 'EMBED'].includes(e.tagName)
      )
        issues.push('unmeasured-paint-surface')
      if (s.display === 'none') continue
      if (
        !candidates.includes(e) &&
        !e.children.length &&
        e.textContent?.trim() &&
        (e.scrollWidth > e.clientWidth || e.scrollHeight > e.clientHeight)
      )
        issues.push('external-overflow-paint')
      if (s.display === 'list-item' && s.listStyleType !== 'none')
        issues.push('unmeasured-list-marker')
      if (e.getAnimations().some((a) => a.playState === 'running' || a.pending))
        issues.push('active-animation')
      if (
        s.boxShadow !== 'none' ||
        s.textShadow !== 'none' ||
        s.filter !== 'none' ||
        s.backdropFilter !== 'none' ||
        (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0)
      )
        issues.push('unbounded-paint-effect')
      if (
        ['::before', '::after'].some(
          (p) => !['none', 'normal'].includes(getComputedStyle(e, p).content),
        )
      )
        issues.push('generated-content')
      if (performance.now() - started > 100) {
        issues.push('fact-time-budget')
        break
      }
    }
    const rows = candidates.map((e) => {
      const s = styles.get(e)!,
        b = boxes.get(e)!,
        rowIssues: string[] = []
      const rawText = e.textContent ?? '',
        text = rawText.trim().slice(0, 120)
      let excluded: string | null = null
      if (e.matches(':disabled,[aria-disabled=true]') || e.closest('[inert]'))
        excluded = 'disabled-or-inert'
      if (
        e.closest('[hidden],[aria-hidden=true]') ||
        s.display === 'none' ||
        s.visibility !== 'visible' ||
        !b.width ||
        !b.height
      )
        excluded = 'not-presented'
      if (
        nodes.some(
          (n) =>
            n.matches('dialog[open],[role=dialog][aria-modal=true]') &&
            !n.contains(e) &&
            (boxes.get(n)?.width ?? 0) > 0,
        )
      )
        excluded = 'modal-background'
      if (e.children.length || !text || rawText !== text || rawText.length > 120)
        rowIssues.push('not-sole-simple-text')
      if (
        e.closest(
          '[title],[aria-label],[aria-labelledby],[aria-describedby],[aria-details],[aria-busy=true],abbr,details,[role=tooltip]',
        ) ||
        e.hasAttribute('aria-haspopup') ||
        e.hasAttribute('aria-expanded') ||
        e.hasAttribute('popovertarget') ||
        e.closest('[popover],[role=menu],[role=listbox],[role=dialog],dialog')
      )
        rowIssues.push('alternative-or-layer-intent-unconfirmed')
      if (
        s.textOverflow !== 'clip' ||
        !['none', ''].includes(s.getPropertyValue('-webkit-line-clamp'))
      )
        rowIssues.push('intentional-truncation-unconfirmed')
      if (
        s.color !== 'rgb(0, 0, 0)' ||
        s.webkitTextFillColor !== 'rgb(0, 0, 0)' ||
        s.backgroundColor !== 'rgb(255, 255, 255)'
      )
        rowIssues.push('unsupported-flat-colors')
      if (
        s.fontFamily !== 'Arial' ||
        s.fontStyle !== 'normal' ||
        s.fontWeight !== '400' ||
        parseFloat(s.fontSize) < 12 ||
        parseFloat(s.fontSize) > 40 ||
        s.letterSpacing !== 'normal' ||
        s.wordSpacing !== '0px' ||
        s.textTransform !== 'none' ||
        s.textDecorationLine !== 'none' ||
        s.textShadow !== 'none' ||
        parseFloat(s.webkitTextStrokeWidth) !== 0 ||
        s.writingMode !== 'horizontal-tb' ||
        s.direction !== 'ltr' ||
        s.textIndent !== '0px' ||
        s.fontVariantCaps !== 'normal'
      )
        rowIssues.push('unsupported-typography')
      if (
        s.appearance !== 'none' ||
        !['static', 'relative'].includes(s.position) ||
        s.zIndex !== 'auto'
      )
        rowIssues.push('unsupported-control-paint')
      const range = document.createRange()
      range.selectNodeContents(e)
      const textBox = rect(range.getBoundingClientRect())
      if (
        range.getClientRects().length !== 1 ||
        !textBox.width ||
        !textBox.height ||
        textBox.width > 500 ||
        textBox.height > 64
      )
        rowIssues.push('text-layout-budget-or-multiline')
      const clip = { x: 0, y: 0, width: innerWidth, height: innerHeight }
      const clipping: { selector: string; box: typeof b; overflowX: string; overflowY: string }[] =
        []
      let depth = 0
      for (let n: Element | null = e; n && depth++ < 32; n = n.parentElement) {
        const c = styles.get(n)
        if (!c) {
          rowIssues.push('ancestor-unmeasured')
          break
        }
        if (
          c.opacity !== '1' ||
          c.transform !== 'none' ||
          c.perspective !== 'none' ||
          c.filter !== 'none' ||
          c.backdropFilter !== 'none' ||
          c.clipPath !== 'none' ||
          c.maskImage !== 'none' ||
          c.mixBlendMode !== 'normal' ||
          c.backgroundImage !== 'none' ||
          c.contentVisibility !== 'visible' ||
          c.zoom !== '1' ||
          c.scale !== 'none' ||
          c.rotate !== 'none' ||
          c.translate !== 'none' ||
          c.clip !== 'auto'
        )
          rowIssues.push('complex-compositing')
        if (
          [
            c.borderTopLeftRadius,
            c.borderTopRightRadius,
            c.borderBottomLeftRadius,
            c.borderBottomRightRadius,
          ].some((v) => v !== '0px')
        )
          rowIssues.push('rounded-clip')
        if (['auto', 'scroll'].includes(c.overflowX) || ['auto', 'scroll'].includes(c.overflowY))
          rowIssues.push('scroll-recovery-unmeasured')
        if (
          n === e &&
          [c.borderTopWidth, c.borderRightWidth, c.borderBottomWidth, c.borderLeftWidth].some(
            (v) => parseFloat(v) !== 0,
          )
        )
          rowIssues.push('control-border')
        if (['hidden', 'clip'].includes(c.overflowX) || ['hidden', 'clip'].includes(c.overflowY)) {
          const nb = boxes.get(n)!,
            cb = {
              x: nb.x + parseFloat(c.borderLeftWidth),
              y: nb.y + parseFloat(c.borderTopWidth),
              width: (n as HTMLElement).clientWidth,
              height: (n as HTMLElement).clientHeight,
            }
          clipping.push({
            selector: selector(n),
            box: cb,
            overflowX: c.overflowX,
            overflowY: c.overflowY,
          })
          // Hidden can be programmatically scrolled; do not assume absence of a recovery path.
          if (c.overflowX === 'hidden' || c.overflowY === 'hidden')
            rowIssues.push('hidden-overflow-recovery-unconfirmed')
          const right = Math.min(
            clip.x + clip.width,
            c.overflowX === 'clip' ? cb.x + cb.width : innerWidth,
          )
          const bottom = Math.min(
            clip.y + clip.height,
            c.overflowY === 'clip' ? cb.y + cb.height : innerHeight,
          )
          clip.x = Math.max(clip.x, c.overflowX === 'clip' ? cb.x : 0)
          clip.y = Math.max(clip.y, c.overflowY === 'clip' ? cb.y : 0)
          clip.width = Math.max(0, right - clip.x)
          clip.height = Math.max(0, bottom - clip.y)
        }
      }
      if (depth >= 32) rowIssues.push('ancestor-budget')
      if (
        textBox.x < 0 ||
        textBox.y < 0 ||
        textBox.x + textBox.width > innerWidth ||
        textBox.y + textBox.height > innerHeight
      )
        rowIssues.push('outside-viewport')
      if (clip.x > textBox.x || clip.x + clip.width < textBox.x + textBox.width)
        rowIssues.push('horizontal-abbreviation-unconfirmed')
      const parent = e.parentElement
      const group = parent && parent.matches('nav,fieldset,[role=toolbar]') ? parent : null
      if (group && Array.from(group.children).some((n) => !n.matches('button,a[href],legend')))
        rowIssues.push('mixed-group-content')
      // A possible alternate visible expression is not automatically accepted or rejected.
      if (
        nodes.some(
          (n) =>
            n !== e &&
            !n.contains(e) &&
            !e.contains(n) &&
            !n.children.length &&
            n.textContent?.trim() === text &&
            (boxes.get(n)?.width ?? 0) > 0,
        )
      )
        rowIssues.push('duplicate-expression-recovery-unconfirmed')
      const overlaps = nodes
        .filter(
          (n) =>
            n !== e &&
            !n.contains(e) &&
            !e.contains(n) &&
            styles.get(n)!.display !== 'none' &&
            styles.get(n)!.visibility === 'visible' &&
            intersects(boxes.get(n)!, textBox),
        )
        .map((n) => ({
          nodeId: id(n),
          selector: selector(n),
          box: boxes.get(n)!,
          laterSibling:
            !!group &&
            n.parentElement === group &&
            !!(e.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING),
        }))
      if (performance.now() - started > 150) rowIssues.push('fact-time-budget')
      return {
        selector: selector(e),
        nodeId: id(e),
        text,
        box: b,
        textBox,
        clip,
        clipping,
        overlaps,
        groupId: group ? id(group) : null,
        groupBasis: group
          ? group.tagName.toLowerCase() === 'nav'
            ? 'native-navigation-members'
            : group.tagName.toLowerCase() === 'fieldset'
              ? 'native-fieldset-actions'
              : 'public-toolbar-members'
          : null,
        excluded,
        issues: [...new Set(rowIssues)],
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        whiteSpace: s.whiteSpace,
        scroll: {
          width: e.scrollWidth,
          height: e.scrollHeight,
          left: e.scrollLeft,
          top: e.scrollTop,
        },
      }
    })
    return {
      version: 'control-layout-facts-1' as const,
      recoveryIssues: [...new Set(recoveryIssues)],
      resourceEpoch,
      url: location.href,
      documentId: store.documentId,
      epoch: store.epoch,
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { x: scrollX, y: scrollY },
      resources: nodes
        .filter((e) => e instanceof HTMLImageElement)
        .map((e) => {
          const i = e as HTMLImageElement
          return {
            id: id(i),
            src: i.currentSrc,
            complete: i.complete,
            width: i.naturalWidth,
            height: i.naturalHeight,
          }
        }),
      rows,
      totalObserved: native.length,
      omitted: Math.max(0, native.length - rows.length),
      enumerationComplete: !next,
      issues: [...new Set(issues)],
    }
  })
}
export type LayoutFacts = Awaited<ReturnType<typeof readLayoutFacts>>
export type LayoutTarget = LayoutFacts['rows'][number]
export interface LayoutPixels {
  selector: string
  ink: number
  visibleInk: number
  clippedInk: number
  coveredInk: number
  mismatch: number
  overlapMismatch: number
  error?: string
}

/** Reference text in a network-denied context, never alter or re-screenshot the inspected page. */
export async function measureLayoutPixels(page: Page, png: Buffer, facts: LayoutFacts) {
  const rows = facts.issues.length ? [] : facts.rows.filter((r) => !r.excluded && !r.issues.length)
  const pixels: LayoutPixels[] = []
  if (!rows.length) return { pixels, referencePng: undefined as Buffer | undefined }
  const context = await page
    .context()
    .browser()!
    .newContext({
      viewport: { width: 544, height: rows.length * 96 },
      deviceScaleFactor: 1,
      serviceWorkers: 'block',
    })
  try {
    await context.route('**/*', (r) => r.abort())
    const isolated = await context.newPage()
    const regions = await isolated.evaluate((rows) => {
      document.documentElement.style.background = 'white'
      document.body.style.margin = '0'
      return rows.map((r, i) => {
        const span = document.createElement('span')
        span.textContent = r.text
        Object.assign(span.style, {
          position: 'absolute',
          left: `${16 + (r.textBox.x % 1)}px`,
          top: `${i * 96 + 16}px`,
          color: 'black',
          background: 'white',
          font: `400 ${r.fontSize} Arial`,
          lineHeight: r.lineHeight,
          whiteSpace: 'pre',
        })
        document.body.append(span)
        const range = document.createRange()
        range.selectNodeContents(span)
        let box = range.getBoundingClientRect()
        span.style.top = `${parseFloat(span.style.top) + i * 96 + 16 + (r.textBox.y % 1) - box.y}px`
        box = range.getBoundingClientRect()
        return {
          x: Math.floor(box.x),
          y: Math.floor(box.y),
          width: Math.ceil(r.textBox.x + r.textBox.width) - Math.floor(r.textBox.x),
          height: Math.ceil(r.textBox.y + r.textBox.height) - Math.floor(r.textBox.y),
          compatible:
            Math.abs(box.width - r.textBox.width) < 0.1 &&
            Math.abs(box.height - r.textBox.height) < 0.1,
        }
      })
    }, rows)
    const referencePng = await isolated.screenshot({ scale: 'css', caret: 'initial' })
    const measured = await isolated.evaluate(
      async ({ source, reference, rows, regions }) => {
        async function decode(url: string) {
          const img = new Image()
          img.src = url
          await img.decode()
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')!
          ctx.drawImage(img, 0, 0)
          return {
            data: ctx.getImageData(0, 0, c.width, c.height).data,
            width: c.width,
            height: c.height,
          }
        }
        const actual = await decode(source),
          atlas = await decode(reference)
        return rows.map((r, i) => {
          const region = regions[i]!,
            out = {
              selector: r.selector,
              ink: 0,
              visibleInk: 0,
              clippedInk: 0,
              coveredInk: 0,
              mismatch: 0,
              overlapMismatch: 0,
              error: undefined as string | undefined,
            }
          if (!region.compatible || region.width * region.height > 32000) {
            out.error = 'reference-layout-mismatch'
            return out
          }
          const covers = r.overlaps.filter(
            (o) =>
              o.laterSibling &&
              rows.some(
                (other) =>
                  other.nodeId === o.nodeId &&
                  !other.issues.length &&
                  !other.excluded &&
                  other.groupId === r.groupId &&
                  other.text !== r.text &&
                  (other.textBox.y >= r.textBox.y + r.textBox.height ||
                    other.textBox.y + other.textBox.height <= r.textBox.y ||
                    other.textBox.x >= r.textBox.x + r.textBox.width ||
                    other.textBox.x + other.textBox.width <= r.textBox.x),
              ),
          )
          for (let y = 0; y < region.height; y++)
            for (let x = 0; x < region.width; x++) {
              const px = Math.floor(r.textBox.x) + x,
                py = Math.floor(r.textBox.y) + y
              const ai = (py * actual.width + px) * 4,
                ri = ((region.y + y) * atlas.width + region.x + x) * 4
              const expected = atlas.data[ri]!,
                value = actual.data[ai]!
              const clipped =
                px + 0.5 < r.clip.x ||
                px + 0.5 >= r.clip.x + r.clip.width ||
                py + 0.5 < r.clip.y ||
                py + 0.5 >= r.clip.y + r.clip.height
              const covered = covers.some(
                (c) =>
                  px + 0.5 >= c.box.x &&
                  px + 0.5 < c.box.x + c.box.width &&
                  py + 0.5 >= c.box.y &&
                  py + 0.5 < c.box.y + c.box.height,
              )
              const matches = (v: number) =>
                Math.abs(value - v) <= 2 &&
                Math.abs(actual.data[ai + 1]! - v) <= 2 &&
                Math.abs(actual.data[ai + 2]! - v) <= 2 &&
                actual.data[ai + 3] === 255
              if (!matches(clipped ? 255 : expected)) out.mismatch++
              if (!matches(covered ? 255 : expected)) out.overlapMismatch++
              if (expected < 200) {
                out.ink++
                if (clipped) out.clippedInk++
                else if (covered) out.coveredInk++
                else if (matches(expected)) out.visibleInk++
              }
            }
          return out
        })
      },
      {
        source: 'data:image/png;base64,' + png.toString('base64'),
        reference: 'data:image/png;base64,' + referencePng.toString('base64'),
        rows,
        regions,
      },
    )
    return { pixels: measured, referencePng }
  } finally {
    await context.close()
  }
}
