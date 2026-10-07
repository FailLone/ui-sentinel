import { CONTROL_PATH_PREFIXES } from '../../inspection/navigation-scope.ts'

/** Runs in an isolated Chromium world before page scripts. The Navigation API exposes a
 * cancellable pre-commit event for same-document navigations; the page cannot replace this listener.
 * No page-provided attributes or messages grant authority. CDP remains the document/request gate.
 */
export function routeGuardSource(input: {
  entryUrl: string
  maxPages: number
  maxDepth: number
  state: { current: string; attempts: number; pages: [string, number][] }
}) {
  return `(() => {
    if (window !== window.top) return;
    const config = ${JSON.stringify(input)};
    const prefixes = ${JSON.stringify(CONTROL_PATH_PREFIXES)};
    let depths = new Map(), current = location.href, attempts = 0, ready = false;
    globalThis.__sentinelUpdate = state => { depths = new Map(state.pages); current = state.current; attempts = state.attempts; ready = true; };
    __sentinelRouteDecision(JSON.stringify({ready:true}));
    navigation.addEventListener('navigate', event => {
      if (!event.destination.sameDocument) return;
      const url = event.destination.url;
      if (url === current) return;
      let reason = null, depth = 0;
      try {
        const target = new URL(url);
        if (!/^https?:$/.test(target.protocol) || target.origin !== new URL(config.entryUrl).origin) reason = 'outside-entry-origin';
        const path = decodeURIComponent(target.pathname);
        if (prefixes.some(p => path === p || path.startsWith(p + '/'))) reason = 'control-surface';
        depth = depths.get(url) ?? ((depths.get(current) ?? 0) + 1);
        if (depth > config.maxDepth) reason = 'depth-exceeded';
        if (!depths.has(url) && depths.size >= config.maxPages) reason = 'page-budget-exhausted';
        if (++attempts > 8) reason = 'navigation-attempts-exhausted';
      } catch { reason = 'malformed-url'; }
      if (!ready) reason = 'route-guard-not-ready';
      if (reason) event.preventDefault();
      __sentinelRouteDecision(JSON.stringify({url, from: current, allow: !reason, reason, prevented: !!reason && event.defaultPrevented}));
      if (!reason) { depths.set(url, depth); current = url; }
    });
  })();`
}
