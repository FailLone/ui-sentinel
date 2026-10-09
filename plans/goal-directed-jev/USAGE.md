# 启动与调用

使用 Node 24 和锁定依赖。当前分支提供普通工作台、API 和原执行器接线，默认关闭新能力。所有真实模型调用仍需操作者为当前用途配置已批准账户；下面只是配置方式，不是创建账户或付费授权。

```sh
pnpm install --frozen-lockfile
pnpm build
# 原有 AGENT_MODEL 和其供应商配置照常提供；不把密钥写入请求正文。
EXECUTION_URL_SCAN=1 EXECUTION_POPUP_JEV=1 \
POPUP_JEV_ACCOUNT_DIRECTORY=/absolute/path/to/approved-account \
POPUP_JEV_LIMIT_USD=1 \
pnpm start
```

`POPUP_JEV_API_KEY` 从部署的私有环境提供。目录必须已经含 `campaign.db` 与 `campaign-id.json`，且其批准限额须与 `POPUP_JEV_LIMIT_USD` 精确一致；启动不会创建或解封账户。旧 unknown/stop 账户拒绝继续。Jev 传输先查公开报价、预留每请求 USD0.003、扣原 run 调用预算，再读取密钥并发送一次请求；未知费用保留预留并停止该账户，取消后不重试。所示 USD1 是部署示例，不能复用旧研究账户或视为本次消费批准。主 Agent 的模型供应商及费用配置沿用产品原配置。

打开工作台选择“网址 UI 检查”，勾选“目标驱动：检查弹窗是否超出视口”，只填网址即可。可选目标提供关注背景；不需要提供按钮、CSS、结果选择器或预期答案。该选项与 R1 通用程序探索互斥。

完整 API 例子（公共目标域名请替换；本地夹具必须由服务器 `URL_SCAN_TRUSTED_ORIGINS` 明确列入，不能在请求中自行放宽）：

```sh
curl -X POST http://localhost:4111/api/runs \
  -H 'Content-Type: application/json' \
  --data '{
    "kind":"ui-scan",
    "entryUrl":"https://example.org/catalog",
    "popupCheck":{"mode":"popup-viewport"},
    "goal":"检查弹窗是否超出视口",
    "scope":{"maxPages":1,"maxDepth":0},
    "budget":{"maxActions":6,"maxModelCalls":12,"totalTimeoutMs":120000},
    "viewport":{"width":1280,"height":768}
  }'
# 返回 runId 后读取状态与持久报告：
curl http://localhost:4111/api/runs/RUN_ID
curl http://localhost:4111/api/runs/RUN_ID/report
```

`report.uiScan.popupCheck` 是子任务结论，`report.uiScan.inspection.coverage` 是整任务覆盖。两者独立：已测弹窗可能通过，但剩余默认控件、用户必查或未闭合要求仍使整任务为 partial。免费夹具里的主 Agent 被固定为如实收尾，因此九行全部为 blocked/partial，这是保存原覆盖义务的结果。

# 支持范围

- 最多 8 个当前合法入口、3 个动作、6 次 Jev 决策、4 次补充读取；这些限额进一步受原 run 预算、权限、取消和收尾预留限制。首次探索可在未知结果关系时进行；实际动作回执形成后才绑定弹窗，不重复点击获取关系。
- 原生 dialog/popover、明确 dialog 角色、自定义 fixed 面板；包括两步嵌套入口。显式唯一实际 dialog 优先直接绑定，自定义浮层从实际观察到的有限候选中作语义选择，再测原节点。
- 测量稳定固定面板的外框是否落在布局视口及真正生效的矩形 paint containment 内，容差 1 CSS px。普通祖先 overflow 不裁切脱离该祖先的 fixed 面板；正常内部滚动不会被当作越界。
- 非 fixed 且可能经页面滚动到达、变换/缩放/旋转、动画、复杂绘制、跨 frame、shadow DOM、非矩形裁切、滤镜、新窗口、身份不稳定，以及原观察版本机制不能复用的动态/大页面为 unknown/交接。继承的保守版本检查目前还会拒绝包含图片、SVG、列表或部分原生输入等未跟踪表面的页面，不能宣传为任意网站支持。
- 不判断所有内容可读性、遮挡顺序、键盘可达性、全站所有弹窗或业务效果；“未发现弹窗”不是通过。固定替身验证不证明真实 Jev 的语义准确率。

# 决策、执行和证据契约

`src/agent/popup/contract.ts` 的三个阶段分别是 entry、target、recovery。请求包含目标、当前绑定、有限候选 ID 与公开描述、已操作记录、证据引用和缺失事实。回答只能选实际候选、read 或 handoff；置信度低于 0.65、身份/分布不合法或状态过期时不派发。

决策保存为 `popup-question` / `popup-suggestion`；实际动作仍产生原 `action:*`、item 和通用检查。`popup-measurement` 包含原 task/action/item、前后事实、真实节点 ID、两次稳定样本、目标时点截图、契约摘要及所有引用文件的 SHA256。历史读取重新计算几何结论、核对原动作顺序、文件所有权/完整性和字节摘要，损坏即取消子任务通过。

主 Agent 获得 `popupTask`，含目标、观察绑定、入口/浮层 ID、既有动作、证据、缺口、失败尝试和消耗；可调用同一 `popup_check` 工具的 continue 或 refresh。相同有效交接事实复用；确需新读取或节点状态变化时允许再次观察/决策。测完后保留历史结论，不把它重新宣称为当前页面状态。

模块所有权与并发适配入口见 [PROGRESS](PROGRESS.md)。合入时先合本分支的新模块与契约，再处理 `executor.ts` 的集中适配块及 routes/config/UI/report 小接点；其他任务分支不应复制子任务循环。

# 免费验证

```sh
node --import tsx scripts/popup-product/validate.ts
node node_modules/vitest/vitest.mjs run \
  src/execution/popup src/agent/popup src/shared/popup-policy.test.ts \
  src/inspection/popup-artifacts.test.ts \
  src/inspection/contract.test.ts src/inspection/check-contract.test.ts \
  src/web/ui-scan-request.test.ts \
  src/web/ui-scan-report.test.ts src/server/routes/health.test.ts \
  src/server/routes/ui-scan-runs.test.ts src/execution/inspection-host.test.ts \
  src/agent/exploration/integration/product-jev.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

集成启动正常 Hono 服务、工作台和真实 Chromium，只在进程内注入固定 Jev、以本地固定服务替代主模型。其环境单独构造，模型地址均为本机，真实费用为零。重启读取及回执损坏测试包含在脚本内；不重跑 R0/R1 全矩阵。
