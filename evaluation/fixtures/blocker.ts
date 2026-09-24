// Private fixture profiles never appear in the public document or business API.
import { createServer, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
export type BlockerProfile = 'J0' | 'J1'
export function isBlockerProfile(value: string): value is BlockerProfile {
  return value === 'J0' || value === 'J1'
}
function html(dismissible: boolean) {
  const recovery = dismissible ? '<button id="retain">Keep my original selection</button>' : ''
  return `<!doctype html><html><head><title>Community studio</title><style>
*{box-sizing:border-box}body{font:18px system-ui;margin:0;color:#302b40;background:#f0eff5}header{background:#342354;color:white;padding:24px 42px}main{display:grid;grid-template-columns:1fr 260px;gap:35px;margin:48px auto;max-width:980px}section,aside{padding:24px;background:white;border:1px solid #b8afc9}button{font:inherit;color:white;background:#60438c;border:0;border-radius:6px;padding:16px 24px;cursor:pointer}button:disabled{background:#aaa}.sheet{position:fixed;inset:0;background:rgba(30,20,45,.8);z-index:90;display:flex;align-items:flex-end;justify-content:center}.message{background:#fff;padding:32px;width:640px;margin-bottom:30px}</style></head><body>
<header><h1>Community studio bookings</h1></header><main><section id="stage"><h2>Selected session</h2><p>Weekend printmaking — one seat, $35.</p><button id="review">Review selection</button></section><aside><h2>Booking guide</h2><p>Review your seat before submitting. Only one reservation is needed.</p></aside></main>
<script>
document.getElementById('review').onclick=()=>{
 document.getElementById('stage').innerHTML='<h2>Confirm your seat</h2><p>Weekend printmaking · one seat · $35</p><button id="confirm">Complete reservation</button>';
 const sheet=document.createElement('div');sheet.className='sheet';sheet.innerHTML='<div class="message"><h2>A studio announcement</h2><p>Explore the membership offer for future sessions.</p>${recovery}</div>';document.body.append(sheet);
 const retain=document.getElementById('retain');if(retain)retain.onclick=()=>sheet.remove();
 document.getElementById('confirm').onclick=async function(){this.disabled=true;const r=await fetch('/api/reservation',{method:'POST'});const d=await r.json();document.getElementById('stage').innerHTML='<h2>Booking confirmed</h2><p>'+d.message+'</p><p>'+d.orderId+'</p>';};
};
</script></body></html>`
}
export async function createBlockerHoldout(options: {
  port: number
  controlPort: number
  token: string
}) {
  let profile: BlockerProfile = 'J0'
  let orders: { id: string; status: string }[] = []
  const json = (res: ServerResponse, code: number, value: unknown) => {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(value))
  }
  const publicServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
      res.end(html(profile === 'J1'))
      return
    }
    if (req.method === 'POST' && req.url === '/api/reservation') {
      const order = { id: `booking-${randomUUID()}`, status: 'paid' }
      orders.push(order)
      json(res, 200, {
        success: true,
        status: 'paid',
        orderId: order.id,
        canRetry: false,
        message: 'Your studio booking is confirmed.',
      })
      return
    }
    json(res, 404, { error: 'Not found' })
  })
  const controlServer = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${options.token}`) {
      json(res, 401, { error: 'Unauthorized' })
      return
    }
    if (req.method === 'GET' && req.url === '/__control/state') {
      json(res, 200, { profile, orders, orderCount: orders.length })
      return
    }
    if (req.method === 'POST' && req.url === '/__control/reset') {
      let raw = ''
      for await (const chunk of req) raw += String(chunk)
      const body = JSON.parse(raw)
      if (!isBlockerProfile(body.profile)) {
        json(res, 400, { error: 'Invalid profile' })
        return
      }
      profile = body.profile
      orders = []
      json(res, 200, { ok: true })
      return
    }
    json(res, 404, { error: 'Not found' })
  })
  const listen = (server: Server, port: number) =>
    new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
  await listen(publicServer, options.port)
  try {
    await listen(controlServer, options.controlPort)
  } catch (error) {
    publicServer.close()
    throw error
  }
  return {
    url: `http://127.0.0.1:${(publicServer.address() as { port: number }).port}`,
    controlUrl: `http://127.0.0.1:${(controlServer.address() as { port: number }).port}`,
    async close() {
      publicServer.closeAllConnections()
      controlServer.closeAllConnections()
      await Promise.all(
        [publicServer, controlServer].map(
          (server) => new Promise<void>((r) => server.close(() => r())),
        ),
      )
    },
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.ARENA_CONTROL_TOKEN) throw Error('Private controller token required')
  const arena = await createBlockerHoldout({
    port: Number(process.env.ARENA_PORT),
    controlPort: Number(process.env.ARENA_CONTROL_PORT),
    token: process.env.ARENA_CONTROL_TOKEN,
  })
  const close = async () => {
    await arena.close()
    process.exit(0)
  }
  process.once('SIGTERM', close)
  process.once('SIGINT', close)
  console.log('Studio environment ready')
}
