# 下一步开发任务书：业务契约与第二个完整业务

状态：待开发；本任务书及[完整验收计划](business-contracts-acceptance.md)共同构成完成标准。[交接模板](business-contracts-handoff.md)用于逐项记录实际进展。面向接手的开发 Agent，不要求重新设计架构。

代码基线：a53c751（main，整理后的版本）。实际开工以包含本任务书的 main 最新提交为基线，记录准确 SHA。基线已有 387 项测试及本地集成验证；真实模型历史成绩见 ../docs/validation-baseline.md，不能当作新实现的验收结果。

## 0. 可以直接交给开发 Agent 的指令

> 请完整实施本文件和 business-contracts-acceptance.md。先读取指定代码，再按 P0–P6 顺序开发；每阶段通过其门槛后继续，不要每完成一个阶段就等待用户确认。普通实现和修复无需再次申请许可。最终交付包括真实验收、全部失败记录、交接说明和可 review 的分支，不能只写代码或停在单元测试通过。
>
> 沿用现有技术栈和模型配置，不扩展性能优化范围，不降低验收门槛，不伪造真实模型结果或人工批准。缺少凭据、原批准记录或必须新批准规则时，先完成所有不依赖它的工作，再清楚报告具体阻碍；未完成的门槛必须保持未通过。完成后交回主 Agent review 和更正，不自行宣布已通过主 Agent 审查。

在 dev/business-contracts-export 分支开发；分支已存在时检查并继续其已授权工作，不覆盖他人修改。阶段性提交，最终 push 此开发分支；不要自行合并 main。若支持 PR，可建立指向 main 的 draft PR，说明问题、行为变化和证据。交付 git bundle 也必须包含准确 base/head SHA。用户交给其他 Agent 执行，不要求当前 Agent 创建新的任务。

## 1. 本阶段结果与范围

用同一执行器完成两个业务：现有购物，以及“导出任务失败后恢复”。新增业务主要通过版本化配置与可信适配器接入，通用执行器不得按 checkout/export、页面标题或 case ID 特判。

交付包括：两个业务配置、事实适配层、副作用策略、业务隔离的路径复用、React 导出靶场、私有评分器、Web 选择入口、可重复验收命令及证据。

继续使用 Mastra Core、Playwright、Midscene/Qwen、Hono、libSQL、React、Biome。保持单写入队列、原子调查、现有有限阻断审查。禁止新模型筛选、后台视觉分析、并发业务写、多机调度、插件平台、向量库和 PRD/Figma 自动解析。不要重写整个执行器，也不要只改命名而继续依赖 orderId。

## 2. 开工先读这些代码

| 现有位置 | 必须处理的耦合或责任 |
| --- | --- |
| src/agent/policy.ts | 购物目标、固定五秒重试、十秒反馈、一笔订单限制 |
| src/execution/executor.ts | businessResponses、orderObserved、verifiedBusiness、网络监听、动作后等待、Agent 输入、结束摘要 |
| src/execution/rule-binding.ts | retryTrigger 当前要求 orderId、购物失败字段和当前页面关联 |
| src/execution/task-state.ts | payment-success/payment-rejected；处理中响应不能使未触发分支提前视为完成 |
| src/rules/builtin/business-outcome.ts | 订单 ID + 页面反馈关联 |
| src/rules/builtin/response-time.ts | 固定 10000ms 阈值，需要来自版本化要求 |
| src/execution/journeys/library.ts | 当前仅按 environmentId 复用，存在 order 文本过滤 |
| src/execution/browser.ts | 页面/导航边界；不能为新靶场放开任意地址 |
| src/execution/temporal-investigation.ts / finish-contract.ts | 调查、收尾、测量和不完整证据边界 |
| src/agent/decisions/blocker-review.ts | 沿用保守跳过条件，不扩大自动结束权限 |
| src/shared/types.ts / execution/run-manager.ts | RunSpec 的创建和 JSON 持久化 |
| src/server/routes/runs.ts | 当前只允许 ARENA_PORT；新配置选择和环境验证 |
| src/server/reports/run-report.ts / storage/database.ts | 新旧报告兼容，单事务读取与可靠终结 |
| src/server/evaluation-access.ts | 私有控制、准入锁、重置/核对边界 |
| src/web/main.tsx | 创建任务与报告界面，当前不是独立 RunForm 组件 |
| scripts/validation / evaluation/private / evaluation/support | 正式 API 验收、固定模型网关、私有评分及来源审计 |
| scripts/build.ts / dev.ts / pnpm-workspace.yaml | 第二靶场的开发与编译启动 |

行号会变，以符号为准。测试里的购物例子、购物适配器以及历史只读兼容可保留购物词汇；不能用全仓替换将所有 order 改为 operation。

## 3. 固定的接口与模块边界

以下是本阶段应实现的最小契约。字段可因现有类型约束补充，语义不可删减。确需改接口时先在交接记录写明原因并保持同等验收，不应另造通用 DSL。

建议目录：

```text
src/business/
  types.ts                 配置/规范化事实/副作用判定
  schema.ts                严格配置校验
  registry.ts              注册已知版本、解析与冻结
  runtime.ts               当前操作、事实版本、终态、重试资格
  adapters/checkout.ts     购物公开协议
  adapters/export.ts       导出公开协议
  profiles/checkout.ts     购物公开要求及策略
  profiles/export.ts       导出公开要求及策略
arena/export/              React 页面、业务服务、独立私有控制器
evaluation/private/export/ 私有变体、评分器、评分反例
scripts/validation/business.ts  本地预检/诊断/正式验收编排
```

### 3.1 配置选择、冻结与兼容

新增 GET /api/business-profiles，返回两个已注册配置的 id、revision、名称、公开要求、可选环境与默认入口；不返回控制 token、私有端口或变体答案。

POST /api/runs 增加可选 businessProfile: { id, revision }。固定 ID 为 checkout / export，初始 revision 为 1（字符串）。environmentId 保留已有 arena/default，并增加 export-arena。注册表决定配置与环境的合法组合，environmentId 不能代替业务契约版本。

兼容规则：省略 businessProfile 且使用旧 arena 入口时解析为 checkout@1。明确指定未知 ID/版本、配置与环境不匹配、default 环境缺少明确配置均返回 400；不可静默降级。缺凭据仍按已有 503 处理。非法请求不得入队或启动浏览器。

创建任务时将完整解析后的业务契约保存入 RunSpec.businessContract，至少包含：

```ts
interface BusinessContractSnapshot {
  schemaVersion: '1'
  profileId: 'checkout' | 'export'
  revision: string
  adapter: { id: 'checkout' | 'export'; revision: string }
  requirements: {
    id: string
    revision: string
    text: string
    source: { kind: 'project-config'; ref: string }
  }[]
  retryAvailabilityMs: number
  feedbackWarningMs: number
  effects: { maxCreates: number; maxRetriesPerOperation: number }
  environment: { id: string; entryUrl: string; publicOrigin: string }
  hash: string
}
```

严格验证类型、正整数及调查工具当前支持的时间范围，初始两配置均为五秒重试与十秒可见反馈；checkout 的 maxCreates=1、maxRetriesPerOperation=0，export 为 1、1。schema 是只读数据，不接受源码、函数、任意模块路径或模型提供的私有 endpoint。

hash 对不含 hash 本身的规范化完整快照计算 SHA-256，稳定排序；adapter revision 必须包含。相同内容产生相同 hash，要求/策略/解析环境变化产生新 hash。快照先持久化再入队；活动任务不重读可变配置。后续进程不能加载该 adapter 版本时明确停止并保留原因，不套用当前最新版。

旧 RunSpec 无该字段：历史报告显示 legacy-unversioned，绝不根据今天的默认配置伪造历史要求；不重写旧记录。重启未完成旧任务仍 interrupted、不重放。仅新建兼容任务获得 checkout@1 快照。

报告增加业务配置摘要、hash、要求来源、adapter 版本及已验证操作身份。工作台选择业务配置并发送真实 API 字段，报告刷新后仍显示当次快照；不需要配置编辑器。

### 3.2 公开事实适配器

适配器只解释浏览器已观察的公开请求/响应和页面事实，不自己调用业务 API，不持有 Page、数据库客户端或私有控制器。可信代码通过 registry 解析，不允许 Agent 动态注册适配器。

建议接口：

```ts
interface BusinessAdapter {
  id: string
  revision: string
  classifyRequest(request: PublicRequest): RequestIntent
  decodeResponse(exchange: PublicExchange): DecodedFact | null
  correlateVisible(fact: BusinessFact, observation: PublicObservation): Correlation
}
```

RequestIntent 至少区分 read、prepare（明确允许的准备性写入）、create、retry（必须关联 operationId）和 other-write。null 表示非业务响应，不是成功。runtime 在持久化公开来源后生成 BusinessFact，不允许适配器捏造证据 ID。

BusinessFact 至少包括 schemaVersion、profile/hash、operationId、attempt（首次为 0）、version、phase、result、retryEligibility、observedAt、sourceEventId、evidenceRefs。phase 区分 processing、succeeded、rejected、failed；result 沿用 success/rejected/unknown。retryEligibility 区分 allowed/denied/unknown，并保存冷却、剩余次数、处理中和前置条件的依据。只有明确允许才能触发 retryable-failure。

监听匹配的 POST 响应，也监听匹配的 GET 状态查询。业务请求识别必须按已选适配器的 origin、method、path 和响应 schema，不能以任意 JSON 里存在 success/status 判断。读取失败/截断、不合法 ID、无归属响应不可升级为可靠事实。

统一追加 business:fact 事件供通用逻辑消费，sourceEventId 引用公开响应证据；原 business:response 可以保留原始公开字段供审计与旧购物 scorer 使用。购物兼容字段只能由 checkout 适配器产生，export 不生成虚假的 orderId。更新规则路由/触发读取到规范化事件，同时保留旧记录只读支持。checkout 协议没有 attempt/version 时，适配器以本 run 的已关联请求生成 attempt=0 与稳定事实版本；不要要求修改原购物服务协议。

request/response 关联到本 run 实际派发的请求与 action，不能接纳预先存在的其他任务状态。异步响应监听通过有序事实提交队列落盘，观察、结束和退出前有界排空；取消后迟到响应不能重新打开任务或改写终态。读取响应体耗时计入原预算，不能引入无限等待。

operationId 是实体身份，attempt 是该实体尝试次数；事实去重/排序键包含两者与业务状态版本。乱序旧响应不能覆盖新成功，同一失败的重复 GET 不能重复触发新调查或刷新已消耗的重试额度。

页面终态需当前操作身份和明确反馈与公开事实关联。另一个任务的成功、仅按钮出现 success 文本、伪造字段或消息缺失均不能证实成功。已核实终态在普通导航后可保留，更新的矛盾事实或新操作会使其失效。

### 3.3 副作用策略

共享执行器统一调用策略判定，不写 if(profileId === 'export')。允许策略读取规范化状态与动作意图，但不得按按钮文案决定实际网络写权限。

购物的 POST /api/cart/add 和 /api/cart/remove 属于 prepare，POST /api/checkout 才消耗 create 额度；准备动作受原动作预算限制，订单产生后仍禁止这些写入。导出不声明 prepare 写权限。没有明确允许的 other-write 默认拒绝，不能把所有 POST 都算作创建或全部放行。

创建预算在请求派发前预留，不等响应回来才计数。导出允许一个实体及其一次被明确允许的 retry；retry 必须属于该实体，不能被实现为第二次 create。重复点击、并发重复请求、未知 operationId、跨实体 retry、禁止状态的 retry 均不能越过限额。

写请求未知结果（超时、断流、服务端已写入但响应不明）继续使用 reconciliation-required；不自动重放、不靠 GET 猜测取消隔离。202 且已确认 jobId/processing 是已接受操作，不应一律当作未知写入；之后允许公开只读查询，等待明确业务状态。

不明确的写请求返回拒绝/未知并记录理由。只读 Journey 保持所有写入禁止。策略拒绝记录 write:denied 和 evidenceIntegrity 干预；因此造成的 UI 失败不能提交为原产品缺陷。

### 3.4 规则、路径和 Agent 语义

业务层暴露规范化触发，规则绑定不再读 orderId。retryable-failure 名称保留，以兼容已批准规则。补充 business-success/business-rejected；payment-* 仅在 checkout 兼容边界映射，export 不伪造支付事件。

processing 不是完成业务判定，不得据此将剩余条件标为 not-triggered。阶段状态必须保留后续成功、拒绝、重试仍可能发生的事实。已测量的旧失败可以保留为历史证据，但不能覆盖新的恢复成功或被当作当前重试资格。

rule_check 仍由 Agent 提供语义绑定，执行器验证 sourceEvent、当前 operation/attempt、元素引用与页面归属。已有规则 expectation.target 的 “Retry button” 是语义采样键，不要求实际按钮文字相同；不要改声明来配合新页面。

原子调查、测量窗口和四态结果不变。没有需求阈值不可套用另一业务的阈值；response-time 读取当次快照要求，标题/expected/details 同步更新。反馈时延是动作到可见反馈，不把 processing 后完整后台任务时长误当成同一指标；本阶段不实现新的业务完成 SLA。

Journey 标识/缓存须包括 profile hash、adapter revision 与 origin，跨业务/版本/环境不可复用。旧无契约 Journey 不参与新任务复用，但旧报告仍可读。仍只复用已取证的只读步骤，移除通用库里依赖 order 文本的业务过滤。

policy.ts 组合通用探索指令与业务公开要求/操作限制。page_act 描述、Agent 输入、完成摘要、规则输出都不能继续声称所有任务只准一笔订单。不要把“按业务要求探索”变成硬编码导出步骤脚本，目标选择和恢复操作仍由 Agent 决策。

## 4. 导出靶场的固定业务协议

独立 React 业务界面，用户选择公开数据集和导出格式后提交，查看任务编号、状态和通知。公开数据集/格式至少各两个选项，初始未选择；Agent 需要实际填写/选择，不能仅点击一个预置按钮。使用带可访问名称的两组原生 radio（格式包括 CSV/JSON），现有 page_act 的 click 即可操作；不为本靶场新增 selectOption 工具或依赖特殊 test ID。

公开入口例：POST /api/exports 创建任务；GET /api/exports/:jobId 查询；POST /api/exports/:jobId/retry 重试同一任务。页面通过只读轮询或等价公开更新显示异步状态，适配器需要正确处理 GET 事实。

响应使用独立协议，不把购物字段换一个标签：

```json
{
  "jobId": "job-<random>",
  "attempt": 0,
  "version": 2,
  "phase": "failed",
  "notice": "Export could not complete. You may try again.",
  "retry": {
    "permitted": true,
    "remaining": 1,
    "afterMs": 0,
    "prerequisitesMet": true
  }
}
```

初始 create 返回 202 + jobId + processing；之后服务端更新为成功、合理拒绝或允许恢复的失败。成功具有真实可读取的导出产物，GET 下载是只读操作，不必强制 Agent 下载才算成功。合理拒绝具有公开原因，retry.permitted=false。服务端按私有变体控制行为，不能把 E0 等标识暴露到 UI、公开响应、URL 或浏览器资源中的条件分支。

五个固定变体及预期详见验收表。E1/E2 公开业务失败相同，唯一关键区别为恢复控件能否操作；E4 是 E1 的语义迁移版本，改变布局和操作文字（如“重新生成”），业务协议不变。健康重试可立即操作并保持直到点击，消除“模型来晚了”对正反例的歧义；缺陷变体持续不可操作，直到重置。

页面展示 operationId 与公开通知，便于独立核对。随机 ID 不能含变体名。至少加入一个清楚属于其他功能的操作，防止按唯一按钮盲选；不人为提供定位属性给 Agent。

workspace 包名使用 arena-export，避免和现有 arena 重名。建议默认 EXPORT_ARENA_PORT=4183、开发用 EXPORT_API_PORT=4184、EXPORT_CONTROL_PORT=4185，生产公开 API 与 UI 同源；测试分配独立临时端口，配置快照保存实际 origin。更新 .env.example、pnpm-workspace.yaml、scripts/build.ts/dev.ts 及正式启动命令；不要覆盖已有购物端口。

私有控制服务使用独立 loopback 端口及控制 token。能重置、读取任务/尝试/产物计数与请求审计；活动、排队或待核对任务存在时拒绝重置。浏览器不可访问控制器、评分源码或评估数据。沿用同源公开 API；新增 export 端口/环境明确注册，不泛化成任意 URL 访问。

## 5. 实施顺序与阶段门槛

### P0：审计并建立交接记录

先在 plans/business-contracts-handoff.md 建立记录，列 base SHA、业务耦合表、阶段状态、命令/退出码/证据链接及未决事项。记录基线验证，不调用模型。后续只维护这一个交接记录，不新建每日 plan。

通过条件：第 2 节每项有归属说明；确认旧批准记录是否可读取，但不改它，不输出密钥。完成后继续 P1。

### P1：配置、API、冻结与历史读取

实现 src/business 契约与 registry、RunSpec 快照、API 选择/边界、报告摘要。先保留 checkout 行为，export 可以注册公开定义但不得宣称尚未实现的适配器可运行。

通过条件：验收 C02–C08 和 C01 的 checkout 分支；合法新任务冻结，非法任务拒绝，旧报告无伪造元数据。C01 的 export 分支待 P3 适配器完成后补齐，明确记为待验。测试完成继续 P2，不停在“schema 已做好”。

### P2：抽取购物并保护运行语义

将购物解析/关联/副作用移至适配器和配置，接入规范化事实、task-state、规则绑定、反馈阈值、Journey 隔离。允许薄兼容层保留旧事件字段，但必须集中在购物适配器，不能由导出伪造 orderId。

通过条件：购物相关现有回归及 B/P/R 中购物和通用契约用例通过；依赖真实 export 的用例在 P3/P4 补齐，不能预填通过。原有取消、迟到动作、核对隔离、可靠完成测试保留。现有免费预检全部通过后继续 P3。不要在这里只凭类型通过就开始付费验收。

### P3：导出业务与适配器

实现真实异步业务、五变体、私有控制器、export 适配器，扩展 workspace、构建和显式启动命令。公开素材与私有答案分离。不得通过让前端消费 case 参数选择缺陷。

通过条件：验收 F 类；脚本独立操作真实浏览器验证五变体及计数，使用固定本地模型通过实际 Mastra/Server/Chromium 集成，无付费请求。验证GET轮询与重试实体不变。

### P4：Web、规则迁移与验收工具

工作台选择配置、创建任务、查看当次要求与终态；UI 演示通过。实现验收命令、评分器反例测试、旧获准规则的只读导入与隔离复查。不新增规则审批，除非确有声明变更。

通过条件：补齐 C/B/P 的 export 分支并通过全部 R/U/E，至此 G0–G3 无待验条目；新的私有评分器能拒绝“快速 finish 但没完成业务/调查”的假阳性；未知问题模式确保没有等价重试规则，规则模式确保原规则确实执行。

### P5：冻结后完成真实验收

按配套验收计划顺序：smoke → 五例诊断 → 修复并重新冻结（如需）→ 正式四组 45 轮及持久化审计。只在最终候选上跑完整矩阵，日常修改使用针对性免费回归，不每阶段跑 45 轮。

冻结前提交代码；模型批次运行过程中只写忽略的 data 目录，避免更新 tracked handoff 导致子 runner 的干净提交检查失败。整批结束后再提交结果索引/文档，并在交接中区分“实际验收代码提交”和“仅补充文档的最终提交”。

原批准缺失等外部阻碍不允许伪造；完成可做部分后报告 blocked。除明确阻碍外，继续到真实验收结束，而不是让用户逐条催促。

### P6：交付主 Agent 复核

更新 README 和相关 docs 的当前实现/限制，完成 handoff 清单，push 开发分支或交付 bundle。主 Agent 再 review、复核证据、重现问题并更正；dev 自检通过只是 ready-for-review，不是最终接受。

## 6. 不允许的“捷径”

- 让导出接口返回 orderId/canRetry/success 来骗过购物逻辑。
- 仅将硬编码搬到以业务名称分支的巨大函数，通用执行器仍解释业务字段。
- 根据页面文字“成功”、HTTP 200、无适用规则或无报错宣称完成。
- 把 processing、预期拒绝与技术失败合并成同一个终态。
- 禁用已有未知写保护，或将新任务创建伪装为一次 retry。
- 直接修改数据库将候选标为 approved/enabled，或把 prepared.json 里的候选当成最终批准证明。
- 让 scorer 接受模型自报成功而不核对独立业务和证据。
- 缩短五秒真实测量、放宽超时/调用上限、关闭检查、删除失败样本换取通过。
- 用固定模型预检、单次演示或旧基线声称新的真实模型验收完成。
- review 尚未结束便删除本任务书/验收/交接记录或合并 main。

完成定义、失败处理、命令和证据格式以[完整验收计划](business-contracts-acceptance.md)为准。
