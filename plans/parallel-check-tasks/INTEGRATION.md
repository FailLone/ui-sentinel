# 并发弹窗产品整合交付（第二轮）

2026-10-10，分支 `codex/parallel-check-tasks`。实现提交 `e7139716ca9c902a84846f2a70ed9c1373870b6e`。完整合入弹窗冻结交付 `3225754fefec3d5d702b0f18d3e686f418dd9dce`（含 `d7c2681128ed189210b7dbdf6d8f12406bbda7d5`），合并提交 `973ac45`。第一轮 [DELIVERY.md](DELIVERY.md)、`evidence/`、`popup-compat/` 保留为历史证据；其中“生产动作/Jev 整合未完成”描述已由本轮取代。

## 已接通的产品路径

普通 `POST /api/runs` → 原父 Mastra Agent 的 `check_task_submit/status/wait/cancel` → 最多两个独立子执行 → 原 Jev 入口选择 → 原 executor 动作分派与新鲜度检查 → 实际点击打开弹窗 → 原 popup runtime/geometry → 原事件、截图、测量回执和报告 → 父报告聚合与工作台链接。

每个子执行用原 `runs/run_events/artifacts`，独立 Chromium、Context、页面、inspection item 和 action ID；父记录只引用真实子执行，不伪造父 action/item。没有另建事实或费用账本，没有裸 Playwright 点击旁路，没有嵌套委派。直接调用同一受限 executor，不进入顶层排队；顶层队列仍默认串行。

父任务同步预留子动作/模型/补充读取额度；主模型和父动作只用扣除预留后的余额。子调用消费一次即计入父总额，未用额度只释放一次。期限取父子较早者，网络请求/字节额度也共享。`reads` 指补充读取次数，不代表全部原 DOM 采集。子任务得到弹窗通过/缺陷不解除父任务原有必查项。

生产 Jev 使用原已批准账户、固定限额、quote 检查、原 reserve/dispatch/settle/unknown 流程。同一父执行持有一个账户独占会话，两个子请求共享该会话但保留各自原账本行；其他运行者仍不能抢占。任一未知费用触发原停止传播，迟到响应不能恢复结果。父关闭等待子工具收尾、费用结算和浏览器关闭，最后释放账户锁。未运行真实付费请求，也未读取或修改旧账户。

## 普通调用

部署启用 `EXECUTION_URL_SCAN=1`、`EXECUTION_PARALLEL_CHECK_TASKS=1`、`EXECUTION_POPUP_JEV=1`，使用既有主模型配置与既有批准的 `POPUP_JEV_ACCOUNT_DIRECTORY`、精确的 `POPUP_JEV_LIMIT_USD`、`POPUP_JEV_API_KEY`。未配置可用 Jev 时拒绝弹窗子任务，不会静默改用其他模型。以下示例不构成付费测试授权。

```http
POST /api/runs
Content-Type: application/json

{"kind":"ui-scan","entryUrl":"https://example.org/","goal":"检查弹窗是否超出视口；如适用，分别委派 320 和 640 像素视口检查。","popupCheck":{"mode":"popup-viewport"},"budget":{"totalTimeoutMs":60000,"maxActions":12,"maxModelCalls":20}}
```

父 Agent 的 `checkTasks` 上下文提供入口、期限、当前子状态和预留额度。模型工具输入示例（用当前上下文替换 URL、期限；第二次改 key 和 viewport）：

```json
{
  "version": 1,
  "key": "popup-narrow",
  "kind": "popup-viewport",
  "purpose": "检查窄视口的弹窗边界",
  "start": {"url": "https://example.org/", "viewport": {"width": 320, "height": 480}, "prerequisites": []},
  "publicFacts": [],
  "evidenceRefs": [],
  "permissions": {"session": "anonymous", "writes": "none", "actions": "local-ui"},
  "quota": {"actions": 2, "modelCalls": 3, "reads": 2},
  "deadlineAt": 1900000000000
}
```

弹窗任务不传固定 selector：入口由 Jev 从原执行器给出的真实候选里选择。仅允许同一匿名入口重新进入和原受保护本地 UI 动作；不支持登录状态克隆、前置动作重放或写入。原 `element-measurement` 路径仍需要 selector 和零动作/零模型配额。两个子任务为父执行生命周期总上限。

`GET /api/runs/<parent>/report` 的 `uiScan.checkTasks.tasks[].execution` 链接子原报告；`result.original` 保留原测量、原证据链接与指纹。普通 cancel API 会取消并等待孩子收尾。历史读取重新验证子完成记录、原回执、完整事件指纹、父封装摘要和所有权；损坏、过期或互换结果降为 unverified/unknown。重启不把未完成任务当成功，也不自动重发付费调用。

## 免费验证与边界

复现：支持的 Node 24/22、锁定依赖及已有 Chromium 环境执行：

```sh
node --import tsx scripts/validation/parallel-popup-product.ts
node --import tsx scripts/validation/parallel-check-tasks.ts
```

弹窗脚本编译真实服务，以普通 API 创建任务；主模型为本地脚本 HTTP 服务，Jev 固定响应只通过进程内安装，HTTP 输入没有注入入口。实际浏览器完成入口点击、弹窗和测量。覆盖通过/越界、错误入口结果/多面板歧义、单子失败、在途取消、父额度竞争与释放、重启报告、原回执损坏、父封装损坏、兄弟结果互换、默认关闭与顶层串行。原只读回归继续验证网络写入/私网拒绝和隔离。

费用测试只使用新建临时合成账户及假 transport：验证两请求真实重叠、账户锁排他、共同争用最后余额、未知费用停止兄弟请求、迟到响应无效、完全收尾后释放会话；不触及实际账户或密钥。

具体计数、时间窗口、命令与校验摘要见 [product-evidence/VERIFICATION.md](product-evidence/VERIFICATION.md) 和 [summary.json](product-evidence/summary.json)。本轮关闭生产连接缺口；真实主模型委派质量、真实 Jev 准确率和线上加速比仍未验证，固定响应的毫秒数仅证明并发路径。

未推送、未合并 main，未修改旧脏工作区、维护者主工作区、弹窗来源工作区或 Roadmap。交付全部留在当前隔离分支。
