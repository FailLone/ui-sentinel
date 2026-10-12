# 网址 UI 检查



工作台和 API 支持第二种任务模式：直接输入一个完整网址做**匿名、有界**的 UI 检查，不需要任何业务适配器。请求体用判别字段 `kind` 区分，两个模式共用同一个执行器、工具集、规则和调查程序——不是第二套浏览器循环，也没有为凑模式而存在的空购物适配器。

```sh
curl -X POST http://localhost:4111/api/runs -H 'content-type: application/json' -d '{
  "kind": "ui-scan",
  "entryUrl": "https://example.org/catalog?category=books&sort=price#items",
  "goal": "检查目录浏览和筛选是否正常",
  "scope": { "maxPages": 3, "maxDepth": 1 },
  "access": { "resourceOrigins": ["https://cdn.example.org"], "dataOrigins": [] }
}'
```

202 返回 `runId/status/kind/contractHash/eventsUrl/reportUrl`。`goal` 可省略，省略时使用中性默认目标；`scope` 与预算只能收窄（`maxPages` 1–3，`maxDepth` 0–1）；`access` 只接受**精确** origin，不接受通配符或域名后缀。UI 请求不接受 `businessProfile`/`environmentId`，混入这些字段返回 400，不创建半个任务。

**入口地址**按原样执行：path、query 顺序、重复参数和 fragment 都是身份，不做规范化改写。只接受绝对 HTTP(S)；拒绝 userinfo、非法百分号转义、非标准 scheme，以及服务自身的控制面路径（`/__control`、`/evaluation` 等）。

**访问边界**是逐跳、派发前判定的。顶层导航限同一 origin、`maxPages`/`maxDepth` 内；脚本/CSS/字体等资源只允许同源或契约声明的 `resourceOrigins`；fetch/XHR 只允许同源或 `dataOrigins`，且仅 GET/HEAD。资源的许可**不**等于 API 的许可，`fetch('/delete')` 不会因为 host 获准而放行。首版明确不支持并如实报告：POST/PUT/PATCH/DELETE 与表单提交、登录态、GraphQL POST、文件上传/下载、新窗口、WebSocket、Service Worker。方法或按钮文字都不构成副作用语义——按钮叫「查询」但提交 POST 一样被拒。

私网、loopback、link-local 和云元数据地址在**入队前**拒绝。本机开发与 fixture 只能由**服务器配置**的精确 origin 放行（`URL_SCAN_TRUSTED_ORIGINS`），UI/API 无权自行添加本地例外；控制服务与评估端口即使同机也不在放行范围。

**结束语义**采用v2同item的通用检查与独立必需效果两维，来源未封闭或明确效果未验证仍未完成；来源封闭且无独立规格时，通用完整可以结束但功能语义仍未知。完成不代表全部功能正确。检查账本决定结束，不由模型自述决定。空规则队列、工具调用成功、模型说「完成」都不足以让任务变成 `completed`。`scope-covered` 需要：契约 hash 有效、入口确实导航并产出可读证据、每页已选局部交互有完整通用回执，所有已登记必需效果有有效测量结论、导航有落地观察、适用的自动规则已执行、所选条目有同 run 同目标的证据、无在途调查或已选未验证条目、所有拒绝与不支持维度已记录。发现的缺陷**不影响**完成——`failed` 是一次完成了的测量。不满足时返回 `finish:rejected` 与 `missingFacts/itemIds/reasonCodes`，并给出可用的 partial 结束建议。已选但未验证的事项必须保留为 `partial`，不能被「清空探索分支」抹掉。

`businessResult` 对 UI 运行恒为 `not-applicable`——不是 `unknown`，也不是 `success`。报告分列执行状态、检查范围（`covered`/`partial`/`not-started`）、发现、依据/证据/未验证原因与全部执行器干预；无发现时文案是「在已验证范围内未发现问题」，不代表整站合格。一次真实的网络拦截会置位运行级证据完整性，之后的状态不能用来证明原站点 pass/fail。

网址模式默认关闭，需显式 `EXECUTION_URL_SCAN=1`。可用验证入口（不调用付费模型）：

```sh
pnpm validate:url-scan -- --preflight            # 全部样本
pnpm validate:url-scan -- --preflight --sample healthy-catalog
```

该预检主动清空所有真实凭据、把模型指向本地固定服务，驱动**编译后的**服务、真实 Chromium 和正式 HTTP/工作台接口，证据写入 `data/r0-url-scan/<timestamp>/`。它证明接线可执行，**不**证明模型能自主发现问题。


## 使用步骤与下一步

按[配置指南](configuration.md)启动后，在工作台选择“网址 UI 检查”，输入完整 URL 和可选目标。报告分别展示执行状态、覆盖、发现和未验证原因；不要将 partial 解读为健康。

需要依据一份资料验证具体效果时，阅读[产品资料指南](product-sources.md)。程序优先探索及其边界见[架构](architecture.md#程序优先探索)；已知限制见[问题清单](known-issues.md)。
