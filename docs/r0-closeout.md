# R0 接手实现与验证边界

2026-10-07。用户明确授权计划/验收 Agent 接手 dev 已完成的大量工作，完成必要实现与收尾。此前只验收、不改产品的角色限制据此调整；未授权付费模型调用，没有向其他 Agent 派发任务。本记录是实施者的可复核验证材料，不能代替独立 C 能力验收。

## 交付身份

规划基线为 `0dced2a3e990ec7a22dd617232cc7d514599e557`，导入的 dev bundle 为 `c8f91e053819d124ea1ef7c552c2e8eeb3028667`。接手分支为 `codex/r0-closeout`，保留全部 dev 提交；没有重写 main、覆盖他人修改或修改 `docs/product-roadmap.md`。接手提交和最终源码/构建/证据 hash 由交付包 `delivery.json` 固定，避免文档自引用 SHA。

原首轮独立审查的 R01–R10、失败探针和原始包留在 `data/r0-independent-review/2026-10-07-c8f91e0/`。它们评价的是旧候选，不是本次实现。原 DNS 差异探针不能直接对新传输实现运行：新实现真正连接审核地址，应使用仓库中只连接本地服务的新反例。

## 支持范围与完整流程

启动时显式启用 `EXECUTION_URL_SCAN=1`（默认关闭），配置既有模型后打开工作台，选择“网址 UI 检查”，输入完整 HTTP(S) URL 和可选目标；高级配置只接受精确资源和数据 origin。正式 `POST /api/runs` 使用 `kind: "ui-scan"`，同一队列执行，事件、取消、历史及 JSON 报告仍走既有 API。

匿名上下文保留本轮网站自己设置的 Cookie，不导入用户会话。默认最多 3 个页面/路由、1 条导航边深度；完整路径、查询和 fragment 保留。同源资源及 GET 数据可用，跨源资源和数据授权独立。重定向逐跳审核，导航仍限入口 origin。公网标准端口与明确服务器配置的本地 fixture origin 可用；请求体不能创建本地例外。资源、接口和子页面不会自动扩权。

POST/GraphQL 查询、登录、提交/上传/下载、新窗口、子 frame、WebSocket、Service Worker 等不属于首版能力。页面依赖这些能力时返回拒绝/干预和未验证范围，不将被改变的页面当原站点缺陷。普通表单提交、下载和公开写入语义的控件在动作前拒绝，网络层另行限制写方法。两者不是“所有 GET 必然无副作用”的证明；无法从公开信息判断的操作应由 Agent 保留为未验证，不承诺恶意网站或伪装为读取的业务写入能被完全语义识别。

完成报告分别显示执行终态、范围完成度、发现与业务不适用。有证据的缺陷不阻止覆盖完成；只有执行回执或模型宣称完成不足以通过。用户看到“已检查范围内未发现问题”，不能据此推断全站无问题。

## 关键修复及证据入口

| 原问题 / 需求 | 本次实现 | 可复核检查 |
| --- | --- | --- |
| R01 / U05 请求分类 | CDP 枚举精确转换；资源授权不能放行 XHR/fetch，未知类型不扩大权限 | `network/closeout.test.ts` 实际服务命中计数；`network/session.test.ts` |
| R02 / U19 实际连接 | 每跳由 Node 在审核地址上建立连接，保留 Host/SNI 和 TLS 校验；Chromium 使用拒绝所有出站的本地代理，禁非代理 UDP/QUIC；无 `Fetch.continueRequest` 放行 | 本地真实 socket 的 Host/固定地址测试、worker/popup 零到达测试；地址分类单元测试 |
| R03/R04 / U08/U12 | 共享并发请求额度和流式接收/解码额度；超额、超时、取消、传输错误明确拒绝并提升干预记录，禁止空 200 替代 | 并发、chunked、持续流、资源缺失、干预证据及完成拒绝回归 |
| R05 / U11/U16 | `inspection-proof-2` 绑定完整 RunSpec 和 scope 投影；完成及历史读取核对持久事件、终态、目标版本与可读 artifacts | `completion-integrity.test.ts`、`run-report-ui.test.ts`，含丢历史、篡改、缺证据反例 |
| R06 / U04/U10/U17 | 选择记录绑定实际 DOM 节点；后置观察后才测量。`page_act.verify` 使用公开依据和有界 DOM 条件；调查程序须在最后动作后有测量断言。无条件或无法归属保持 unverified | `interaction-verification.test.ts`、`ui-executor.test.ts`、调查/证据既有回归 |
| R07 / U03/U04/U06 | 导航按实际边、含 query/hash 身份计数；每次 document 请求先预留范围；同文档导航在隔离世界的 Navigation API 监听中提前拒绝 | 真实脚本跳转零到达、hash/pushState 前置拒绝、导航深度及重定向测试 |
| R08 / U02/U09/U18 | 实际排序与遮挡的正常/异常 fixture；独立浏览器重放与服务日志；正常 modal 背景、inert/disabled 排除有真实 DOM 依据；每页采样义务 | `fixture.test.ts`、`scorer.test.ts`、modal 实测；免费正式工作台预检 |
| R09 / B5 | 实际 campaign runner 复用既有网关及费用账本，逐行启动服务、执行、下载证据、重放并独立读 SQLite；配置/价格/授权冻结；失败和 unknown 保留 | `url-scan-campaign.test.ts`，六行免费替身运行只标 B；没有执行 C |
| R10 / 交接 | 交付包携带报告引用的原始 artifact、可移植映射、每文件 hash、日志、源码 bundle；不以本机绝对路径代替文件 | 包内 `artifact-index.json`、`SHA256SUMS.json`、`delivery.json` |

新模块把实际网络读取、SPA 守卫、交互测量及历史证明核对从主执行器拆出；没有新增第二套浏览器 Agent 循环，也没有以全面重构为前置条件。生产代码不按 fixture 名称、case ID 或私有答案判断。

## 限制、兼容及回退

- 传输额度限制应用层流式接收、解码及交付缓冲；不能阻止远端已写入内核网络缓冲的字节。每跳最多 15 秒，500 请求、10 MiB 单响应、50 MiB 总额。大型/流式页面可能 partial，拒绝需进入报告。
- 同文档守卫使用当前 Chromium Navigation API。同步启动即改 URL 的 SPA 可能在状态同步前触发 `route-guard-not-ready`；此时记录干预和 partial。未知或不可取消的路由不会宣称完整检查。
- Node 传输与浏览器原生 TLS/HTTP 指纹不同，依赖特定 TLS 指纹、认证、复杂跨域机制的网站可能不能正常运行；不承诺任意网站覆盖。公网复杂 CDN/TLS 部署与真实模型自主调查不能由本地 fixture 证明。
- 本次接手不新增数据库 schema 迁移。已有任务判别字段/API/UI 来自 dev 分支；旧购物、导出、无 kind 历史继续原语义。新证明版本不会把旧 dev proof-1 升格为验证通过，原报告内容仍可读取。
- 保留串行队列、取消、未知写入不重放、证据归属与持久终态检查。关闭 `EXECUTION_URL_SCAN` 可停止新 UI 任务准入，保留历史查看及业务运行；代码回退须保留原数据库和 artifact，不改历史为 success。

## 验证层次及阶段出口

A 包括单元反例和真实 Chromium/socket 测试，B 使用固定模型服务运行实际 SDK、编译服务与工作台。两者证明边界和接线可执行；不证明真实模型能选择正确调查、发现未知问题或理解全部网站。六行替身 campaign 故意不教固定模型调查私有缺陷，其未检出行必须失败且保留，不能从“测试脚本通过”推导“能力矩阵通过”。

免费复验命令（Node 24；先完成构建；普通预检全部不调用真实模型）：

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm validate:url-scan -- --preflight
pnpm validate:business -- --preflight
pnpm validate:programs -- --preflight
pnpm validate:persistence
URL_SCAN_FREE_CAMPAIGN_TEST=1 pnpm exec vitest run scripts/validation/url-scan-campaign.test.ts
```

实际命令、退出码和对应结果见交付包；没有列入实际运行记录的检查不能算已运行。前期失败、修复后的结果分别保留，最后构建单独标识，不拼接不同版本形成通过率。

C 仍未授权、未执行。先审核固定构建/配置/样本/次数/通过条件；诊断是 5 样本各一次加 1 次干预对照，共 6 行；诊断成功后正式 UI 是 5 样本各 3 次，共 15 行。购物/导出仍按计划的原 45 轮正式回归门槛，不能被免费回归或 UI 15 行替代。健康必须实际通过，异常必须有独立复现的有效发现；全批失败/unknown 原样保留。R0 尚不能宣布完成或进入 R1。

## 付费运行前的可审阅材料

在干净候选提交上构建，提供 `URL_SCAN_PRICES_JSON`（既有固定主/视觉模型当前每 token 输入/输出价格，不可估造），使用 `--freeze --repetitions 1` 生成诊断清单，再用 `--dry-run --manifest <path> --batch <name>` 检查六行。正式使用 repetitions=3。执行时再次核对网关现价，价格变化必须重新冻结。

用户授权后才创建/使用 `URL_SCAN_APPROVAL_FILE` 指向的 JSON，字段为：

```json
{
  "manifestHash": "<reviewed manifest hash>",
  "batch": "<new batch name>",
  "mode": "diagnostic",
  "paid": true,
  "maxRuns": 6,
  "ceilingUsd": 2,
  "campaignDirectory": "<absolute shared ledger directory>",
  "smokeRequests": 1
}
```

这只是模板，不是当前授权。正式模式填写 formal/maxRuns=15，并附同构建、同配置成功 C 诊断的 `diagnosticDirectory`。每阶段最多一次 smoke 纳入同一费用账本；未知费用或达到上限停止。建议首轮诊断硬上限 2 美元，是否执行及后续正式/业务预算仍需用户决定，按现价和冻结预估调整。runner 即使通过也输出 `r0Accepted:false`，由验收者结合全部必需出口判定。

## 给 Roadmap 维护 Agent

建议同步“c8f91e0 首轮审查未通过后，接手修复网络连接、完成证明、真实交互与验收工具，已提供新的候选提交及免费验证证据”。请核对交付包实际提交、阶段出口、失败和限制后更新现状。不要把实施者自测写成独立 C 验收；仍停留 R0，下一步是复核候选并确认真实验收授权，不能自动进入 R1。本轮没有直接编辑 Roadmap。
