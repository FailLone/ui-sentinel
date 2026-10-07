import { createServer } from 'node:http'

/** Only the harness owns the variant. Public pages expose behaviour, never labels or controls. */
export async function startUrlScanFixture() {
  let defective = false
  const requests: { method: string; path: string }[] = []
  const rows = [
    { name: 'Blue widget', price: 20 },
    { name: 'Amber gadget', price: 5 },
    { name: 'Cyan sprocket', price: 12 },
  ]
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://fixture.invalid')
    requests.push({ method: request.method ?? 'GET', path: url.pathname + url.search })
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
    response.end(`<!doctype html><html><head><title>Product catalog</title><style>body{font:16px sans-serif;padding:30px}button,select{padding:12px;margin:8px}#filter-wrap{position:relative;display:inline-block}.screen{position:absolute;inset:0;z-index:2}</style></head><body>
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
