import { createServer } from 'node:http'

/** Only the harness owns the variant. Public pages expose behaviour, never labels or controls. */
export const URL_SCAN_HOLDOUT_LAYOUT = 'holdout-inset-9' as const
export const URL_SCAN_SEEN_BORDERED = 'holdout-bordered-8' as const
export const URL_SCAN_SEEN_COLUMNS = 'holdout-columns-7' as const
export const URL_SCAN_SEEN_STACK = 'holdout-stack-6' as const
export const URL_SCAN_SEEN_WIDE = 'holdout-wide-5' as const
export const URL_SCAN_SEEN_LIST = 'holdout-list-4' as const
export const URL_SCAN_SEEN_CARDS = 'holdout-cards-3' as const
export const URL_SCAN_SEEN_SIDEBAR = 'holdout-sidebar-2' as const
export const URL_SCAN_SEEN_LAYOUT = 'holdout-grid-1' as const
export async function startUrlScanFixture(
  layout:
    | 'development'
    | typeof URL_SCAN_HOLDOUT_LAYOUT
    | typeof URL_SCAN_SEEN_BORDERED
    | typeof URL_SCAN_SEEN_COLUMNS
    | typeof URL_SCAN_SEEN_STACK
    | typeof URL_SCAN_SEEN_WIDE
    | typeof URL_SCAN_SEEN_LIST
    | typeof URL_SCAN_SEEN_CARDS
    | typeof URL_SCAN_SEEN_SIDEBAR
    | typeof URL_SCAN_SEEN_LAYOUT = 'development',
) {
  let defective = false
  const requests: { method: string; path: string; observedAt: string }[] = []
  const rows = [
    { name: 'Blue widget', price: 20 },
    { name: 'Amber gadget', price: 5 },
    { name: 'Cyan sprocket', price: 12 },
  ]
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.invalid')
    requests.push({
      method: request.method ?? 'GET',
      path: url.pathname + url.search,
      observedAt: new Date().toISOString(),
    })
    if (!['GET', 'HEAD'].includes(request.method ?? '')) {
      response.writeHead(405).end()
      return
    }
    if (url.pathname === '/items') {
      const sort = url.searchParams.get('sort') ?? 'price'
      const sorted = [...rows].sort((a, b) =>
        sort === 'price' ? a.price - b.price : a.name.localeCompare(b.name),
      )
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(sorted))
      return
    }
    if (url.pathname === '/info') {
      response
        .writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
        .end(
          '<h1>Catalog information</h1><p>Prices are numeric; use the sorting controls to arrange products.</p>',
        )
      return
    }
    if (!['/catalog', '/detail', '/overlay', '/boundary'].includes(url.pathname)) {
      response.writeHead(404).end('Not found')
      return
    }
    const overlay = url.pathname === '/overlay'
    const brokenSort = defective && url.pathname === '/detail'
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    const holdoutStyle =
      layout === URL_SCAN_SEEN_LAYOUT
        ? 'body{display:grid;grid-template-columns:260px minmax(300px,680px);gap:16px;max-width:1020px;margin:24px auto;padding:18px;background:#f4f7fa}h1,p{grid-column:1/-1}#rows{grid-column:2;grid-row:3/6;background:white;padding:24px 42px;min-height:220px}#apply,#filter-wrap{grid-column:1}a{grid-column:1/-1}#panel{grid-column:2;background:#fff;padding:18px}'
        : layout === URL_SCAN_SEEN_SIDEBAR
          ? 'body{max-width:880px;margin:32px auto;display:grid;grid-template-columns:minmax(420px,1fr) 240px;gap:18px;background:#f8f6f2}h1,p{grid-column:1/-1}label{grid-column:2;grid-row:3}#apply{grid-column:2;grid-row:4;align-self:start}#rows{grid-column:1;grid-row:3/7;list-style:none;margin:0;padding:24px;background:white;border:1px solid #ccd2da;border-radius:8px}#rows li{padding:16px 8px;border-bottom:1px solid #eee}#filter-wrap{grid-column:2;grid-row:5}#panel{grid-column:2;grid-row:6}a{grid-column:1/-1;padding:14px 0}'
          : layout === URL_SCAN_SEEN_CARDS
            ? 'body{max-width:920px;margin:36px auto;background:#f4f7f8}h1{border-bottom:3px solid #6b7d8a;padding-bottom:18px}#rows{display:grid;grid-template-columns:repeat(3,1fr);list-style:none;padding:0;gap:18px;margin:28px 0}#rows li{background:white;border:1px solid #cdd6dc;padding:32px 16px;border-radius:6px}.price{font-size:22px}#panel{padding:20px;background:white}a{display:block;margin-top:24px}'
            : layout === URL_SCAN_SEEN_LIST
              ? 'body{max-width:820px;margin:20px auto;background:#fbfaf7;color:#203040}h1{padding:12px 18px;background:#e7edf1;border-radius:4px}#rows{list-style:none;padding:12px 20px;border-left:4px solid #63798c;background:white}#rows li{padding:14px 8px;border-bottom:1px solid #eee}.price{display:inline-block;min-width:48px;font-weight:bold}#panel{padding:14px;background:#e7edf1}a{display:block;margin-top:18px}'
              : layout === URL_SCAN_SEEN_WIDE
                ? 'body{max-width:1000px;margin:24px auto;background:white;color:#1e2935}h1{margin:0;padding:20px;background:#eef2f5}p{padding:0 20px}#rows{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;list-style:none;padding:0;margin:22px 0}#rows li{padding:22px 16px;border-top:5px solid #7894a5;border-bottom:1px solid #b8c8d1;background:#f5f8fa}#panel{padding:18px;background:#eef2f5}a{display:block;padding:18px 0}'
                : layout === URL_SCAN_SEEN_STACK
                  ? 'body{max-width:860px;margin:32px auto;background:#f4f6f3;color:#24322c}h1{padding:16px 0;border-bottom:2px solid #768b80}#rows{list-style:none;padding:16px 24px;background:#fff;border-radius:10px}#rows li{padding:16px 12px;margin:8px 0;border-left:4px solid #9aad9f;background:#f3f6f4}.price{display:inline-block;width:44px;font-weight:bold}#panel{padding:18px;border:1px solid #768b80}a{display:block;padding:16px 0}'
                  : layout === URL_SCAN_SEEN_COLUMNS
                    ? 'body{max-width:960px;margin:24px auto;display:grid;grid-template-columns:220px 1fr;gap:14px;background:#f9f8f4;color:#26323c}h1,p,a{grid-column:1/-1}label{grid-column:1;grid-row:3}#apply{grid-column:1;grid-row:4;align-self:start}#rows{grid-column:2;grid-row:3/6;margin:0;padding:20px 40px;background:#fff;border:1px solid #c5ced4}#rows li{padding:18px 6px}#filter-wrap{grid-column:1;grid-row:5;align-self:start}#panel{grid-column:2;padding:16px;background:#eaf0f2}a{padding:12px 0}'
                    : layout === URL_SCAN_SEEN_BORDERED
                      ? 'body{max-width:900px;margin:28px auto;background:#f1f5f8;color:#273847}h1{padding:16px;border-left:6px solid #557a94;background:white}#rows{padding:12px 32px;background:white;border:1px solid #adc0ce;list-style:none}#rows li{padding:16px 8px;border-bottom:1px solid #dce5eb}.price{font-weight:bold;min-width:40px}#panel{padding:16px;background:#dfeaf1}a{display:block;padding:18px 0}'
                      : layout === URL_SCAN_HOLDOUT_LAYOUT
                        ? 'body{max-width:840px;margin:30px auto;background:#faf8f3;color:#302d26}h1{padding:18px 20px;background:#ece7dd;border-radius:8px}#rows{padding:16px 34px;border:1px dashed #8b8071;list-style:none;background:white}#rows li{padding:15px 8px;margin:5px 0;background:#f7f4ee}.price{font-weight:bold}#panel{padding:18px;border-left:4px solid #8b8071;background:#eee8de}a{display:block;margin-top:20px}'
                        : ''
    response.end(`<!doctype html><html><head><title>Product catalog</title><style>body{font:16px sans-serif;padding:30px}button,select{padding:12px;margin:8px}#filter-wrap{position:relative;display:inline-block}.screen{position:absolute;inset:0;z-index:2}${holdoutStyle}</style></head><body>
      <h1>Product catalog</h1><p>Choose a sort order and apply it. Prices are numeric.</p>
      <label>Sort <select id="sort" aria-label="Sort"><option value="price">Price</option><option value="name">Name</option></select></label>
      <button id="apply" type="button">Apply sort</button><ul id="rows">${rows.map((row) => `<li><span class="price">${row.price}</span> · <span class="name">${row.name}</span></li>`).join('')}</ul>
      ${overlay ? `<span id="filter-wrap"><button id="filters" type="button" aria-expanded="false">Filters</button>${defective ? '<span class="screen"></span>' : ''}</span><section id="panel" hidden>Available products</section>` : ''}
      <a href="/info">About this catalog</a>
      <script>
      document.getElementById('apply').onclick=async()=>{const rows=await(await fetch('/items?sort='+document.getElementById('sort').value)).json();${brokenSort ? '' : "document.getElementById('rows').innerHTML=rows.map(r=>'<li><span class=price>'+r.price+'</span> · <span class=name>'+r.name+'</span></li>').join('');"}};
      const filters=document.getElementById('filters');if(filters)filters.onclick=()=>{const panel=document.getElementById('panel');panel.hidden=!panel.hidden;filters.setAttribute('aria-expanded',String(!panel.hidden))};
      ${url.pathname === '/boundary' ? "fetch('/write',{method:'POST'}).catch(()=>{});" : ''}
      </script></body></html>`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`
  return {
    origin,
    requests,
    setVariant: (variant: 'healthy' | 'defective') => {
      defective = variant === 'defective'
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}
