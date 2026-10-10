/** Public pages only. Ground truth lives separately in score.ts. No answer labels in URLs. */
export const rows = [
  { id: 'P01', path: '/p/one' },
  { id: 'P02', path: '/p/two' },
  { id: 'P03', path: '/p/three' },
] as const
export const publicGoal =
  '检查弹窗是否超出视口。请通过可用委派工具安排两个独立 popup-viewport 子检查，视口分别为 320×480 和 640×480，同一入口、匿名会话、仅本地 UI 动作。每子最多 3 次动作、3 次 Jev 调用、2 次补充读取，期限不得超过父任务。依据页面公开事实选择操作；无法确认时保留未验证原因。保留父扫描默认必查义务，分别报告子检查结论和父扫描未完成范围。'
export function documentFor(path: string) {
  const shell = `<style>button{margin:8px} [hidden]{display:none!important} dialog,.panel{position:fixed;left:20px;top:120px;margin:0;box-sizing:border-box;width:400px;height:150px;max-width:none;border:2px solid;background:white;padding:16px}</style><h1>Workspace</h1><button onclick="this.textContent='Sorted'">Sort alphabetically</button><button onclick="this.textContent='Compact'">Change density</button>`
  const bodies: Record<string, string> = {
    '/p/one': `<button onclick="document.querySelector('dialog').showModal()">Details</button><dialog>Details overview</dialog>`,
    '/p/two': `<button onclick="document.getElementById('nested').hidden=false">More options</button><div id="nested" hidden><button onclick="document.getElementById('panel').hidden=false">Details</button></div><div class="panel" id="panel" hidden>Details overview</div>`,
    '/p/three': `<button onclick="document.querySelector('output').textContent='Details unavailable'">Details</button><output></output>`,
  }
  if (!(path in bodies)) return undefined
  return `<!doctype html><html><head><title>Workspace</title></head><body>${shell}${bodies[path]}</body></html>`
}
