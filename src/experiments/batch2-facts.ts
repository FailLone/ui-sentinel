import type { Page } from 'playwright'

/** Experimental facts only: no shared R0 snapshot or collection contract is changed. */
export async function readBatch2Facts(
  page: Page,
  requested?: { controls?: string[]; images?: string[] },
) {
  return page.evaluate((requested) => {
    const host = window as typeof window & {
      __sentinelBatch2?: {
        ids: WeakMap<Element, number>
        next: number
        documentId: string
        epoch: number
      }
    }
    if (!host.__sentinelBatch2) {
      host.__sentinelBatch2 = {
        ids: new WeakMap(),
        next: 1,
        documentId: Math.random().toString(36),
        epoch: 0,
      }
      new MutationObserver(() => {
        host.__sentinelBatch2!.epoch++
      }).observe(document, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      })
    }
    const store = host.__sentinelBatch2
    const id = (el: Element) => {
      if (!store.ids.has(el)) store.ids.set(el, store.next++)
      return store.ids.get(el)!
    }
    function selector(el: Element): string {
      if (el.id) return '#' + CSS.escape(el.id)
      const parts = []
      for (let n: Element | null = el; n && n !== document.documentElement; n = n.parentElement) {
        parts.unshift(
          `${n.tagName.toLowerCase()}:nth-child(${Array.from(n.parentElement?.children ?? []).indexOf(n) + 1})`,
        )
      }
      return 'html > ' + parts.join(' > ')
    }
    const rect = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height })
    const overlap = (a: DOMRect, b: DOMRect) =>
      a.width > 0 &&
      a.height > 0 &&
      b.width > 0 &&
      b.height > 0 &&
      a.left < b.right &&
      a.right > b.left &&
      a.top < b.bottom &&
      a.bottom > b.top
    const contains = (a: DOMRect, b: DOMRect) =>
      a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom
    const inView = (b: DOMRect) =>
      b.width > 0 &&
      b.height > 0 &&
      b.left >= 0 &&
      b.top >= 0 &&
      b.right <= innerWidth &&
      b.bottom <= innerHeight
    const parseColor = (s: string): number[] | null => {
      const m = /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/.exec(s)
      if (!m) return null
      const c = [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])]
      return c.every(Number.isFinite) &&
        c.slice(0, 3).every((v) => v >= 0 && v <= 255) &&
        c[3]! >= 0 &&
        c[3]! <= 1
        ? c
        : null
    }
    const composite = (fg: number[], bg: number[]) =>
      fg.slice(0, 3).map((v, i) => v * fg[3]! + bg[i]! * (1 - fg[3]!))
    const all: Element[] = []
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT)
    let el: Node | null = walker.currentNode
    while (el && all.length < 1025) {
      all.push(el as Element)
      el = walker.nextNode()
    }
    const budgetExceeded = all.length > 1024
    const nativeControls = Array.from(document.querySelectorAll('button,a[href]'))
    const nativeImages = Array.from(document.querySelectorAll('img'))
    function locate(s: string) {
      if (s.length > 1000) return { matchCount: 0, target: null, issue: 'selector-budget' }
      try {
        const matches = document.querySelectorAll(s)
        return {
          matchCount: matches.length,
          target: matches.length === 1 ? matches[0]! : null,
          issue: matches.length === 1 ? null : 'target-missing-or-ambiguous',
        }
      } catch {
        return { matchCount: 0, target: null, issue: 'invalid-selector' }
      }
    }
    const controlSelectors = (requested?.controls ?? nativeControls.map(selector)).slice(0, 16)
    const imageSelectors = (requested?.images ?? nativeImages.map(selector)).slice(0, 16)
    const controls = controlSelectors.map((s) => {
      const found = locate(s),
        target = found.target
      const issues: string[] = found.issue ? [found.issue] : []
      let excluded: string | null = null
      let foreground: number[] | null = null,
        background: number[] | null = null,
        composed: number[] | null = null
      const layers: { selector: string; color: string; rgba: number[] | null }[] = []
      let textBounds: ReturnType<typeof rect> | null = null
      let text = '',
        roleBasis: string | null = null
      if (target) {
        const b = target.getBoundingClientRect(),
          c = getComputedStyle(target)
        text = (target.textContent ?? '').trim().slice(0, 240)
        if (
          !(
            target instanceof HTMLButtonElement ||
            (target instanceof HTMLAnchorElement && target.hasAttribute('href'))
          )
        )
          issues.push('not-native-action')
        else
          roleBasis =
            target.tagName === 'BUTTON'
              ? 'enabled-native-button-text-name'
              : 'native-link-with-href-text-name'
        if (target.matches(':disabled,[aria-disabled=true]') || target.closest('[inert]'))
          excluded = 'disabled-or-inert'
        if (
          c.display === 'none' ||
          c.visibility !== 'visible' ||
          !b.width ||
          !b.height ||
          target.closest('[hidden],[aria-hidden=true]')
        )
          excluded ??= 'not-presented'
        if (
          Array.from(document.querySelectorAll('dialog:modal,[role=dialog][aria-modal=true]')).some(
            (d) => !d.contains(target) && d.getBoundingClientRect().width > 0,
          )
        )
          excluded ??= 'modal-background'
        if (!text) issues.push('no-text-name')
        if (target.children.length || (target.textContent?.length ?? 0) > 240)
          issues.push('non-simple-text-or-alternative-expression')
        if (
          ['aria-label', 'aria-labelledby', 'aria-describedby', 'role', 'title'].some((a) =>
            target.hasAttribute(a),
          ) ||
          (target instanceof HTMLButtonElement && target.labels?.length)
        )
          issues.push('alternative-or-overridden-name')
        if (document.fonts.status !== 'loaded' || document.fonts.size > 0)
          issues.push('font-not-established')
        if (document.getAnimations().some((a) => a.playState === 'running' || a.pending))
          issues.push('active-animation')
        if (matchMedia('(forced-colors: active)').matches) issues.push('forced-colors')
        if (!inView(b)) issues.push('outside-or-partial-viewport')
        const range = document.createRange()
        range.selectNodeContents(target)
        const boxes = Array.from(range.getClientRects())
        const tb = range.getBoundingClientRect()
        textBounds = rect(tb)
        if (boxes.length !== 1 || !tb.width || !tb.height || !contains(b, tb) || !inView(tb))
          issues.push('text-layout-not-contained-single-line')
        if (
          parseFloat(c.fontSize) < 12 ||
          c.writingMode !== 'horizontal-tb' ||
          c.textIndent !== '0px' ||
          c.textTransform !== 'none' ||
          !['normal', '0px'].includes(c.letterSpacing) ||
          c.wordSpacing !== '0px' ||
          c.textOverflow !== 'clip' ||
          (c.getPropertyValue('text-emphasis-style') &&
            c.getPropertyValue('text-emphasis-style') !== 'none')
        )
          issues.push('unsupported-text-layout')
        if (
          c.textShadow !== 'none' ||
          parseFloat(c.webkitTextStrokeWidth) !== 0 ||
          c.textDecorationLine !== 'none'
        )
          issues.push('stroke-shadow-or-decoration')
        foreground = parseColor(c.webkitTextFillColor || c.color)
        if (!foreground) issues.push('unsupported-foreground-color')
        if (c.appearance !== 'none') issues.push('native-appearance-unmeasured')
        const ancestors: Element[] = []
        for (let n: Element | null = target; n && ancestors.length < 65; n = n.parentElement)
          ancestors.push(n)
        if (ancestors.length > 64) issues.push('ancestor-budget')
        for (const n of ancestors) {
          const style = getComputedStyle(n),
            nb = n.getBoundingClientRect()
          const rgba = parseColor(style.backgroundColor)
          layers.push({
            selector: n === document.documentElement ? 'html' : selector(n),
            color: style.backgroundColor,
            rgba,
          })
          if (!rgba) issues.push('unsupported-background-color')
          if (
            style.opacity !== '1' ||
            style.mixBlendMode !== 'normal' ||
            style.filter !== 'none' ||
            style.backdropFilter !== 'none' ||
            style.maskImage !== 'none' ||
            style.clipPath !== 'none' ||
            style.backgroundImage !== 'none' ||
            style.boxShadow !== 'none' ||
            style.transform !== 'none' ||
            style.perspective !== 'none' ||
            style.getPropertyValue('-webkit-box-reflect') !== 'none' ||
            style.getPropertyValue('scale') !== 'none' ||
            style.getPropertyValue('rotate') !== 'none' ||
            style.getPropertyValue('translate') !== 'none' ||
            style.zoom !== '1'
          )
            issues.push('complex-compositing')
          if (
            style.backgroundClip !== 'border-box' ||
            style.backgroundBlendMode !== 'normal' ||
            style.contentVisibility !== 'visible'
          )
            issues.push('unsupported-background-or-content')
          if (style.visibility !== 'visible') issues.push('ancestor-hidden')
          if (
            style.clip !== 'auto' ||
            ((style.overflowX !== 'visible' || style.overflowY !== 'visible') && !contains(nb, tb))
          )
            issues.push('possible-clipping')
          if (
            ![
              style.borderTopLeftRadius,
              style.borderTopRightRadius,
              style.borderBottomLeftRadius,
              style.borderBottomRightRadius,
            ].every((v) => v === '0px')
          )
            issues.push('rounded-background')
          const left = nb.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
            top = nb.top + parseFloat(style.borderTopWidth) + parseFloat(style.paddingTop)
          const right =
              nb.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
            bottom =
              nb.bottom - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingBottom)
          if (
            n === target &&
            (tb.left < left - 0.1 ||
              tb.right > right + 0.1 ||
              tb.top < top - 0.1 ||
              tb.bottom > bottom + 0.1)
          )
            issues.push('text-overlaps-edge')
          if (!contains(nb, tb) && n !== document.documentElement)
            issues.push('background-not-covering-text')
        }
        // The opaque root avoids guessing UA canvas color or body background propagation.
        const root = layers.at(-1)?.rgba
        if (!root || root[3] !== 1) issues.push('canvas-background-unresolved')
        else {
          background = root.slice(0, 3)
          for (const layer of layers.slice(0, -1).reverse())
            if (layer.rgba) background = composite(layer.rgba, background)
          if (foreground) composed = composite(foreground, background)
        }
        if (budgetExceeded) issues.push('document-budget')
        for (const n of all) {
          const style = getComputedStyle(n),
            nb = n.getBoundingClientRect()
          // Pseudo paint can escape its own box. No bounded proof for it or shadow content here.
          if (n.namespaceURI !== 'http://www.w3.org/1999/xhtml')
            issues.push('foreign-paint-content')
          if (n.shadowRoot || n.tagName.includes('-')) issues.push('shadow-or-custom-content')
          for (const pseudo of ['::before', '::after', '::first-letter', '::first-line']) {
            const p = getComputedStyle(n, pseudo)
            if (
              (pseudo === '::before' || pseudo === '::after') &&
              p.content !== 'none' &&
              p.content !== 'normal' &&
              p.display !== 'none'
            )
              issues.push('pseudo-paint')
            if (
              (pseudo === '::first-letter' || pseudo === '::first-line') &&
              ancestors.includes(n) &&
              (p.color !== style.color ||
                (parseColor(p.backgroundColor)?.[3] ?? 1) !== 0 ||
                p.fontSize !== style.fontSize ||
                p.textShadow !== style.textShadow ||
                p.webkitTextFillColor !== style.webkitTextFillColor ||
                parseFloat(p.webkitTextStrokeWidth) !== 0 ||
                p.transform !== 'none' ||
                p.opacity !== '1' ||
                p.backgroundImage !== 'none' ||
                p.textDecorationLine !== 'none' ||
                p.cssFloat !== 'none' ||
                p.fontFamily !== style.fontFamily ||
                p.fontWeight !== style.fontWeight ||
                p.fontStyle !== style.fontStyle ||
                [
                  p.marginTop,
                  p.marginRight,
                  p.marginBottom,
                  p.marginLeft,
                  p.paddingTop,
                  p.paddingRight,
                  p.paddingBottom,
                  p.paddingLeft,
                  p.borderTopWidth,
                  p.borderRightWidth,
                  p.borderBottomWidth,
                  p.borderLeftWidth,
                ].some((v) => v !== '0px'))
            )
              issues.push('pseudo-text-style')
          }
          if (
            !ancestors.includes(n) &&
            overlap(nb, tb) &&
            style.display !== 'none' &&
            style.visibility === 'visible'
          )
            issues.push('intersecting-content')
          if (
            !ancestors.includes(n) &&
            (style.textShadow !== 'none' || style.boxShadow !== 'none' || style.filter !== 'none')
          )
            issues.push('external-paint-effect')
          if (
            !ancestors.includes(n) &&
            n.children.length === 0 &&
            n.textContent?.trim() &&
            (n.scrollWidth > n.clientWidth || n.scrollHeight > n.clientHeight)
          )
            issues.push('external-overflow-text')
        }
        for (const [x, y] of [
          [tb.left + tb.width / 2, tb.top + tb.height / 2],
          [tb.left + 1, tb.top + 1],
          [tb.right - 1, tb.bottom - 1],
        ]) {
          if (document.elementFromPoint(x!, y!) !== target) issues.push('hit-target-not-confirmed')
        }
      }
      return {
        selector: s,
        matchCount: found.matchCount,
        nodeId: target ? id(target) : null,
        text,
        roleBasis,
        excluded,
        issues: [...new Set(issues)],
        textBounds,
        foreground,
        background,
        composed,
        layers,
      }
    })
    const images = imageSelectors.map((s) => {
      const found = locate(s),
        target = found.target
      if (!(target instanceof HTMLImageElement))
        return {
          selector: s,
          matchCount: found.matchCount,
          nodeId: target ? id(target) : null,
          issue: found.issue ?? 'not-native-img',
          image: null,
        }
      const parent = target.parentElement,
        b = target.getBoundingClientRect(),
        style = getComputedStyle(target)
      const nearby = parent
        ? Array.from(parent.childNodes)
            .filter((n) => n !== target)
            .slice(0, 8)
            .map((n) => {
              const range = document.createRange()
              range.selectNode(n)
              const nb = range.getBoundingClientRect(),
                ns = n instanceof Element ? getComputedStyle(n) : getComputedStyle(parent)
              return {
                selector: n instanceof Element ? selector(n) : null,
                text: (n instanceof HTMLElement
                  ? n.innerText
                  : n.nodeType === Node.TEXT_NODE
                    ? (n.textContent ?? '')
                    : ''
                )
                  .trim()
                  .slice(0, 240),
                bounds: rect(nb),
                visibility: ns.visibility,
                display: ns.display,
                opacity: ns.opacity,
              }
            })
            .filter(
              (n) =>
                n.text &&
                n.bounds.width > 0 &&
                n.bounds.height > 0 &&
                n.visibility === 'visible' &&
                n.display !== 'none' &&
                n.opacity !== '0',
            )
        : []
      const alternatives = parent
        ? Array.from(parent.children)
            .filter((n) => n instanceof HTMLImageElement && n !== target)
            .slice(0, 8)
            .map((n) => {
              const i = n as HTMLImageElement
              return {
                selector: selector(i),
                url: i.currentSrc,
                alt: i.alt,
                complete: i.complete,
                naturalWidth: i.naturalWidth,
                bounds: rect(i.getBoundingClientRect()),
              }
            })
        : []
      return {
        selector: s,
        matchCount: found.matchCount,
        nodeId: id(target),
        issue: null,
        image: {
          src: target.getAttribute('src'),
          srcset: target.getAttribute('srcset'),
          currentSrc: target.currentSrc,
          loading: target.loading,
          complete: target.complete,
          naturalWidth: target.naturalWidth,
          naturalHeight: target.naturalHeight,
          alt: target.getAttribute('alt'),
          role: target.getAttribute('role'),
          bounds: rect(b),
          inViewport: inView(b),
          hidden:
            style.display === 'none' || style.visibility !== 'visible' || !b.width || !b.height,
          container: parent
            ? {
                selector: selector(parent),
                bounds: rect(parent.getBoundingClientRect()),
                relationship:
                  parent.tagName === 'FIGURE' ? 'figure-children' : 'direct-parent-children',
                confidence: 'structural-only',
                omittedSiblings: Math.max(0, parent.childNodes.length - 1 - 8),
              }
            : null,
          nearby,
          alternatives,
        },
      }
    })
    return {
      version: 'batch2-dom-1' as const,
      url: location.href,
      viewport: { width: innerWidth, height: innerHeight },
      documentId: store.documentId,
      epoch: store.epoch,
      documentScan: { visited: all.length, complete: !budgetExceeded },
      totalControls: nativeControls.length,
      totalImages: nativeImages.length,
      omittedControls: Math.max(0, (requested?.controls?.length ?? nativeControls.length) - 16),
      omittedImages: Math.max(0, (requested?.images?.length ?? nativeImages.length) - 16),
      controls,
      images,
    }
  }, requested)
}
export type Batch2Dom = Awaited<ReturnType<typeof readBatch2Facts>>

/** Decode only our already captured screenshot in an isolated, network-denied page. */
export async function screenshotInk(page: Page, png: Buffer, controls: Batch2Dom['controls']) {
  const context = await page.context().browser()!.newContext({ serviceWorkers: 'block' })
  try {
    await context.route('**/*', (r) => r.abort())
    const isolated = await context.newPage()
    // A string function is intentional: this new context does not have the tsx __name helper.
    return (await isolated.evaluate(
      `(async ({url,controls}) => {
      const image = new Image(); image.src=url; await image.decode();
      const canvas=document.createElement('canvas'); canvas.width=image.width; canvas.height=image.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      return controls.map(c=>{
        const b=c.textBounds,bg=c.background,fg=c.composed;
        if(!b||!bg||!fg) return {selector:c.selector,samples:0,backgroundPixels:0,foregroundPixels:0,otherPixels:0};
        const x=Math.max(0,Math.ceil(b.x)),y=Math.max(0,Math.ceil(b.y));
        const w=Math.min(image.width,Math.floor(b.x+b.width))-x,h=Math.min(image.height,Math.floor(b.y+b.height))-y;
        if(w<=0||h<=0||w*h>100000) return {selector:c.selector,samples:0,backgroundPixels:0,foregroundPixels:0,otherPixels:0};
        const data=ctx.getImageData(x,y,w,h).data;
        let backgroundPixels=0,foregroundPixels=0,otherPixels=0;
        for(let i=0;i<data.length;i+=4){
          const isBg=bg.every((v,k)=>data[i+k]===Math.round(v))&&data[i+3]===255;
          const isFg=fg.every((v,k)=>data[i+k]===Math.round(v))&&data[i+3]===255;
          if(isBg)backgroundPixels++;else if(isFg)foregroundPixels++;else otherPixels++;
        }
        return {selector:c.selector,samples:w*h,backgroundPixels,foregroundPixels,otherPixels};
      });
    })(${JSON.stringify({ url: 'data:image/png;base64,' + png.toString('base64'), controls })})`,
    )) as {
      selector: string
      samples: number
      backgroundPixels: number
      foregroundPixels: number
      otherPixels: number
    }[]
  } finally {
    await context.close()
  }
}
