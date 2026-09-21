import 'dotenv/config'
import { spawn, type ChildProcess } from 'node:child_process'
const children:ChildProcess[]=[]
let stopping=false
function launch(args:string[]){const c=spawn('pnpm',args,{stdio:'inherit',env:process.env,detached:process.platform!=='win32'});children.push(c);c.on('error',e=>{console.error(e.message);stop(1)});return c}
function stop(code=0){if(stopping)return;stopping=true;for(const c of children)if(c.pid){try{process.platform==='win32'?c.kill('SIGTERM'):process.kill(-c.pid,'SIGTERM')}catch{}};setTimeout(()=>{for(const c of children)if(c.pid){try{process.platform==='win32'?c.kill('SIGKILL'):process.kill(-c.pid,'SIGKILL')}catch{}};process.exit(code)},1000)}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop())
const build=launch(['build:web'])
await new Promise<void>((resolve,reject)=>build.on('exit',code=>code===0?resolve():reject(new Error('Workbench build failed'))))
for(const args of [['exec','tsx','watch','src/server/index.ts'],['exec','vite','build','--config','src/web/vite.config.ts','--watch'],['--filter','arena','dev:api'],['--filter','arena','dev:ui']]) launch(args).on('exit',code=>stop(code??1))
