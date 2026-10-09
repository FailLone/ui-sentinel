// Independent reservation UI for transfer evaluation. Profiles never enter public HTML/JSON.
import { createServer, type ServerResponse, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export type HoldoutProfile = 'H0' | 'H1' | 'H2'
const profiles = new Set<string>(['H0', 'H1', 'H2'])
export function isHoldoutProfile(value: string): value is HoldoutProfile {
  return profiles.has(value)
}
const html = `<!doctype html><html><head><title>Workshop reservations</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f2ed;color:#20342f;font:18px system-ui}header{padding:24px 40px;background:#163c31;color:white}main{display:grid;grid-template-columns:300px 1fr;gap:32px;max-width:1120px;margin:32px auto;padding:0 24px}aside,section{padding:28px;border:1px solid #cbd7cd;background:white;border-radius:12px}h1{font-size:28px;margin:0}h2{font-size:24px}button{font:inherit;padding:14px 22px;margin:14px 0;border:0;border-radius:8px;background:#21624a;color:white;cursor:pointer}button:disabled{background:#8b9690;cursor:default}button.secondary{background:#e1e8e1;color:#20342f}label{display:block;padding:16px 0}input{width:22px;height:22px;vertical-align:middle;margin-right:12px}.actions{display:flex;justify-content:flex-end;gap:14px}.message{padding:18px;background:#edf3ec;border-radius:8px}.meta{font-size:14px;overflow-wrap:anywhere}footer{max-width:1120px;margin:auto;padding:0 24px;color:#506157}</style></head>
<body><header><h1>Riverside workshops</h1></header><main><aside><h2>Your session</h2><p>Evening ceramics</p><p>One place · $40</p><p>Reservation includes materials.</p></aside><section id="workspace"></section></main><footer>Review the attendance policy before confirming your place.</footer>
<script>
const root=document.getElementById('workspace');let accepted=false;let poll;
function home(){clearInterval(poll);accepted=false;root.innerHTML='<h2>Available sessions</h2><p>Join the evening ceramics workshop.</p><div class="actions"><button id="select">Choose a place</button></div>';document.getElementById('select').onclick=details}
function details(){root.innerHTML='<h2>Attendance details</h2><p>Accept the policy to continue. No payment is submitted on this step.</p><label><input type="checkbox" id="terms">I accept the attendance policy</label><div class="actions"><button class="secondary" id="back">Choose another session</button><button id="review" disabled>Review reservation</button></div>';document.getElementById('terms').onchange=e=>{accepted=e.target.checked;document.getElementById('review').disabled=!accepted};document.getElementById('review').onclick=review;document.getElementById('back').onclick=home}
function review(){root.innerHTML='<h2>Review your place</h2><p>Evening ceramics · One place · Total $40</p><p>Attendance policy accepted.</p><div class="actions"><button class="secondary" id="edit">Edit attendance details</button><button id="confirm">Confirm reservation</button></div>';document.getElementById('edit').onclick=details;document.getElementById('confirm').onclick=reserve}
async function reserve(){const button=document.querySelector('#confirm,#resume');button.disabled=true;button.textContent='Submitting reservation…';const response=await fetch('/api/reservations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:'evening-ceramics',accepted})});const data=await response.json();root.innerHTML='<h2>'+ (data.success?'Place reserved':'Reservation unsuccessful')+'</h2><p class="message" id="message"></p><p class="meta" id="reference"></p><div class="actions">'+(data.canRetry?'<button id="resume" disabled>Resume reservation</button>':'')+'<button class="secondary" id="return">Return to sessions</button></div>';document.getElementById('message').textContent=data.message;document.getElementById('reference').textContent='Reference: '+data.orderId;document.getElementById('return').onclick=home;if(data.canRetry){document.getElementById('resume').onclick=reserve;let tries=0;poll=setInterval(async()=>{const r=await fetch('/api/recovery');const state=await r.json();const b=document.getElementById('resume');if(b&&state.ready){b.disabled=false;clearInterval(poll)}if(++tries>=30)clearInterval(poll)},250)}}
home();
</script></body></html>`

export async function createHoldoutArena(options: {
  port: number
  controlPort: number
  token: string
}) {
  let profile: HoldoutProfile = 'H0'
  let orders: { id: string; status: string; createdAt: number }[] = []
  const json = (res: ServerResponse, status: number, value: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(value))
  }
  const publicServer = createServer(async (req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname
    if (req.method === 'GET' && path === '/') {
      res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' })
      res.end(html)
      return
    }
    if (req.method === 'GET' && path === '/api/recovery') {
      json(res, 200, {
        ready: profile === 'H1' && !!orders.length && Date.now() - orders.at(-1)!.createdAt >= 300,
      })
      return
    }
    if (req.method === 'POST' && path === '/api/reservations') {
      let raw = ''
      for await (const chunk of req) raw += String(chunk)
      let input: any
      try {
        input = JSON.parse(raw)
      } catch {
        json(res, 400, { error: 'Invalid reservation' })
        return
      }
      if (input.accepted !== true || input.session !== 'evening-ceramics') {
        json(res, 400, { error: 'Attendance policy must be accepted' })
        return
      }
      const success = profile === 'H0',
        status = success ? 'paid' : 'failed'
      const order = { id: `reservation-${randomUUID()}`, status, createdAt: Date.now() }
      orders.push(order)
      json(res, success ? 200 : 402, {
        success,
        status,
        orderId: order.id,
        canRetry: !success,
        message: success
          ? 'Your workshop place is confirmed.'
          : 'The reservation could not be completed. You may make another attempt.',
      })
      return
    }
    json(res, 404, { error: 'Not found' })
  })
  const controlServer = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${options.token}`) {
      json(res, 401, { error: 'unauthorized' })
      return
    }
    if (req.method === 'POST' && req.url === '/__control/reset') {
      let raw = ''
      for await (const chunk of req) raw += String(chunk)
      let input: any
      try {
        input = JSON.parse(raw)
      } catch {
        json(res, 400, { error: 'invalid profile' })
        return
      }
      if (!profiles.has(input.profile)) {
        json(res, 400, { error: 'invalid profile' })
        return
      }
      profile = input.profile
      orders = []
      json(res, 200, { ok: true })
      return
    }
    if (req.method === 'GET' && req.url === '/__control/state') {
      json(res, 200, { profile, orders, orderCount: orders.length })
      return
    }
    json(res, 404, { error: 'not found' })
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
    await new Promise<void>((resolve) => publicServer.close(() => resolve()))
    throw error
  }
  return {
    url: `http://127.0.0.1:${(publicServer.address() as AddressInfo).port}`,
    controlUrl: `http://127.0.0.1:${(controlServer.address() as AddressInfo).port}`,
    async close() {
      publicServer.closeAllConnections()
      controlServer.closeAllConnections()
      await Promise.all([
        new Promise<void>((r) => publicServer.close(() => r())),
        new Promise<void>((r) => controlServer.close(() => r())),
      ])
    },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.ARENA_CONTROL_TOKEN) throw Error('Private controller token required')
  const arena = await createHoldoutArena({
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
  console.log('Reservation environment ready')
}
