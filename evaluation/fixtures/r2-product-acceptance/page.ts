/** One small reusable page family. Operator chooses implementation before serving; no HTTP switch. */
export type Variant = 'healthy' | 'defect' | 'unavailable'
export function documentFor(variant: Variant) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>轻阅目录</title><style>
  body{max-width:720px;margin:48px auto;padding:24px;font:18px/1.6 system-ui;color:#203047;background:#f7fafc}main{padding:28px;background:white;border:1px solid #ccd6e0;border-radius:12px}button{font:inherit;padding:10px 20px;margin:12px 12px 12px 0}section{margin:20px 0}h1{font-size:28px}
  </style></head><body><main><h1>轻阅目录</h1><p>无需登录，先看看目录内容。</p>
  <section aria-label="目录可用状态"><h2>目录可用状态</h2><p id="availability">${variant === 'unavailable' ? '暂不可用' : '可用'}</p></section>
  <button id="preview" type="button" ${variant === 'unavailable' ? 'disabled' : ''}>预览目录</button>
  <section aria-label="预览状态"><h2>预览状态</h2><p id="preview-state" role="status">尚未预览</p></section>
  <section aria-label="详情状态"><h2>详情状态</h2><p id="details-state" role="status">尚未查看</p></section>
  <div id="next"></div><script>
  document.querySelector('#preview').addEventListener('click',()=>{
    document.querySelector('#preview-state').textContent='预览就绪';
    if(document.querySelector('#next button'))return;
    const button=document.createElement('button');button.type='button';button.textContent='查看详情';
    button.addEventListener('click',()=>{document.querySelector('#details-state').textContent='${variant === 'defect' ? '详情未能展示' : '详情已就绪'}'});
    document.querySelector('#next').append(button);
  });</script></main></body></html>`
}
