# R0：网址扫描与独立 UI 检查闭环实施及验收计划

日期：2026-10-06；2026-10-07 修订。状态：开发接手整改，未完成真实模型验收。计划版本：2。

本计划面向 dev Agent 和独立验收 Agent。原规划正文中的新增字段、模块、命令是**设计要求**，不能直接当作已实现证据；实际交付以接手记录和对应构建为准。Roadmap 的阶段状态由维护 Agent 更新；本计划不授权付费模型验收，不派发其他 Agent。实现授权变更见下节。

## 2026-10-07 接手修订

用户在审阅 c8f91e0 首轮退回结果后，明确授权原计划/验收 Agent 接手实现与收尾。本次授权覆盖产品修复；此前“不代替 dev 实现”的角色限制据此调整。付费调用、R0 完成判定及 Roadmap 维护边界不变；没有派发其他 Agent。

实现保留 c8f91e0 的共享执行器/API/工作台骨架，在 `codex/r0-closeout` 分支整改。选择 CDP 逐跳暂停 + Node 固定已审核地址的有界读取 + 浏览器拒绝出站代理，替代仅检查 DNS 后继续浏览器请求。正常响应保持 Host/SNI、Cookie、状态和响应头，重定向仍由下一跳独立授权；压缩响应也进行有界解码。限额指应用层接收/解码/交付的受限缓冲，不宣称能阻止远端已经进入网络缓冲的额外字节。

完成证明升级为 inspection-proof-2，绑定完整 spec 和持久范围投影，并核对终态及可读 artifacts。旧业务语义不变；开发候选的 proof-1 报告仍可展示原文，但不能冒称已经通过新版完成核验。动作必须关联实际 DOM 节点，并由后置测量或已有调查程序中的后置断言完成验证。每个页面的局部采样义务分别保留。

SPA 路由以 Navigation API 的隔离世界前置监听约束；未准备好、不可取消或与执行器账本不一致的路由必须记录干预并保留 partial，不将修改后的页面判为原站点缺陷。同步启动期间立即改变 URL 的 SPA 可能触及该限制。网络主文档导航仍在发出请求前强制限制。原验收矩阵与严格门槛不降低；新增用例说明测试预期改变的依据（导航边而非路径段、明确拒绝响应而非伪造空成功响应）。

接手交付与待验收边界见 `docs/r0-closeout.md`。本轮实施者的验证记录不等同于独立真实模型能力验收。

## 1. 目标、范围与默认决定

用户从正式工作台或 `POST /api/runs` 提交完整网址和可选简短目标，获得一次有界、可取消、可恢复查看的 UI 检查。新网站不需要购物/导出适配器。报告分开表达执行是否正常结束、选定检查是否完成、质量发现、业务结果是否适用，以及未验证范围。

### 1.1 推荐首版支持范围

| 维度 | R0 推荐默认值与边界 |
| --- | --- |
| 网站 | 匿名 HTTP(S) 主文档，正常 HTML/DOM 与 GET 型动态数据；不承诺所有网站 |
| 会话 | 每轮全新 BrowserContext；不导入登录态、用户浏览器 Cookie、客户端证书或凭据；允许本轮匿名会话自身设置 Cookie，结束后销毁 |
| 入口 | 完整 URL，保留 pathname、查询参数顺序/重复参数和 fragment；URL 标准解析外不重写路径、排序 query 或删参 |
| 导航 | 入口 origin 固定；默认最多 3 个唯一页面/路由、从入口最多 1 层；含同文档 SPA 路由；不遍历全站 |
| 交互 | 滚动、当前页面的展开/收起、标签切换、只读筛选、无提交的普通文本输入，以及范围内链接；未知副作用的动作跳过并说明 |
| 资源 | 同源资源；高级选项可声明最多 8 个精确外部资源 origin 和 4 个只读数据 origin；不支持 `*`、域名后缀通配或自动扩权 |
| 数据 | 约定遵守安全读取语义的 GET/HEAD；OPTIONS 仅作为已允许数据目的地的预检。POST 只读接口、GraphQL POST、业务写入均不在首版支持范围 |
| 浏览器能力 | 沿用 Chromium、1280×768 默认视口；iframe/shadow/canvas 不进入通用几何判断；依赖 WebSocket、Service Worker、登录、上传、下载或多窗口才能工作的路径标为不支持 |
| 执行预算 | UI 默认 300 秒、30 次模型请求、20 次动作；可降低，不超过现有 API 上限 300 秒/60 请求/40 动作；新导航限制不得突破总预算 |
| 采样范围 | 每个已选页面最多选 3 个局部控件/状态做验证；至少验证 1 个可明确判断为局部只读的交互（若存在）；有可用同源链接且开启导航时，至少验证 1 次导航。其余明确记为有界采样未检查 |
| 质量能力 | 现有指针命中规则、DOM 调查程序、具有公开依据的时序调查；视觉发现及有限阻断审查默认仍关闭，不扩大成通用视觉审美检查 |

上述“3 页面、3 局部交互”是可理解的抽样上限，不是覆盖率分母，更不是必须寻找 3 个页面。开始前展示这些上限；首次观察后登记所选条目及依据。明确目标优先于默认采样，但不能授予写入或扩域权限。目标超出支持范围时保留为未验证，不默默改成另一个目标。

### 1.2 动态网站的最小调整与诚实限制

仅允许原入口文档、或对所有请求套“页面同源导航白名单”，会破坏 JS/CSS、字体及 fetch/XHR。R0 必须把**导航范围、资源来源、数据权限**拆开；支持 GET 型异步加载与用户显式添加 CDN/API origin，不要求写适配器。这是本次最小可行调整。

不根据 POST 名称像“查询”就放行，不解析一个未知 GraphQL 请求后自行断言无副作用。依赖 POST 查询的站点本轮不完整，回执说明接口和原因；用户可补充允许的资源来源后发起新任务，但不能在活动运行中修改权限。只读 POST 的版本化请求声明/审查可作为后续独立任务，不能让 dev 默认为本批隐藏扩展。

“HTTP GET”不等于已证明无业务副作用。支持范围明确要求网站遵守安全读取约定；Agent 还须依据当前公开页面语义避免注销、订阅、创建、删除、发送等动作及含糊的提交入口。方法是传输约束，按钮文案是判断线索，二者均非完整业务授权。遇到公开信息表明 GET 会写入时，必须在动作派发前拒绝；不能靠先访问 URL 再检查后果。未公开的 GET 副作用无法由通用浏览器可靠识别，该类网站不在无写入承诺内；报告不得声称已证明服务端零副作用。对需要绝对副作用保证的未知系统，只可使用隔离测试环境/可信请求声明，不能伪称本首版解决了这个问题。

### 1.3 非目标

不建设全站知识图谱、系统探索策略库、PRD/Figma、登录自动化、通用脚本发布/自修复、多用户、分布式执行、新模型/框架矩阵。基础页面和检查账本只服务本轮证据与结束判断；不做跨轮路径规划。现有业务 Journey 保持原身份隔离；UI 模式暂不读取或发布跨轮 Journey，避免以标题/path 误复用其他站点。

## 2. 实际基线与源码核查

### 2.1 提交和工作区

规划时当前分支为 `main`，`HEAD` 与本地 `main` 均为 `88d63c05b1c6df509498b4fd17122dd6d62f4b73`。与 Roadmap 的 `main@88d63c0` 一致；没有执行 fetch、checkout、reset、提交或改写已有文件。

规划前工作区差异：

- `README.md` 已有未提交修改：增加 Roadmap 链接 1 行。
- `docs/architecture.md` 已有未提交修改：增加 Roadmap 说明及空行 2 行。
- `docs/product-roadmap.md` 为未跟踪文件，已存在并完整阅读；SHA-256：`e7537cefbbe80601699a0e9ad0efab15952630258536ba8db1e9621238cfe6d7`。
- 没有发现产品源码差异；本计划以实际 main 源码为实现基线，以工作区 Roadmap 为产品方向。这些文档差异不增加任何已实现能力。不得覆盖、顺手提交或删除维护 Agent 的工作。

已阅读用户指定的 8 份文档，并对照下表源码。未执行产品测试、真实网站访问或付费模型调用；下述为静态核查结论，不是测试通过声明。仓库及所查上级目录未发现适用的 AGENTS.md。

### 2.2 关键事实与缺口

| 源码位置/入口 | 实际行为 | R0 必须改变或保留的内容 |
| --- | --- | --- |
| `src/server/routes/runs.ts` 的 inputSchema、POST | goal 必填；environmentId 枚举；总是先解析 businessProfile。entryUrl 同源校验通过后，createRun 仍收到 contract.environment.entryUrl | 新模式用完整入口；不能把 URL 输入框接到现有逻辑后宣称支持路径/query |
| `src/business/environments.ts`、selection/registry/schema/types | 固定 default/arena/export-arena；缺 profile 只在 arena 回退 checkout；快照含 hash | 旧选择及环境边界保留；UI 的网址解析不能靠向此注册表塞任意 origin |
| `src/execution/executor.ts:170` 附近 | 无 businessContract 时进入 legacyCompatibleContract，随后无条件创建 BusinessRuntime | 无适配器的新 UI 任务必须显式分支；“无契约”仍只代表旧业务记录 |
| `src/execution/browser.ts` 的 URL helpers | 所有请求同源；导航仅 `/` 或 entryPath；特殊路径拒绝；Service Worker 已 block | 新访问策略与旧策略按任务种类选择；新策略允许有界导航及明确资源依赖 |
| executor 的 context.route、请求跟踪 | 非 GET/HEAD/OPTIONS 进入 sideEffectPolicy；请求/响应/写入与业务事实深度耦合；popup 被关闭并记干预 | UI 读取不能产生伪业务事实；所有动作入口、重定向、子资源执行一致策略；允许读取与未知写入必须分别跟踪 |
| `side-effect-policy.ts`、`business/runtime.ts`、`download-policy.ts` | 写额度派发前预留；同实体 retry；未知写入隔离；导出下载为窄例外 | 原行为不变，UI 不继承 create/retry/download 权限 |
| `finish-contract.ts`、executor 的 finishInspection | short finish 即使选 scope-covered，business unknown 仍 blocked，并补业务后续未验证 | 必须按任务契约判断业务适用性；不能仅把 unknown 映射成 success |
| `task-state.ts` | 条件主要围绕业务；未观察业务时条件 pending；exploration_update 可覆盖/清空文本分支 | UI 业务条件显式不适用；新增执行器拥有的检查条目，不能用空列表清掉未完成事实 |
| `completion-integrity.ts` | completed 必须 goal-reached 且 businessResult 非 unknown；核对事件序列、finish、终态；新连接核验提交 | 增加版本化 UI 完成证明，旧规则保留；不删除任何持久终态校验 |
| `server/reports/run-report.ts` | 单读取事务；缺业务契约显示 legacy-unversioned；范围大部分来自事件中的 task 文本；干预后范围追加限制 | UI 单独报告 not-applicable、导航/条目/验证证据；不能被当旧业务报告 |
| `rules/builtin/*`、`rules/routing.ts` | overlay 通用；response-time 无阈值 unknown；业务规则依赖 business:fact；语义规则缺触发为 unknown | 能力/适用范围显式路由；无业务适配器不代表所有规则 pass 或所有规则不可用 |
| `investigation/*`、temporal、focus、证据提升校验 | 有界 JSON 程序、原子采样、同 run/同假设证据、干预禁提升已存在 | 复用；调查 act 与普通动作必须经过同一权限和预算，不新增循环 |
| `agent/policy.ts`、tool-guidance、activeTools | 有通用调查指引，但仍注入业务恢复/结果建议；journey identity 依赖 profile/adapter | 按能力生成提示与可用工具，不能到处传空购物契约 |
| `run-phase.ts`、progress-detector、decision-memory | 有收尾请求预留、无进展控制，实际测量/检索计入进展 | 接入新范围事实；重复观察/反复修改文字不算新进展 |
| `run-manager.ts`、`storage/database.ts`、run-queue | spec/event JSON 持久化，终态字段 TEXT；串行；重启 queued/running 一律 interrupted 并要求核对 | 可追加 JSON 契约和事件，无须表重建；本次不放宽重启隔离 |
| `src/web/main.tsx`、state | 只有购物/导出表单；通过 1.5 秒轮询事件与报告更新；服务另有 SSE；URL/localStorage 恢复 run | 保留轮询和 SSE 协议，不误称前端已用 SSE；新增网址模式和范围报告 |
| `scripts/validation/programs.ts` | DOM-only fixture 仍用 environmentId=arena、省略 profile，继承 checkout；显式 finish 不等于独立 UI 完成 | 不能将历史 program 批次作为 R0 证据；新增真实 UI API 路径预检与评分 |
| `evaluation/private/program-score.ts` | 已有配对程序评分，但健康探索主要检查触发与无 fail，配对重放另检查 | R0 健康出口需独立实际正常行为/测量证据，不能仅复用“没有 fail” |

主执行器目前 3329 行。只按本次边界抽出网络会话、检查范围和结束决策；不把全面拆分工具注册/模型循环作为前置任务。

## 3. 推荐契约与用户流程

### 3.1 方案比较及选择

| 方案 | 判断 |
| --- | --- |
| 为 UI 注册一个空 business adapter/profile | 拒绝。会把纯 UI 伪装成业务，并继续混淆 legacy、阈值、trigger、result、Journey 身份 |
| 让 businessContract 可空，到处跳过校验 | 拒绝。当前可空已有旧记录含义，容易给业务任务绕过结果和证据验证 |
| 显式判别的任务契约，共用执行器 | **采用**。UI 与 business 共享浏览器/预算/队列/证据/取消/持久收尾，分别定义权限、完成义务和业务结果 |
| 第二套 URL scanner/独立浏览器循环 | 拒绝。容易绕过 investigation、未知写入和终态保障 |

新增 `RunSpec.kind: 'ui-scan' | 'business'`；新请求默认兼容 business，工作台的新建默认可选择 ui-scan。缺 kind 的历史记录仅按旧业务语义只读解释。内部使用判别联合，不允许 UI spec 同时带 businessContract，不允许 business spec 用 URL 策略绕过注册环境。

UI spec 保存 `uiContract`（schemaVersion、policyRevision、hash），至少包含原始/规范入口、固定 origin、匿名会话、资源/数据来源、导航上限、采样上限、明确无业务写入权限、可用检查能力和不支持能力。hash 使用与业务快照同等的规范化、自排除自身做法，但不要改动旧 business hash 算法。预算、viewport、goal 留在共享 spec 中；finish 证明同时引用完整 spec 的相关配置摘要，避免换 budget/scope 仍复用旧结论。用户文本不能动态注册适配器或修改权限。

运行期 `RunContext` 分为共享部分和可选业务能力：UI 的 `business` 为 null，不调用 legacyCompatibleContract；业务运行继续用现有 BusinessRuntime。共享上下文包括 entry、导航策略、预算、证据、页面状态、取消信号、已选检查和实际工具能力；业务上下文另含 adapter、requirements、feedback/retry 阈值、ownedOperations、write reservations、公开业务资源。

### 3.2 完整工作台流程

1. 用户选择“网址 UI 检查”，输入完整 URL；目标可空，默认“检查此页面及允许范围内的 UI 交互，报告有依据的问题和未验证范围”。普通表单只需 URL/目标；高级选项展示预算、最多页面/深度、精确资源/data origins。
2. 表单显示匿名、有界采样、不提交业务操作、支持 GET 型数据等边界；客户端提前提示明显无效输入，服务端做权威校验。失败给出字段及原因，不创建半个任务。
3. 202 返回 runId、模式、快照 hash、events/report URL。完整 spec 在入队前持久化；页面显示入口、范围、预算及队列状态。
4. 服务访问入口，记录重定向及最终 URL；观察/自动规则执行后，Agent 选择局部检查和有限导航，工具持续回传已测结果、未决检查和剩余预算。
5. 日志和范围列表实时更新。用户关闭页面不停止运行；取消仍走现有取消 API。资源拒绝、写入拒绝、未支持交互显示为执行边界，不弹出一个偷偷放行本轮的按钮。
6. 结束显示“执行状态 / 检查范围 / 发现 / 业务不适用”，可展开每项的入口、动作、实际测量、依据、证据、未验证原因及干预；无发现文案为“在已验证范围内未发现问题”。
7. 刷新、粘贴 `/?run=...`、历史列表或重启服务后读当次快照和持久报告，不用现配置重算旧权限。可复制当次设置新建任务，必须产生新 run；不会自动重放旧任务。

## 4. URL、网络与操作权限

### 4.1 固定策略与 URL 处理

业务：仍走 `selectBusinessContract`、旧环境白名单、旧导航/download policy。UI：走新 `resolveUiScanContract`，与旧注册表平行。不能把 `environmentId='default'` 改成“任意网站”。UI 不接受 caller 自定 environmentId，内部使用 `url-scan` 标识；受信本地测试目的地由服务器配置，不能由请求体授予。

UI 仅接受绝对 HTTP(S)，拒绝 userinfo、非法编码、非标准 scheme、敏感内部路由和控制面。默认公网目的地限标准 80/443；私网/loopback/link-local/云元数据地址拒绝。为本机开发及独立 fixture 允许**服务器显式配置的精确 origin**，不允许整个 127/8 或 *.local；UI/API 无权添加本地例外。控制服务、Sentinel 自身 API、私有评估端口即使同机也不得纳入。旧购物/导出本地环境继续按原注册边界运行。

URL 身份保留 query/fragment；对 path 的解码只用于拒绝检查，不再编码为另一个入口。拒绝时返回结构化 400，不因 `decodeURIComponent` 异常变成 500。同源定义严格含协议/host/port，不把 www、子域、不同端口或 HTTP→HTTPS 当同源。跨源入口重定向首版拒绝并显示目标，用户用最终 URL 发起新任务；同源重定向最多 5 跳，每跳记录并检查，循环/超限明确终止。

导航按完整 URL（含 query/fragment）登记，重复访问不新增唯一页面，但消耗动作和总预算；SPA 的 pushState/replaceState/hashchange 记录 route/state，改变后的观察才可证明到达。重定向链计跳数，落地页计唯一页面；连续自动跳转还受总导航尝试上限 8 约束，不能用不断变化 query 绕过限制。页面返回入口不增加深度；从入口出去的所选链接深度 1。R0 不是自动爬虫。

### 4.2 请求决策表

| 请求/动作 | UI 允许条件 | 拒绝后的含义 |
| --- | --- | --- |
| 顶层文档导航 | 固定 origin、允许路径、导航额度内、公开语义无写入迹象；GET/HEAD | 未导航；若请求实际已被拦截，登记干预；不能说目的页面有缺陷 |
| script/style/image/font/media/manifest 资源 | 同源或冻结的 resourceOrigins；GET/HEAD；不可访问私有/控制路径 | `resource-origin-denied`/`resource-type-denied`；页面可能被破坏，后续证据不可证明原站点好坏 |
| fetch/XHR | 同源或冻结的 dataOrigins；GET/HEAD，遵守支持范围的读取语义；资源许可不授予 API 许可 | `data-origin-denied`/`unsupported-data-method`；不把加载失败判为站点 bug |
| OPTIONS | 仅允许数据来源的 CORS 预检；不代表其后请求获准 | 后续请求仍独立授权 |
| POST/PUT/PATCH/DELETE、beacon/ping、表单提交 | 默认全部拒绝；不能通过 user goal、按钮命名或模型的 intent 放行 | `write-denied` 或 `unsupported-data-method`；关联动作及未验证分支 |
| GET 但公开语义为写操作 | 目标动作预检拒绝，trusted policy 的 deny 路径也必须在请求层拒绝 | 不访问以验证猜测；保留该业务操作不在范围内 |
| iframe、新窗口、下载、文件上传、WS、SW | 首版不调查；popup/网络渠道在派发前阻止，SW 延续 block | 表明不支持及是否实际改变页面；依赖它的检查不可算完成 |
| data/blob 本地资源 | 仅浏览器当前页面生成/嵌入的本地子资源可渲染；不得作为导航目标、网络许可或新的执行 API | 无法测量的表面记 unknown，不新增任意 JS 执行 |

导航意图、request destination/resource type、origin、URL、方法、当前任务能力必须组合判断；不要只用扩展名判断“资源”，也不要让 `fetch('/delete')` 因资源 host 获准而绕过数据策略。页面不能以注入提示、伪造元素属性或伪造“已批准”资源扩权。

### 4.3 执行位置及最小网络保障

新增 `src/execution/network/`：纯策略判定器、UI 网络会话、事件回执。策略判定输入显式包含 `kind, requestId, url, method, destination, navigation, redirectFrom, actionId`；输出 `allow/deny + reason + policyRevision`。请求计数/拒绝原因与证据干预同步，代理和浏览器错误不可伪装成站点错误。

UI 网络会话在浏览器访问任何网址前安装。推荐用 Chromium 的逐请求暂停机制实现**每一跳派发前**授权，保留现有 Playwright Page 和动作循环；不得假定仅在 page_act 或主请求调用一次 URL helper 就能控制脚本导航、302/307 和资源重定向。若复用 context.route，必须以真实浏览器反例证明所有跳均受控；若 SDK 跳过重定向 hook，采用 CDP Fetch 暂停层实现同一个判定器，不能接受“跳完以后观察 URL 再关闭”。此处是拦截实现细节，不是第二套 Agent 执行循环。

公网地址检查不能只在创建任务时 DNS lookup 一次。推荐本轮 loopback 出站代理：仅连接已批准 origin 的经检查 IP，连接时重新校验并绑定实际地址，保留 Host/TLS SNI，拒绝混有私网地址的解析；浏览器禁止代理绕行和 QUIC，WS/其他网络通道不得绕过。HTTPS CONNECT 的 host/IP 控制不代替浏览器里的 path/method/redirect 判定，两层分工分别验证。此层仅 UI 模式启用，业务原网络策略不迁移。初始配置/代理失败属于环境/执行错误。无法证明目的地址与逐跳控制有效时，不交付“公网 URL 已支持”。

成本：多一个有界网络模块和真实重定向、代理、DNS/地址分类测试；收益是开放任意 URL 不同时开放本机控制面。不得扩大成通用代理产品、TLS 解密平台或网络爬虫。开发可替换为等价的固定地址连接方案，但必须先记录计划偏差、同等威胁边界及证据，不可降格为纯字符串白名单。

### 4.4 干预与预算

保留现有运行级单调 evidence-integrity：一次实际网络拦截/关闭 popup 后，后续状态不能证明未干预网站的 pass/fail；重新观察、刷新或导航不清洗干预。干预前有效发现保留。R0 不做复杂的“只有广告被拦所以无关”因果豁免；第三方遥测被拦也明确限制结论。若需重新验证，修正受信范围后新建任务。

动作在派发前因范围检查被拒绝且页面未被改变，只登记 skipped/denied，不伪称已发生网络干预；仍保留未检查条目。已获准请求超时/原站点 500 与执行器拒绝分别记录。UI 不把允许的 GET 数据读取放入 pending business write；拒绝的 POST 不应误触发“已派发未知写入”。真正派发过但结果不明的写入及旧业务未知写入仍进入 reconciliation-required，不重试、不自动解除锁。

默认额外网络预算：整轮最多 500 次请求、单响应 10 MiB/整轮 50 MiB、只保留至多 64 KiB/条的必要文本证据；不无界缓存响应正文。额度是本轮共享额度，程序、视觉定位、导航/重定向不能另开额度。读取限制导致拒绝或截断必须标记；原始下载禁止。公开响应正文不能默认全部送给模型，不存凭据头/Cookie；必要依据截断即 unknown。大小限制需要包含 chunked 响应的实测测试，不能只相信 Content-Length。

## 5. 数据、API 与检查账本

### 5.1 API 输入与兼容

新增请求分支（示例字段即本计划推荐名称）：

```json
{
  "kind": "ui-scan",
  "entryUrl": "https://example.org/catalog?category=books&sort=price#items",
  "goal": "查看目录浏览和筛选是否正常",
  "scope": { "maxPages": 3, "maxDepth": 1 },
  "access": { "resourceOrigins": [], "dataOrigins": [] },
  "budget": { "totalTimeoutMs": 300000, "maxActions": 20, "maxModelCalls": 30 }
}
```

UI 的 goal 省略或空白均采用中性默认值；短目标上限 2000 字符。scope/API 仅允许收窄：maxPages 1–3，maxDepth 0–1；maxDepth=0 时只检查当前入口页。UI 禁止 businessProfile/environmentId/raw contract；business 分支保持现有严格 schema、默认 arena、显式配置与错误语义。未知 kind 或混合字段返回 400。保持既有 business resolve/catalog API，不用 UI 扫描为其新增虚构 profile。

202 为两个模式统一返回 `runId/status/kind/contractHash/eventsUrl/reportUrl`；业务兼容字段继续提供。列表/单条任务/报告均能识别模式。错误包含稳定 reasonCode、字段、脱敏目标；不能把 query 中的 token 回显到模型日志。入口执行必须保留完整参数，敏感展示可脱敏但不能拿脱敏 URL 去执行或作为页面身份。

### 5.2 版本化检查账本

新增 `src/execution/inspection-scope.ts`，是本轮有限条目账本，记录范围与证据，不实现 R1 的探索图谱。写入持久事件，报告从事件/快照投影恢复。至少包含：

- `pageId/stateId`、完整执行 URL、document/observation version、父导航/动作、首次/最近观察证据。
- `itemId`、类别（entry-observation / automatic-check / local-interaction / navigation / investigation）、目标来源、basis、是否选入本轮义务、创建时的观察版本。
- 状态：pending / verified / failed（已验证缺陷）/ unverified / excluded；后两者必须有 reasonCode/说明。failed 完成了测量，不自动使检查未完成。
- `eventIds/evidenceRefs`、动作前后状态、ruleRevision 或 program/receipt 引用。声明“检查了”不足以将条目变成 verified；由执行器根据已保存工具回执更新。
- 未选的抽样候选、截断数量、不可支持维度单独呈现；不存在“所有网页控件”这个已知总数。

扩展 `exploration_update` 为 UI 模式提供受约束的 `selectItems/recordGap` 或等价 schema：只能选择当前观察的目标、关联已经发生的事实及提出未验证事项；不能由模型提交 `verified:true` 或随意删除条目。保留旧业务输入兼容。已选目标失效/导航离开仍留记录；只能靠相应新证据完成，或以明确原因成为 unverified。用户目标里的显式检查点、未知调查、执行器干预不受“清空 branches”影响。

范围形成规则：入口观察与自动规则由执行器自动建项；Agent 在观察到的候选中声明有依据的局部采样/导航；首次选择后只能追加或有理由标未验证，不能为收尾缩小已承诺范围。静态无交互页可无 local-interaction 义务，但需真实观测证据和控件枚举为空/不适用的记录。未知事实、无阈值的性能判断、未支持的视觉维度按能力列为未验证/未检查；若本来不在声明支持检查中，不阻塞限定范围完成；若用户明确要求或已选入，则阻塞完整完成。

`excluded` 只由冻结的支持边界、采样上限或可核查的不适用事实产生，不接受模型把未完成条目任意 excluded。默认需要的局部交互/导航在没有选择时仍是执行器义务，不能因 Agent 从未调用 selectItems 消失。发现候选时至少保留当前观察提供的候选摘要及截断标志；“没有适用控件”须引用该摘要及公开语义，不能只引用模型一句话。

### 5.3 事件与持久化

沿用 run_events 和 artifacts，不建第二条日志。新增版本化事件建议：`scope:item-created/updated`、`navigation:requested/committed/denied`、`network:decision`（允许请求可有界汇总，所有拒绝完整保留）、`inspection:summary`。现有 `execution:intervention` 增补原因与 request/action/navigation 关联，保留旧消费者可读性。引用仍校验同 run、先后序列、文件可读与摘要。

`finish:accepted` 和 `run:completed` 保存 inspection snapshot/hash、kind、contract hash、业务适用性；异常/取消/重启也必须能还原当前未决 scope。报告的 authoritative 范围不是模型自然语言。事件上限不得通过静默丢弃末尾来省空间；额度用尽即停止继续探索、输出部分记录。

现有数据库 spec/event 为 JSON，status/business_result 为无枚举 CHECK 的 TEXT：推荐不改表结构、不批量回写旧记录。新增 kind/uiContract/结果枚举需要读写器、API、UI、report CLI 同步支持；不能把“没做 SQL migration”等同于“不用数据兼容测试”。

## 6. 执行、结束及报告语义

### 6.1 四个独立维度

采用 `BusinessResult = success | rejected | unknown | not-applicable`；**只有显式 ui-scan 契约**可写 not-applicable，从创建到报告一致。旧记录和业务运行绝不因没有 adapter/字段而变 not-applicable。业务仍可能 unknown，不等于检查失败或成功。

保留 RunStatus 枚举；新增 `inspection` 报告/终态证明：`coverage = covered | partial | not-started`、selected/verified/failed/unverified 条目及 reasonCodes。`completed` 表示该种类契约接受完成；UI 与业务按各自完整性要求接受，不能把质量无缺陷作为 completed 的条件。

| 事实 | RunStatus / stopReason | inspection | businessResult |
| --- | --- | --- | --- |
| 所选 UI 检查均有有效结果，有已证实发现 | completed / goal-reached | covered，发现保留 | not-applicable |
| 所选 UI 检查均有有效结果，无已证实发现 | completed / goal-reached | covered；仅称已验证范围内未发现 | not-applicable |
| 已做一些检查，尚有本轮义务未验证，Agent 显式结束 | blocked / blocked | partial + 逐条原因 | not-applicable |
| 有依据的页面/权限阻挡，入口不可用或无法继续 | blocked / blocked | partial 或 not-started | not-applicable |
| 总时限/动作/模型预算耗尽 | timed-out / budget-exhausted | partial 或 not-started；无 accepted finish 不冒充主动完成 | not-applicable |
| 用户取消 | cancelled / cancelled | 已有结果保留，其余未验证 | not-applicable |
| DNS/TLS、工具、模型、存储异常 | execution-error / 相应现有 reason | partial 或 not-started；环境原因明确 | 不伪造 success；UI 仍不适用 |
| 服务重启打断 | interrupted / reconciliation-required | 按持久记录恢复，不补写“完成” | UI 不适用；业务保留原事实 |
| 购物/导出 | 保持原 completed/blocked 与 success/rejected/unknown 约束 | 原路径/规则/恢复义务保留 | 由业务事实和 UI 关联决定 |

HTTP 不可达、被拒绝访问、登录要求可有明确 blocked 原因；浏览器启动/解析器异常则 execution-error。不要用同一“网站有问题”覆盖这些差异。检查未开始时不显示零缺陷绿灯。发现数与 inspection.coverage 无绑定关系。

### 6.2 run_finish 的可核查前提

保留短输入 reason 枚举。UI 始终使用短结束协议，即使旧 business shortFinish 功能开关关闭；旧长输入仅业务兼容，不允许 UI 传 businessResult=success。新模块 `inspection-completion.ts` 接受当前事实，产生结束决策与证明；executor 负责串行调用、guard、持久提交，不能让模型直接写状态。

`scope-covered` 必须全部满足：

1. UI 契约 hash 和模式有效，入口确已导航并产生可读 snapshot/screenshot，不是空白 error 页面。
2. 所选页面/状态有实际观察；默认局部交互/导航义务已满足或以可核查事实证明不存在适用目标。只有观察而无交互，不能声称已验证存在的交互。
3. 当前及所选受影响状态的适用自动规则已执行；语义规则仅对真正具备能力与触发条件的检查形成义务。缓存必须属于当前事实版本。
4. 所选检查有同 run、同目标/文档/观察版本的工具或测量证据。pass/fail 均可完成检查；unknown、缺证据、丢失/歧义目标不行。原始程序的断言计算可复核，预期依据单独保留。
5. 无待处理动作/有界响应提交，无在途调查、open/inconclusive 的适用假设、未处理视觉候选、已选未验证条目或未解决证据干预。结束前重新观察/排空事实队列，导航变化不能复用先前 finish 决策。
6. 所有拒绝、截断、跳过、抽样外范围和不支持维度已持久记录；不允许仅清空规则队列或探索分支证明完成。

不满足时拒绝完整完成，返回 missingFacts/itemIds/reasonCodes 和可用的 partial 结束建议，保留 finish:rejected。`unverified-scope` 可接受结束，但由执行器将所有未决条目固定为 unverified，不是删除它们；若无任何 gap，返回无据的 partial 请求或采用可核查的 covered 结论，不能任意制造 blocker。`observed-blocker` 需要导航/页面/工具失败或有效测量证据；一个普通质量 finding 若不妨碍后续检查，不构成 blocker。

无业务适配器不再注入 recordBlockedScope 的“业务下游未验证”义务；UI 报告直接声明业务不适用。但用户要求购买、导出、恢复交易等超范围目标，必须记录目标未验证，不能通过“业务不适用”把任务变成完成。

### 6.3 持久完整性与报告

更新 completionIssues/verifyCompletionCommit：按 spec.kind 和契约版本选择校验器。UI completed 必须 businessResult=not-applicable、accepted scope-covered、有效 inspection proof、同一 contract/spec 摘要、完整事件尾；缺证明即不一致。业务 completed 继续禁止 unknown/not-applicable。缺 kind 的旧记录用旧规则，不要求其拥有新字段，也不重新解释历史 blocked。

证明应引用 `scope` 条目及结果事件摘要；校验器从持久事件重建验证，不能相信 finish 中另存一个 `allDone:true`。独立新连接核对 run、终态、事件序列/IDs/tail、scope 摘要。取消/预算/中断不要求 accepted finish，但其持久停止证据和可恢复范围必须一致。补充重启路径终态证明，不能让它在新 schema 中永久显示“检查完成”。

报告仍单读取事务投影，再校验 artifact 文件可用性。分别展示：requested/final URL、访问路径与重定向；已观察和已验证条目；发现及依据/截图/测量；没有验证的目标及原因；全部执行器干预；时间/调用/动作消耗。不可用 artifact 显式标 unavailable，受影响已验证结论不得以“证据完整”展示。产品目前记录 token 而非完整美元成本，继续显示 unknown/not-recorded，不能显示免费。

## 7. Agent 行为及工具复用

| 能力 | UI 模式行为 | 业务回归约束 |
| --- | --- | --- |
| page_observe/element_details/page_inspect | 继续使用当前版本事实；自动建观察条目 | 不改变元素歧义/失效处理 |
| page_act / investigation act / focus 点击 | 共用一个动作入口及网络策略；前后证据、预算、取消一致 | create/retry reservation 仍派发前生效 |
| overlay-blocking | 在适用状态确定性自动运行；只能证明采样点指针拦截 | 不能升级成任意像素遮挡结论 |
| response-time | 无公开阈值不引入购物阈值；仅展示测量/unknown，不纳入默认强制 SLA 义务 | 业务已有阈值及 uncertainty 判定不变 |
| business-outcome / retry rules | 无业务能力时显式 out-of-scope/not-applicable；不得伪造触发事实；有能力但缺事实仍 unknown | 业务中缺触发资格不能整体改成 not-applicable |
| investigation_run | 开放现有 JSON 原语；basis 和结果分开；证据重新计算校验 | 限制、干预及防止 findings_submit 改写保持 |
| investigation_check / transition_observe | 仅真实公开时间要求和可绑定目标；不能 invent 超时 SLA | 原业务时序规则与声明窗口不改 |
| rules_search/details/checks | 按 capability + applicability 路由；便宜检查由执行器运行，模型选择语义绑定 | 审批规则不改 target/timeout/适用性凑通过 |
| exploration_update | UI 操作有限账本，不清空服务器义务 | 旧接口兼容 |
| history_read/tool_result_read | 保留缺口、拒绝、当前模式和预算，不只压缩动作 | 关键业务事实不可丢失 |
| journey_run / blocker review | UI 首版关闭跨轮 Journey 和业务有限阻断审查 | 业务默认/显式开关行为保持 |

生产提示按能力组合：理解目标→观察公开状态→选少量局部交互/导航→利用已有检查→对有根据的未知现象提出可反驳假设→验证→留下缺口并结束。不要提供靶场页面名、固定 selector、操作答案或预期缺陷。

确定性部分负责入口与访问控制、观察、自动规则、整个采样窗口、程序计算、账本和证据校验；模型负责目标相关性、控件语义、合理预期及未知现象实验。healthy 页面无异常时不强迫模型捏造假设：交互前后状态及独立检查可以证明正常行为；不能把“工具成功”直接当 UI 正常。

通用站点上的规则适用性也是 B2 的必交项：现有 overlay 规则仅筛 visible/enabled 的 button/a，不能把正常模态框背后的控件暂时被拦、视口外控件或符合公开条件的禁用状态自动升级为产品缺陷。保留真实 hit-test 原始事实；对普通 DOM 可判断的 inert/模态背景/视口条件做通用适用性筛选，不能确认“此时应可操作”的情况保持 unknown 或范围受限，不依页面名称特判。正常模态框的关闭控件应可实际验证，真正前景操作被拦的异常仍应 fail。修改规则判定须升级 rule revision，旧证据仍按旧 revision 展示，并通过原购物/导出和新的健康反例。此处不要求新建完整无障碍规范引擎。

保留 observation cache、rule cache、原子调查去重、3 次无进展提示/5 次收尾和预算预留。新进展只计新状态/验证事实/实际检查条目结果，不计换措辞、换 ID、反复读取同结果。新 URL/query 不能无限算探索收益。阶段 finalizing 不新建探索任务；未完成程序保留 unverified，不为了结束额外增加调用额度。

## 8. 按依赖排序的开发批次

每批可单独提交并独立验证；批次通过不代表 R0 完成。dev 不修改验收标准来适配实现。阶段偏差先写说明；涉及支持范围、权限或结束定义的变化必须显式修订本计划。

| 批次/任务 | 进入条件 | 影响模块与交付物 | 验收出口 |
| --- | --- | --- | --- |
| B0 基线与测试合同 | 阅读计划，核对当前 main/工作区差异 | 保存交付基线；A 类 fixture/私有真值设计；明确 API 类型及模式分支；评分反例清单 | 证明不碰他人文档；测试任务/公开页面不含答案；独立验收可复查设计。此批不接付费入口 |
| B1 UI 契约及访问策略 | B0 确认范围 | 新 `src/inspection/{types,schema,selection}.ts`（或等价目录）、`execution/network/`；shared types/config；严格 URL/请求解析与逐跳拦截；真实浏览器测试 | URL/path/query/fragment 保留；资源/data/导航分离；CDN/GET SPA 可用；私有地址、写入、redirect/WS/SW/popup 反例无越权派发；所有拒绝可追溯。尚不开放生产 UI 创建 |
| B2 执行器接入与独立结束 | B1 边界测试通过 | executor 只做组装；RunContext 能力、inspection-scope/completion；task-state、finish-contract、run-manager、completion-integrity、policy/guidance/routing、investigation host | 不创建 business runtime 的 UI 正常/缺陷均可 covered；partial/异常有缺口；非法 finish 不通过；未知写入/证据回归通过；通过测试入口或正式 API 开关访问，不声称完整产品交付 |
| B3 正式 API、工作台与报告 | B2 核心闭环通过 | routes/runs、server/reports、web/main/state/style、CLI report；新增模式表单/范围与干预展示/历史恢复；契约先持久化后排队 | 用正常工作台输入 URL 创建到读报告全程可用；API 同等行为；缺配置明确错误；取消/SSE 重连或轮询尾/重启/旧报告全部通过；不依赖开发者直接调用 executeRun |
| B4 免费完整集成及兼容 | B3 端到端可用 | 新 `validate:url-scan -- --preflight` 分离入口、evaluation/private/url-scan 评分器与自测、原始证据；必要 docs 更新草稿 | A 矩阵全部通过；B 固定模型按正式 API/工作台跑完；既有免费回归通过；无凭据环境不会请求付费服务；失败/unknown 留存 |
| B5 冻结交付与独立真实验收准备 | B4 有原始证据 | dev 交付清单、构建/配置/fixture/评分器 hash、diagnostic/formal 入口及 dry-run 计划、文档更新；独立验收 Agent 审阅 | 代码及 A/B 独立核验通过后才申请具体 C 批次授权。当前开发授权不包含付费；无 C 证据标“实现/免费接线验证完成，R0 能力验收待执行” |
| R0 验收出口 | 获授权且 B5 冻结身份 | 本计划第 9–10 节全部必需证据；独立验收报告及给维护 Agent 的同步包 | 正式正常/异常及业务回归出口均满足才建议维护 Agent 标 R0 完成；否则继续本阶段整改 |

合理拆分边界：`network` 拥有访问决定、请求跟踪和干预回执；`inspection-scope` 拥有检查条目投影；`inspection-completion` 纯计算完成证明；业务模块继续拥有协议事实/副作用；executor 保留生命周期、工具串行化与模型循环。避免为“少改文件”把新 URL 策略和报告计算继续堆进 3329 行主函数。

## 9. 验收矩阵

层次标记：A=单元及真实浏览器；B=固定模型、真实 SDK/服务/浏览器正式入口；C=真实模型、中性目标、独立真值。每项的证据必须指向交付构建，不能以一条汇总“passed”替代。

| ID / 需求 | 场景 | 检查方式 | 预期结果 | 必存证据 |
| --- | --- | --- | --- | --- |
| U01 无适配器独立正常站点 | 新独立目录/帮助站，不在 business registry；空目标 | A/B/C；正式 API，至少一次工作台 | ui-scan、not-applicable、covered/completed；实际观察/交互正常，不是假业务成功 | 请求、快照 hash、无 adapter 初始化证据、独立浏览器测量、finish proof、工作台截图 |
| U02 正常/异常对照 | 两组公开 UI 结构相同、私有开关不同的控件/布局；一组已知规则可测，一组需 DOM 程序 | A/B/C；正常与异常完整配对，独立浏览器按公开操作复现 | 异常有有效且有依据的 supported finding；健康有真实正常测量/交互证据，无误报；unknown/NA 不算健康通过 | 私有真值、独立截图/测量、原始程序/回执、目标归属、全部运行 |
| U03 完整入口 | `/catalog/detail?x=1&x=2&sort=asc#panel` | A/B；浏览器与服务访问日志、API spec 比对 | 首次请求 path/query 原样，fragment 在浏览器内保留；不回到 `/` | 初始请求日志、location、持久 spec、导航事件 |
| U04 局部交互及有界导航 | 展开、标签、GET 筛选、同源详情、返回、SPA 路由、重复 query | A/B/C 选定主场景 | 存前后状态与验证；深度/唯一页面/尝试上限有效；范围外清晰跳过；无任意全站探索 | 动作与 state ledger、服务计数、额度、导航链 |
| U05 资源/动态数据 | 同源 JS、显式 CDN 的 CSS/font/script、同源 GET 数据、显式跨源 GET API | A/B；生产网络策略真实加载 | 功能正常且健康；资源许可不授权 API、导航或写入；不因全部拦截得到假缺陷 | 网络决策、服务到达日志、加载后 DOM/截图和实际 pass |
| U06 重定向/越界 | 同源 302、多跳/循环、307 写入、跨源跳转、资源 redirect 到控制路径/私网 | A/B；两端服务私有日志 | 允许的每跳保参；拒绝目标**未收到请求**；不以事后关页充当拦截 | 全 redirect chain、目标服务零到达证据、拒绝事件、账本 |
| U07 写入及方法歧义 | 提交 POST、GET 公开声明会创建、看似查询的 POST、后台 beacon | A/B，私有 mutation counter | POST 不派发；已知 GET 写动作预检拒绝；不依据按钮文字/模型 intent 放行；未知 POST 只读依赖是未验证 | 服务器写计数、动作预检、write/access denied 与 intervention |
| U08 干预不误报 | 同一健康页允许资源时正常，资源或写请求被拦后错误 UI | A/B/C 中选择一例拒绝能力诊断 | 后者 partial/blocked；不能把受干预测量提升为站点缺陷或健康 pass；前者真实健康通过 | 对照完整请求、evidenceIntegrity、拒绝提升回执、报告截图 |
| U09 有发现仍完成 | 存在非阻断缺陷，所有所选检查已做完 | A/B/C | completed+covered+supported findings，业务 NA，缺陷不强迫 blocked | accepted finish、scope proof、持久终态与原始 findings |
| U10 未验证事项 | unknown、歧义/失效目标、未决假设、正文截断、用户目标要求不支持业务 | A/B | scope-covered 拒绝；partial 保留具体 gap；清空 exploration_update 不能抹除 | finish:rejected/accepted、原始 scope 事件、历史报告 |
| U11 非证明结束 | 空队列、只有工具成功、纯文字“完成”、伪造 item 已验证、过期观察 | A/B，对抗固定模型 | 没有足够事实不得 completed；结果可验证拒绝或合理 partial | 工具输入、错误、事件序列与 DB 行 |
| U12 取消/预算/无进展 | 排队取消、工具中取消、模型迟到、动作/调用/总时限、500 请求/流式体积上限 | A/B | 对应终态，零迟到动作/回执提升；预算不重置；已得证据与缺口保留；重复观察不混成完成 | 时间线、服务计数、usage、状态及事件尾 |
| U13 重启/恢复 | 活动 UI、活动业务、queued、已完成 UI；关闭工作台后继续 | A/B 真实进程重启 | 未完成 interrupted、不自动重放，现有隔离锁保留；完成报告重启前后语义一致 | 重启前后 DB/API、请求计数、报告和 workbench 恢复截图 |
| U14 历史兼容 | 无 kind/contract 旧记录、当前 checkout/export、旧 analysis 记录 | A/B | legacy-unversioned 仍原义；不套新默认；旧 blocked unknown 不变 UI success/NA | 固定 DB 样本、前后报告语义 diff |
| U15 业务回归 | C0–C5、E0–E4、已批准 retry 迁移/健康恢复 | A/B/C，复用原评分器及真值 | 原创建/重试/下载和 success/rejected/unknown 不变；健康须真实完成恢复；不得伪造第二次 create | 原批次报告、私有计数、批准来源与 hash、45 轮正式记录 |
| U16 证据与持久终态 | 跨 run refs、错 hypothesis、假 receipt、干预样本、missing artifact、删 finish/terminal、尾序列不全、篡改 contract/scope | A/B，独立读连接 | 拒绝提升/完成或报告 inconsistent；UI 模式不能扩大业务豁免 | 注入用例原始错误、独立 SQL/API 差异、文件摘要 |
| U17 工具全入口一致 | 普通动作、程序 act、视觉/focus、页面自动请求；UI 不复用业务 Journey | A/B | 同一权限/预算/取消；无旁路、无额外 model 循环 | 各入口事件和网络回执、断言结果 |
| U18 私有答案隔离 | fixture HTML/JS/API/URL/model requests 全量扫描，诱导提示页面 | A/B/C | 无 case ID、根因、评分阈值、私有控制端点或 token 给 Agent；页面提示不能扩权 | 公开资源/模型请求审计、私有真值单独目录、泄漏反例 |
| U19 实际地址边界 | IPv4/IPv6、映射地址、DNS rebinding、代理绕行、TLS 错误、非 HTTP(S) | A 真实 socket/浏览器，B 一条集成 | 不连接未授权实际地址；显式本地 fixture 例外不授予控制端口；错误可解释 | 解析/连接审计、目标计数、启动配置、环境阻断结果 |
| U20 正式用户闭环 | 表单空目标、错误 URL、排队、实时事件、取消、历史打开、导出报告 | A/B；C 至少 1 轮从工作台发起 | 与 API 同一契约；有发现/无发现/部分完成文案准确；“未发现”不是全站合格 | 请求与事件、真实浏览器截图、JSON/CLI 报告 |

U02 的 A/B 健康控制还必须包含正常模态框、视口外控件、合法 disabled 和无交互静态页；对应异常包含应可用的前景控件被拦。不能靠把全部 overlay 检查都改成 not-applicable 来消除误报。

## 10. 验证层次、真实验收预算及通过条件

### 10.1 三类证据的能力边界

- **A**：纯类型/schema/策略/完成证明测试，以及真实 Chromium 的行为/网络/证据测试。证明确定性约束和反例防线；不能证明模型会自主选对目标。所有必须的安全、持久化、旧业务回归断言应通过，无跳过项冒充通过。
- **B**：固定模型向真实 Mastra、编译服务、浏览器和正式 HTTP/workbench 发工具调用；证明接线、工具契约、结果恢复及非法 finish 会被拒绝。固定答案仅在 evaluation/scripts 中，生产提示不携带。预检主动清空真实凭据、固定本地模型地址，绝不隐式切付费。B 不能作为自主发现证据。
- **C**：当前冻结构建的真实模型自主运行，中性目标、公开资料、独立评分与复现；证明所选受支持样本上的能力。不能证明任意网站泛化，更不能以一次异常 fail 代替健康对照。人工发现预期无依据时可判失败，不能仅因 assertion 运算正确判缺陷成立。

免费验证次序：相关单元/浏览器测试 → `pnpm format:check`（不要全仓自动 format 覆盖他人文件）→ `pnpm typecheck` → `pnpm test` → `pnpm build` → `test:fixtures`、`test:fixtures:export` → `validate:persistence`、`validate:investigation`、`validate:blocker-review`、`validate:business -- --preflight`、`validate:visual-focus -- --preflight`、`validate:programs -- --preflight` → 新 URL preflight。现有前缀均为 `pnpm`。失败先分析，环境受阻记 blocked，不能改断言。B4 在最终候选构建完整跑一次；小改动仅复查受影响项，交付版本改变则冻结身份更新。

### 10.2 C 首次推荐样本及次数（仅设计，待授权）

选择评价者控制的**独立站点**，不是替换 ARENA_URL 后继续用 checkout 的页面。私有控制服务独立 origin/端口，公开 origin 不暴露变体标签。同一对正常/异常的 URL、目标和公开要求相同，仅私有状态不同；开发集与验收保留集分开。至少有一个保留集布局/文案变体在冻结生产提示后才用于能力验收，不能调优后仍称未见。

首轮 UI 矩阵 5 样本：1 个独立健康目录站（含路径/query、GET 动态加载、同源详情）；2 组正常/异常 UI 对照（1 组通用命中规则、1 组现有 DOM 调查原语）。均不需要业务适配器；公开页面可包含正常产品帮助说明，但不能提示缺陷位置或实验步骤。

- 诊断：5 样本各 1 次，共 5 次，只检查冻结接线和明显能力问题，不算正式通过。
- 正式：同 5 样本各 3 次，共 15 次；每次独立 context/DB 状态，固定 goal、预算、viewport、模型/提供方/开关；至少 1 轮经工作台创建，其余正常 API。
- 两组异常程序/规则应在各自健康对照独立重放验证适用性。健康 Agent 不必为了“生成程序”捏造异常，但必须实际触达控件状态；评价者独立测量正常行为且要求实际 pass，不能用没有 finding、unknown 或 NA 代替。
- 有边界拒绝的 C 诊断额外 1 次（U08），明确为边界能力诊断，不能代替 15 次核心正式矩阵；A/B 仍覆盖全部边界。
- 旧业务：冻结候选构建跑既有 business diagnostic E0–E4 5 次；正式 A/B/C/D 四组共 45 次，沿用原门槛和获批声明。已有结果只有在构建、配置、样本、评分器身份精确一致时才可复用；main 历史成绩不能自动复用。

推荐第一次授权拆为两步：UI 诊断 6 次累计硬上限 **US$2**；诊断可接受后，再申请 UI 正式 15 次 + 业务诊断/正式 50 次及既有 runner 所需 smoke，**包含前一步累计上限 US$10**。金额是成本控制建议而非当前价格估算或支付授权；执行前读取当前提供方价格并在 dry-run 固定 smoke 的实际请求上限/次数。若预计不足，先提交减少为诊断范围或增加预算的方案，不削减正式重复次数后宣称正式通过。

C 模型沿用项目已配置且已有网关支持的主/视觉模型，不做模型比较；冻结时保存精确模型 ID、provider、输出限制、超时、重试、feature flags 和当时价格。全部网关（含 smoke/视觉/恢复）共享累计成本账本；未知 usage/cost 不当零，按保守预留或停止。新目录、失败重试、新 run 都不能重置批次额度。预算不足导致的未跑行记 blocked/未执行，整体不通过，保留之前结果。

### 10.3 冻结与独立判定

任何付费调用前：确认用户授权的批次/次数/累计金额；固定提交 SHA、源码/lockfile/编译产物、配置（脱敏）、策略/提示/工具版本、fixture、私有评分器、批准规则来源、全部样本/顺序/次数/阈值；输出 manifest 和预定全矩阵，dirty tree 不进入正式验收。沿用 build-identity，并把新增 URL fixture/网络策略/评分器和运行配置纳入，避免只检查 dist 一半。

验收器读独立服务器访问/写入计数、单独浏览器按实际记录操作重现、DOM 几何/状态测量、资源正文、证据文件和独立数据库连接；组合核对正式 API。不得 import 生产 verdict 函数计算自己的“正确答案”，不得只看 report.status、Agent 文本或工具 success。私有真值中的缺陷需有产品预期依据，经人工审阅，不能是开发者随便写一个阈值。

评分器先用伪阳性反例证明拒绝：空检查 completed、全 unknown、错目标/错 run、受干预 pass/fail、没有实际交互、healthy 误报、无显式 finish、混构建拼批次、写计数非零、私有答案泄漏、report/DB 不一致。固定模型可以配合这些注入，但不能提高 C 的自主成绩。

首次严格出口建议：15 次核心 UI 正式运行全部满足各自预定结果和完整性条件；健康 3×3=9 次均实际正常验证、零 supported 误报；异常 2×3=6 次各至少 1 项独立确认有效发现，所有 supported findings 均有合理依据，无捏造证据。U09 的非阻断异常应全部 covered/completed。任何 unknown/漏检/环境阻碍记录为相应未通过，不删失败重跑。业务 45 次及其原前置诊断按既有完整门槛，不改为“看起来大部分通过”。这只是小样本发布门槛，不应对外报告成全站准确率。

若某异常确实妨碍后续路径，预先定义 partial/blocked 的正确结果及保留缺口；不能运行后把 expected completed 改成 blocked 来放行。修复任何代码/提示/规则/判定或变更配置后建立新冻结批次；旧失败保留，不能从不同批次挑健康/异常拼成 15/15。

## 11. 兼容、迁移和回退

1. 旧 business 请求（含省略 kind、arena 省略 profile）行为保持；新 UI 契约与旧 business hash/adapter revision 分开。业务 origin/prepare/create/retry/download 权限绝不因 UI 支持而放宽。
2. 新报告按显式 kind 分支；缺 kind/contract 的历史继续 legacy-unversioned。旧 blocked/business unknown 不追溯改为 completed/NA；旧 analysis 只读兼容继续位于 reports。
3. TEXT/JSON 无需破坏性 SQL migration；提供旧 DB 副本恢复测试、新老记录混合列表及 report CLI 测试。不读取当前注册表补旧快照；不能把未知新 schema 当旧契约继续运行。
4. 新 UI 创建受服务器 feature flag（建议 `EXECUTION_URL_SCAN=1`）控制；默认发布值在 B5 交付注明。关闭只拒绝新 UI admission、保留历史读取；已排队/活动运行读取冻结策略版本，不在运行中切换权限。不要在未验证构建中默认展示可用按钮。
5. 回退优先关闭 UI admission、等待或显式取消活动任务、保留报告兼容读端。真正降回 88d63c0 的二进制无法可靠理解新 NA/proof，不允许直接连接混有新运行的生产 DB；停服务备份 DB/证据后用隔离副本回退。不得删新记录掩盖问题。
6. 取消、串行执行、写入未知不重放、跨 run 证据拒绝、终态新连接核验、重启 reconciliation 锁均为硬约束；UI “无写入”不是绕过这些测试的理由。本次不优化自动解除 UI 重启锁。

## 12. 待用户决定事项与已采用默认值

规划和免费实现无须等待新增产品决策：采用本计划的匿名、GET 型动态页面、精确依赖来源、最多 3 页面/1 层、无业务写入、UI Journey 及有限业务审查关闭等默认值。若用户没有修改要求，dev 直接据此实施。

后续**唯一必须先确认**的是付费验收授权：是否同意第 10.2 节批次、累计预算及所选实际模型配置。需授权的原因是本次用户只授权规划，明确禁止启动付费验收；不是技能或隐含流程要求。提出申请前必须先完成可审阅 manifest、完整样本表、费用控制和免费证据。

可选产品取舍：若首批真实目标明确依赖登录、POST 查询或 WebSocket，应由用户选择继续维持 R0 范围并接受这些目标未支持，或显式追加下一版范围；不得由 dev 为提高样本通过率自动放开请求。当前不把这一潜在选择设为开工阻塞。

## 13. 文档更新、开发交付和后续独立验收

### 13.1 开发完成时更新的文档

- README：网址模式使用流程、API 示例、支持/不支持范围、网络依赖和失败说明、可用验证命令。
- architecture：判别任务契约、共享执行器/独立业务能力、network/scope/completion 模块、没有适配器的运行。
- execution-engine：访问与干预、UI finish proof、NA 与 unknown、预算/取消/重启约束。
- composable-investigations：UI 宿主行为，去掉“所有纯 UI 只能 blocked/business unknown”的当前能力描述；保留历史实验语义与局限。
- rules-and-rule-library：capability 路由、无阈值/无 adapter 的明确边界；审批与健康控制要求不变。
- arena-and-evaluation、development：A/B/C 新入口、样本隔离、构建冻结、原始证据和成本；不能把 B 预检写成 C 能力通过。
- 需要时更新 knowledge-and-context：账本和拒绝信息在上下文压缩中的保留规则；`.env.example` 只给非秘密配置示例。
- `docs/product-roadmap.md` **不由 dev 或本规划 Agent 改写**。交给维护 Agent 的建议：规划已交付，R0 仍待实施/验收；验收后才更新具体能力及阶段出口。

长期能力文档只能描述实际实现与有对应证据的验证；未完成项目明确标注。计划保留到独立验收与维护 Agent 同步完成，之后按 development 约定将长期契约并入 docs 并由相应负责者清理计划，不提前删除验收标准。

### 13.2 dev 必交证据包

推荐 `data/r0-url-scan/<timestamp>/`，Git 中计划/文档引用本机证据路径与摘要，密钥/DB/原始模型请求不提交公开仓库。至少交付：

1. 提交 SHA 或精确 diff 范围、基线与现工作区差异；每批 commit/文件清单，不夹带维护 Agent 的文档修改。
2. 实际功能映射到 B0–B5/U01–U20；所有计划偏差及理由，未满足项显式列出。
3. 实际执行命令、开始/结束时间、环境/Node/浏览器版本、退出码、完整 stdout/stderr；没有运行的检查写“未运行”。
4. manifest/build/config hashes，API 创建请求/响应、事件 JSONL、report JSON、数据库快照及独立读取结果、artifact 索引/摘要、真实 workbench 截图。
5. fixture/私有真值和评分器版本；模型输入泄漏审计、所有正常/异常结果、程序重放、干预拒绝和写计数证明。
6. 已知限制、失败、unknown、环境阻碍、未完成事项；A/B/C 分栏。若没有 C 授权，明确 C 未执行，不把预检填进 C。

### 13.3 收到开发结果后的本 Agent 职责

先确认交付与证据为同一构建，再逐项读差异、体验正式流程、核对私有证据并运行必要的独立 A/B；可复用充分原始证据，但不能只引用 dev 总结。需要付费时先完成冻结方案和免费检查，在明确授权额度内执行。

问题分类：实现缺陷 / 方案缺口 / 证据不足 / 环境阻碍。报告给“通过、部分通过、未通过”，每项列复现、预期、实际、证据、影响和复验条件；不能把“部分通过”写成 R0 完成。本 Agent 不代改产品代码。若维护验收脚本，记录修改原因，保持原预期；若计划错误，明确修订版本/原因/影响，再交给 dev，不偷偷降低标准。

整改提示词须包含：交付 SHA 和配置、失败 U 编号、最小复现、实际/预期、证据路径、允许变更范围、必须复验的矩阵及哪些旧批次作废。未经授权不向其他 Agent 自动发送。

验收结束交给 Roadmap 维护 Agent：提交/配置；实际能力；每个阶段出口结果及证据；支持边界和未验证范围；未完成事项；建议修改的文档内容；继续 R0 整改还是可进入 R1 的理由。维护 Agent 核对后决定 Roadmap 状态，不自动推进。

## 14. 可直接转发给 dev Agent 的实施提示词

```text
你是 UI Sentinel 的 dev Agent。请实施 plans/r0-url-scan-plan.md（2026-10-06，版本 1）的 R0“网址扫描与独立 UI 检查闭环”，先完整阅读该计划及其引用文档，核对实际代码后依 B0→B5 交付。

产品基线：main@88d63c05b1c6df509498b4fd17122dd6d62f4b73。规划时工作区已有 README.md、docs/architecture.md 的 Roadmap 链接修改及未跟踪 docs/product-roadmap.md，属于维护 Agent；不要切换/覆盖/顺手提交他人工作。开始时记录当前提交和新差异，代码变化影响方案时说明；不要把 Roadmap 规划能力当已实现。

目标：用户在正式工作台/API 输入完整 URL 和可选短目标，无专用业务适配器即可完成有界匿名 UI 检查，保存证据和未验证范围，业务结果显式不适用；购物/导出原业务结果及写入契约保持。采用判别任务契约，共用现执行器、工具、规则及调查程序。不要加第二套浏览器 Agent 循环，不用空购物适配器凑 UI 模式，不将 business unknown 改 success，不删除 finish/持久校验。

关键范围：匿名 HTTP(S)、完整 path/query/fragment、有界同源导航、局部无业务写入交互、GET 型动态数据和明确声明的资源/API origin。方法/按钮文字均不等于完整副作用语义。POST 查询/登录/WS 等依赖首版报告为不支持，不能偷偷放行。网络逐跳派发前判定与实际地址边界必须真实浏览器验证。干预后的页面不能产生原站点 pass/fail；所有动作和程序 act 共用权限、预算和取消。

实现计划定义的检查账本、UI 完成证明及持久报告；空规则队列、工具成功或模型自称完成均不足以完成检查。有验证缺陷也可 completed；已选未验证事项必须保留为 partial。旧报告、旧业务 hash、创建/重试/下载/未知写入隔离与证据归属全部兼容。

每批按计划进入条件/出口独立验证并交付。先做好 A 单元+真实浏览器和 B 固定模型正式 API/workbench 预检，再准备 C 冻结清单。当前不授权任何付费模型验收，不运行 real/diagnostic/formal/smoke 等可能付费入口，不自行找其他 Agent 派发任务。缺真实验收授权不阻塞免费实现与交付；最终清楚标 C 未执行及 R0 待独立验收。

生产提示词只能包含通用能力、任务及公开资料，不能含测试 case ID、固定操作答案、缺陷位置、私有真值/评分逻辑。健康对照必须实际正常验证，unknown 和 not-applicable 不能替代 pass。评分器必须能拒绝假阳性，并用独立服务计数、浏览器测量与持久记录验证，不复述系统自报。

提交开发结果时提供：提交标识/精确 diff、每批交付和 U01–U20 对照、实际计划偏差、执行命令/原始日志/退出码、验收证据及 hash、所有已知失败/unknown/限制/未完成事项、C 的待授权 manifest。更新实际能力文档但不改 docs/product-roadmap.md 的状态；给维护 Agent 提供同步建议。不要提前宣布 R0 完成或进入 R1。

如发现计划本身不可实现或存在权限/完成语义冲突，先提交具体源码事实、影响与最小修订建议，保留已可完成的独立工作；不要通过放宽断言、隐藏失败、改变预期或拼接不同批次制造通过。
```
