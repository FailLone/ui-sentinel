# 弹窗检查

当前实现已合入 main；以下为 v2 支持范围和调用方式。

## 启动与调用

使用 Node 24 和锁定依赖。当前实现提供普通工作台、API 和原执行器接线，默认关闭新能力。所有真实模型调用仍需操作者为当前用途配置已批准账户；下面只是配置方式，不是创建账户或付费授权。

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

`report.uiScan.popupCheck` 是子任务结论，`report.uiScan.inspection.coverage` 是整任务覆盖。两者独立：已测弹窗可能通过，但剩余默认控件、用户必查或未闭合要求仍使整任务为 partial。本轮四个免费场景的主 Agent 被固定为如实收尾，因此全部为 blocked/partial，这是保存原覆盖义务的结果。

# 支持范围

- 最多 8 个当前合法入口、3 个动作、6 次 Jev 决策、4 次补充读取；这些限额进一步受原 run 预算、权限、取消和收尾预留限制。入口探索不要求预先知道结果关系；UI 只绑定实际观察与节点，不再要求按钮归因。最多检查 2 个可见浮层，余下浮层保留未检查缺口。
- 原生 dialog/popover、明确 dialog 角色、自定义 fixed 且不透明并有边框或阴影的面板；包括两步嵌套入口。普通 div 不自动适用。已存在、异步出现、与最近按钮无关的可见适用浮层，都可以独立测 UI；多个浮层分别出结论。类型不明、绘制不支持或预算不够时保留 unknown。
- 测量稳定固定面板的外框是否落在布局视口及真正生效的矩形 paint containment 内，容差 1 CSS px。普通祖先 overflow 不裁切脱离该祖先的 fixed 面板；正常内部滚动不会被当作越界。
- 非 fixed 且可能经页面滚动到达、变换/缩放/旋转、动画、复杂绘制、跨 frame、shadow DOM、非矩形裁切、滤镜、新窗口、身份不稳定，以及原观察版本机制不能复用的动态/大页面为 unknown/交接。继承的保守版本检查目前还会拒绝包含图片、SVG、列表或部分原生输入等未跟踪表面的页面，不能宣传为任意网站支持。
- 不判断所有内容可读性、遮挡顺序、键盘可达性、全站所有弹窗或业务效果；“未发现弹窗”不是通过。固定替身验证不证明真实 Jev 的语义准确率。

# 决策、执行和证据契约

新请求冻结 `popup-viewport-2`，UI 规则为 `popup-visible-viewport-2`。`popup-semantic-2` 现在仅用于 ENTRY 探索：问哪个合法控件值得尝试，保留实际候选及语义无匹配 `none`；`popup-purpose-policy-2` 的唯一胜出且概率过半采纳规则不变。此边界未校准，不代表准确率。新路径不发送 TARGET，不再请模型证明内部因果。

| 目标 | 合法输入与适用条件 | 结论与缺口 |
| --- | --- | --- |
| UI 浮层几何 | 实际可见浮层；原节点、观察、截图、两次稳定几何及支持范围成立 | 每层 pass/fail；不支持或未检查为 unknown；不据此完成按钮功能 |
| 功能后置条件 | 原目标或页面公开声明在点击前明确指定按钮与浮层；有效前态、实际原动作、原 generic 操作后有界观察 | 指定预期在观察内出现可 verified；已有结果、错误/无关浮层、身份替换、歧义或未观察到均未验证 |

功能声明复用原 generic/effects 和源冻结流程，不新建检查库，也不增加点击或观察。当前支持明确有限句式：`After clicking "Details", show popup "Details overview".` / `点击「Details」后，应显示浮窗「Details overview」。`；浮层按完整 aria-label（如有）或规范化完整文本精确匹配。只有声明 `show any popup` / `应显示任意浮窗` 才允许任意浮层满足功能；多个命名匹配保留歧义。只有按钮名或“检查弹窗是否超出视口”不构成功能规范。操作后使用既有即时与约 1 秒样本，未出现是有界观察不足，不作超时业务失败或内部因果断言。

ENTRY 保存原 `popup-question` / `popup-suggestion` 和全部模型分布。UI 保存独立 `popup-ui-measurement` / `popup-ui-summary`，actionId/itemId 均为 null；可选 reproduction 仅记录复现探索。每份含真实节点、观察绑定、两次稳定样本、同一观察截图、契约摘要和 owned evidence SHA256，历史读取重算几何与全部浮层汇总。功能保存原 item/effect 下的 `popup-effect-observation-1`，引用已有 generic 前后观察及原动作，历史读取重算明确预期。任何证据损坏都撤销相关确认；UI finding 只声称可见浮层被裁切。

旧 `popup-viewport-1` 执行兼容、旧归因收据、旧候选观察与历史报告按原规则读取，旧 TARGET 失败和 paid P02 unknown 不改写。新结论是明确的新契约，不能称为旧评分通过。旧真实证据见[封存报告](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/parallel-check-tasks/p02-semantic-real-result-20261010/REPORT.md)，本轮免费证明见[独立目标契约报告](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/parallel-check-tasks/observable-contract-20261010/REPORT.md)。

主 Agent 获得 `popupTask`，含目标、观察绑定、入口/浮层 ID、既有动作、证据、缺口、失败尝试和消耗；可调用同一 `popup_check` 工具的 continue 或 refresh。相同有效交接事实复用；确需新读取或节点状态变化时允许再次观察/决策。测完后保留历史结论，不把它重新宣称为当前页面状态。

并发委派接线见[并发检查](parallel-checks.md)，其他功能应复用原执行器和子执行边界。

# 免费验证

```sh
node --import tsx scripts/popup-ui-contract/validate.ts
node node_modules/vitest/vitest.mjs run \
  src/execution/popup src/agent/popup src/shared/popup-policy.test.ts \
  src/inspection/popup-artifacts.test.ts src/inspection/popup-ui-artifacts.test.ts \
  src/inspection/popup-effect.test.ts \
  src/inspection/contract.test.ts src/inspection/check-contract.test.ts \
  src/web/ui-scan-request.test.ts \
  src/web/ui-scan-report.test.ts src/server/routes/health.test.ts \
  src/server/routes/ui-scan-runs.test.ts src/execution/inspection-host.test.ts \
  src/agent/exploration/integration/product-jev.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

集成启动正常 Hono 服务、工作台和真实 Chromium，只在进程内注入固定 Jev、以本地固定服务替代主模型。其环境单独构造，模型地址均为本机，真实费用为零。重启读取及回执损坏测试包含在脚本内；不重跑 R0/R1 全矩阵。
