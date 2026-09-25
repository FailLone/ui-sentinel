# 业务契约与导出业务：完整验收计划

与[开发任务书](next-development-plan.md)配套执行。本文表格是强制检查项，不是参考建议。下文“需实现”记录任务下达时的要求；当前实现与实测结果见[交接记录](business-contracts-handoff.md)，不得把计划描述当成运行结果。

## 1. 验收层次和完成状态

| 门槛 | 内容 | 是否调用真实模型 |
| --- | --- | --- |
| G0 | 格式、类型、构建、基线回归 | 否 |
| G1 | 配置、事实、副作用、规则、隔离和旧记录的契约测试 | 否 |
| G2 | 两个真实靶场、正式 API、Mastra SDK、Chromium、本地固定模型集成 | 否 |
| G3 | 工作台操作、报告刷新和非法配置提示 | 否，可用固定模型 |
| G4 | 真实 DeepSeek/Qwen smoke 与导出五例诊断 | 是 |
| G5 | 同一冻结构建的四组正式验收及停服审计 | 是 |
| G6 | 开发自审、完整交接、主 Agent review 与更正后的复核 | 按实际改动决定 |

G0–G3 全通过才进入 G4。诊断通过不是正式通过。dev 的最终状态只允许 ready-for-review、failed 或 blocked；G6 的 reviewed/accepted 由主 Agent 在复核后写入。

## 2. G0：保留的免费基线

从干净依赖安装开始；模型凭据不要写进输出、截图、数据库导出或 Git。

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:fixtures
pnpm validate:persistence
pnpm validate:investigation
pnpm validate:blocker-review
```

原六个购物靶场、六次持久化预检、原子调查和有限审查继续通过。当前基线 387 项测试应保留其行为覆盖；必要的类型/数据迁移可以更新测试，但每个删除或弱化的断言都要在 handoff 解释。通过数量增加不是质量门槛的替代。

## 3. G1：必须覆盖的契约与反例

每个 ID 对应至少一个可重复自动化断言，可以多个 ID 共用一个集成测试。正常路径和反例都要实际跑，不以 TODO、skip 或说明文字替代。

### 配置与持久化

| ID | 输入/场景 | 必须结果 |
| --- | --- | --- |
| C01 | checkout/export 合法 id+revision+环境 | API 202，任务持久快照、hash 和注册版本匹配 |
| C02 | 未知配置/版本、未知字段、错误时间阈值、含源码字段 | API 400，不入队、不启动浏览器 |
| C03 | export 配置配购物环境或任意第三方入口 | API 400；配置不能放宽网络访问边界 |
| C04 | 旧 arena 请求省略 businessProfile | 新任务解析 checkout@1；显式错误配置不能回退 |
| C05 | default 请求缺明确配置 | API 400，不能猜购物业务 |
| C06 | 规范化相同配置；改变一个要求/策略/环境/adapter 版本 | 前者 hash 相同，后者不同；快照先于执行写入 |
| C07 | 排队后改变注册配置/重启且旧 adapter 版本不可用 | 使用原快照；版本不可用明确失败且没有业务动作 |
| C08 | 从旧结构创建历史数据库并重启、读取报告 | legacy-unversioned，原状态/证据不变；未完成任务 interrupted，不重放 |

旧结构数据库测试用临时数据库构造代表性记录，不写真实用户数据库。至少覆盖旧已完成、blocked、旧 analysis 记录和 interrupted 四类。报告仍经单事务读取，完成后的新连接核验不能被去掉。

### 业务事实与状态

| ID | 输入/场景 | 必须结果 |
| --- | --- | --- |
| B01 | checkout 公开成功/拒付/可重试失败 | 与原判定一致；购物 parser 已在适配器 |
| B02 | export POST 202 后 GET processing → succeeded | 成功来自已关联终态 GET+UI，不在 202 时提前完成 |
| B03 | failed+允许重试 vs rejected+原因 | 前者 result=unknown 且可触发调查；后者 rejected，不能混用 |
| B04 | 非业务 URL 返回 success/orderId、别的 job 成功、页面仅出现 success | 不影响当前业务结果，不产生伪触发 |
| B05 | 缺 jobId、畸形 JSON、body 读取失败、UI 缺身份/通知 | unknown 或无可用事实，不能匹配为成功 |
| B06 | 旧失败响应晚于新成功、重复同一 GET、不同 attempt | 新成功不被覆盖，重复事实不生成重复调查/额度；新 attempt 重新关联 |
| B07 | 普通导航离开已验证终态；之后出现新实体/矛盾版本 | 前者保留已取证结果，后者失效并重新判断 |
| B08 | processing 时有未触发成功/失败分支 | 不清空待验证范围，不接受无依据 scope-covered |
| B09 | retry 冷却、remaining=0、进行中、前置条件未满足、未知资格 | 不产生 allowed 触发，不因为按钮叫 Retry 判缺陷 |
| B10 | 响应监听尚未落盘即观察/结束、取消后迟到 GET、旧任务预存状态 | 有界排空并按版本提交，已结束任务不被改写，不能认领其他任务 |

### 副作用与环境

| ID | 操作/故障注入 | 必须结果 |
| --- | --- | --- |
| P01 | checkout 获得订单后尝试第二次支付/写入 | 保持原一笔订单限制，拒绝并记录干预 |
| P02 | export 创建后允许重试同一失败实体一次 | 一个 job、attempt 0→1；恰好一次重试，最终可成功 |
| P03 | 重复创建、重复重试、两个紧邻请求、伪造其他 operationId | 预留额度阻止越界，不能等首个响应才限制 |
| P04 | 服务端已创建但响应断流/超时，Agent 重试同一动作 | reconciliation-required，不重放；明确未知业务结果 |
| P05 | 已知 202 processing，随后合法 GET 轮询 | 可继续只读等待，不因正常异步模式误隔离 |
| P06 | 未声明写 URL 或只读 Journey 触发写 | 拒绝并记录理由；受干预证据不能支持产品缺陷 |
| P07 | 取消时模型/页面响应迟到 | 原迟到派发保护仍生效，无额外业务写 |
| P08 | 私有控制 URL/端口、重定向、跨 origin、编码绕过 | 浏览器不可访问；拒绝明确，允许地址不扩大 |
| P09 | 队列、活动任务或待核对锁存在时重置新靶场 | 私有 reset 返回冲突；错误 token 拒绝，不清空业务状态 |
| P10 | 购物 add/remove cart 后再 checkout；订单后再改 cart | 前者正常且只消耗一次创建额度，后者保持只读限制；未声明写仍拒绝 |

P03 的并发是测试注入的页面双请求，不是新增多个并行 Agent。未知操作不以自动 reset 或 reconcile 冒充恢复；私有操作者核验才允许解除锁。

### 规则、作用域与结束

| ID | 场景 | 必须结果 |
| --- | --- | --- |
| R01 | 同一获准重试声明分别绑定订单与导出任务 | 声明 hash 不变，两类 operationId 均可用，不依赖 orderId |
| R02 | 按钮文案变为“重新生成”，页面还有别的操作 | Agent 语义绑定目标；采样 target 仍取声明的语义键，不复制按钮文字替代声明 |
| R03 | 旧事件、错 run、错 operation/attempt、陈旧/歧义元素 | 拒绝或 unknown，不选第一个继续 |
| R04 | 完整五秒皆 false；出现 true；缺样本/值为 null | 分别 fail、pass、unknown；不把不足五秒当 fail |
| R05 | 重复 GET、已完成检查后再次请求同一调查 | 复用合法结果，不重复 finding；状态版本改变后允许重新判断 |
| R06 | 相同页面标题/路径但 profile hash、origin 或 adapter 版本不同 | 不复用旧 Journey/规则测量缓存；旧无契约 Journey 不加载 |
| R07 | 改变 feedbackWarningMs/没有可靠时间证据 | 使用当次配置；不套固定十秒，缺证据 unknown/not-applicable |
| R08 | processing/有安全恢复/未决假设时请求 finish 或 Jev 建议结束 | 拒绝清洁完成或跳过有限审查，保留未覆盖范围 |
| R09 | runtime 已清洁完成、提交/读取注入不一致 | 隔离并拒绝假完成，不能返回用户可见 completed 假结果 |

R01 的单元测试可以用显式测试声明；真实迁移门槛必须使用有批准来源的规则。页面只显示 disabled 是假设来源，不能替代时序测量。

## 4. G2：导出真实靶场与免费集成

需实现 pnpm test:fixtures:export 和 pnpm validate:business -- --preflight。前者直接以浏览器与私有控制器独立检验变体；后者使用实际编译服务、Mastra SDK、Chromium，但仅连接明确的本地固定模型服务。

| ID | 靶场/集成要求 |
| --- | --- |
| F01 | 数据集与格式初始未选；必须实际填选，合法提交才创建 job |
| F02 | E0–E4 分别通过本节后面的私有业务真值与动作计数 |
| F03 | create 返回 processing，GET 确实驱动异步终态，非静态前端伪造 |
| F04 | E1 与 E2 的失败公开协议一致，只有 UI 可操作性不同；E2 后端确实允许 retry |
| F05 | E4 改名/改布局，同一 API 协议；没有业务适配器专用 selector |
| F06 | 页面、响应、URL 和发布的客户端资源不暴露 E 编号、故障描述或私有控制配置 |
| F07 | 私有评分可核对 jobId、create/retry 次数、attempt、产物和来源请求；重置可重复且隔离 |
| F08 | 编译产物启动与 dev 启动均可用，前端 React，无新增 Vue 依赖 |

preflight 需要通过实际 HTTP 创建任务，不能直接调用 executeRun。至少完成 E0–E4 的固定模型运行，再注入一次未知写入和一次非法 finish，验证系统阻止它们。它证明契约可执行，不能写为“真实 Agent 自主发现通过”。

## 5. G3：工作台验收

| ID | 操作 | 验收结果 |
| --- | --- | --- |
| U01 | 选择购物/导出配置并创建任务 | 请求字段及实际环境正确，任务属于所选 profile |
| U02 | 完成后刷新、重开历史报告 | 要求版本、hash、adapter、业务结果、日志和证据恢复 |
| U03 | 打开旧报告 | 显示未版本化历史，不套用当前业务要求 |
| U04 | 非法配置/不可用版本/模型缺配置 | 清楚显示 API 错误，不创建空成功任务 |
| U05 | E1 健康恢复与 E2 缺陷报告 | 可查看真实恢复成功或完整测量/截图，不靠一段模型总结 |

用浏览器自动化或记录实际手动步骤及截图；至少保存创建表单、导出成功报告、缺陷证据三张图。不得使用生成图代替真实 UI。UI 验证不要求新 E2E 框架，复用 Playwright。

## 6. 五个固定业务变体

所有被测 Agent 得到同一普通任务：“使用可选公开数据集生成一份 CSV 导出，检查该流程及其实际触发的恢复体验；遵守公开要求与操作限制，有依据地报告并结束。”给任务目标与要求，不提示变体、哪一步坏了或应该找到什么缺陷。

公开要求：可恢复失败应在五秒检查窗口内提供可操作的恢复入口；明确允许时可重试同一任务一次；合理业务拒绝不当成产品故障。服务端私有策略决定变体，公开合同在五变体间 hash 相同（在同一环境中）。

| 变体 | 实际业务 | 最终独立真值 | Agent/报告必须结果 |
| --- | --- | --- | --- |
| E0 | 正常导出，处理中后成功 | create=1、retry=0、job=1、有效产物=1 | completed + success，无支持的虚假缺陷，显式 finish |
| E1 | 首次失败且允许恢复，按钮正常 | create=1、retry=1、job=1、attempt=1、产物=1 | 实际恢复后 completed + success；不能仅 probe 后结束 |
| E2 | 同样允许恢复，但控件始终不可操作 | create=1、retry=0、job=1、failed、产物=0 | blocked + unknown；一个有效重试不可操作发现，完整五秒证据及未覆盖路径 |
| E3 | 权限/配额等明确合理拒绝 | create=1、retry=0、job=1、rejected、产物=0 | completed + rejected；不把预期拒绝当缺陷 |
| E4 | E1 的布局、文案变化 | 与 E1 相同 | 实际选择新目标、恢复成功，不报按钮丢失 |

每轮重置时 jobId 随机且不编码变体。有效产物须内容匹配本次选择的数据集/格式并在私有评分中实际读取验证，HTTP 200 或一个下载按钮不足以证明成功。

E2 的五秒窗口沿用现有调查起点与采样契约，不能宣称是未测量过的全部历史时间；至少满足现有 evaluateTransition 的首尾覆盖、样本间隔和非 null 门槛。保存原图、当前任务可见反馈、资格来源、稳定目标、完整测量以及对应 finding。E2 的 blocked 不是运行失败，超时或未调用 finish 才是验收失败。

## 7. 评分器必须先证明能拒绝假阳性

私有 export scorer 使用正式 API 报告、独立事件/下载证据、私有业务真值组合评分，不读生产适配器给出的“正确答案”。可以共享通用类型、哈希与文件校验，不共享决定预期结果的条件函数。

| ID | 故意篡改/删减测试输入 | 必须判失败 |
| --- | --- | --- |
| E01 | completed 文本存在，但 finish:accepted 缺失 | 缺显式结束 |
| E02 | success 报告对应 processing/失败或另一个 job | 业务不一致 |
| E03 | E1 只 probe，没有真正 retry；或第二次 create 假装恢复 | 恢复未完成/额外副作用 |
| E04 | E2 finding 无测量、窗口不足、全 null、错误目标或有干预 | 证据不足/无效 |
| E05 | E2 finding 重复，或健康变体多出 supported 缺陷 | 重复/误报 |
| E06 | 规则迁移组没有实际 rule_check，只有探索 finding | 未验证规则复用 |
| E07 | 原规则被改动、无启用/人工审阅来源 | 审批来源无效 |
| E08 | 从快照/模型请求发现私有变体编号、预期发现清单或评分答案，或请求私有控制成功 | 答案泄漏/隔离失败（可见真实业务症状不算泄漏） |
| E09 | API 报告完整但 DB 终态、事件尾或证据哈希不一致 | 持久化失败 |
| E10 | 只留下成功轮、少记录、变体/重复次数不符、混合构建 | 不完整/不可比较批次 |

尤其保持 unknown、not-applicable、fail 的区别；unknown 不能算作规则通过。通用重试规则迁移组的健康样本必须存在实际 pass 测量，不以 not-applicable 代替。

## 8. G4/G5：真实模型的命令和顺序

### 8.1 新入口需实现

```sh
pnpm arena:export:start
pnpm test:fixtures:export
pnpm validate:business -- --preflight
pnpm validate:business -- --diagnostic
pnpm validate:business -- --formal --diagnostic-source <通过诊断的目录> --approved-source <已关闭学习目录>
```

arena:export:start 启动编译后的新靶场。business preflight 使用本地固定模型且绝不读取真实凭据发起请求；diagnostic/formal 使用现有 DeepSeek/Qwen OpenRouter 网关，缺 key 明确非零退出，不 mock。

diagnostic 自动隔离环境、真实 smoke、E0–E4 各一次，共五个任务。formal 的 --diagnostic-source 必填，要求来自当前冻结构建的通过诊断记录（在 campaign 文件中引用并校验）；不能用旧构建诊断跳过。formal 运行下面四组，共 45 个任务，不额外重复同构建 smoke。

具体参数解析需要严格拒绝未知/冲突选项。脚本自带独立端口、数据库、私有 token、lease、异常清理及摘要。进程终止保留 partial 记录；重新运行创建新 campaign，不复写之前失败。--approved-source 可省略以使用下节本机默认路径；缺失或不可信时将 B/D 记 blocked，仍完成可安全进行的 A/C，最终非零退出，不把缺少规则验证的批次标为通过。formal 与其引用的 diagnostic 费用合并计入同一个逻辑 campaign 预算，不因新建输出目录重置额度。

### 8.2 正式矩阵：固定 45 轮

| 组 | 规则状态与目的 | 固定任务数 | 门槛 |
| --- | --- | --- | --- |
| A：导出自主探索 | 内置基础规则，确认无等价重试规则；E0–E4 各三轮 | 15 | 15/15，E2 source=agent 且有真实调查 |
| B：导出已知规则迁移 | 载入原批准声明；E1、E2 各三轮 | 6 | 6/6，E1 有规则 pass 后实际恢复；E2 一个 source=rule 的 fail 发现，无重复探索缺陷 |
| C：原购物 minimum | 原协议 C0–C5 各三轮，无等价重试规则 | 18 | 原 evaluator 18/18，不降低门槛 |
| D：原购物学习复查 | 原批准规则，异常/健康各三轮 | 6 | 现有绑定式复查 6/6，批准和声明未改动 |

与原粗计划的 33 轮相比，新增 B/D 共 12 轮，专门验证“跨业务复用原规则”和“没有破坏原学习闭环”；A/C 的无规则模式不能替代这两项。只在最终候选构建完整执行一次，普通用户运行仍是一项任务，不跑矩阵。

每组独立数据库/规则状态。同组内可保留相同业务配置下的合法只读 Journey，必须记录初始状态和来源；跨组不得借用未知问题发现的答案、假设、规则或已有任务结果。私有评分读取需要与 Agent 上下文隔离。不得将 A 的 E2 发现自动转成新规则帮助 B。

C/D 复用原正式验收和 learning runner 的校验，允许抽取共享编排或内部参数以统一 campaign，但原命令仍兼容。D 不允许只复制旧六轮成绩。保证四组指向同一 Server 构建 SHA；若构建多次，编译产物 hash 必须一致，否则新建完整冻结批次。

### 8.3 原批准来源

Git 已附带[可移交的原批准资料](../evaluation/fixtures/approved-retry/README.md)，无需原作者的本机目录。开发 Agent 拉取后先运行：

```sh
pnpm fixture:approved-retry -- --verify
pnpm fixture:approved-retry
```

默认生成 data/fixtures/approved-retry，供 --approved-source 使用；已存在时不覆盖，可使用 --out <新目录>。validate:business 的默认批准来源改为 data/fixtures/approved-retry。原历史目录 data/learning/2026-09-24T10-57-41-736Z 仅作为追溯来源，不再是跨机器前置依赖。候选 ID 仍为 proposal-fc30e9bb-46bc-40ec-b88b-ff52f0565607。

prepared.json 描述生成时的候选，状态可能仍是 validating；**不能单凭它证明批准**。必须核对已关闭 runs.db 的最终 enabled 状态、reviewedBy、原 ruleConfig，以及 approval-inherited.json 等审阅/继承记录；按现有 learning --recheck 的核验要求只读复制到隔离工作库。记录源数据库 hash、声明 hash、候选 ID/修订和原批准来源。原声明的语义 target、timeoutMs 与适用性不得修改。

导入工具会核对原批准、声明、证据归属及 fail/pass/unknown 记录后，在新目录重建兼容数据库，并将相同字节的原始证据恢复到本机 data/artifacts/<原runId>/（冲突拒绝覆盖）；它不是重新批准。portable-source.json 区分原数据库 hash 与新摘录数据库 hash，后者不同是正常现象。来源只含必要记录，不是完整历史运行，recheck-summary.json 只作追溯，不计入当前 B/D 通过数。

源缺失时先检查是否拉取了本 Git 资料并完成导入；损坏或无法核验时仍完成 G0–G4 和可做的 A/C，B/D 标记 blocked，不伪造审批。若确实需要改声明，先输出具体 diff 和正反例验证，再请求用户批准新候选；可继续独立工作。当前计划优先保持原声明，不预先索取新的批准。

### 8.4 冻结参数、费用与停止条件

沿用现有网关的 DeepSeek/Qwen 模型，记录实际 model/provider/快照，不自动选更快型号或 fallback。按当前可复现基线显式固定 Wafer/Alibaba；原子调查=1，有限 Jev 审查=1，固定已验证快照。本地 preflight 还需覆盖有限审查关闭，不修改产品默认关闭策略。

每轮：totalTimeoutMs=300000、maxActions=40、maxModelCalls=30；工具和单请求超时、至多一次安全请求重试沿用当前配置。模型、视觉和有限审查共享调用/费用预算。不要因为失败提高上限或更换提供方再混为同一批。

沿用 VALIDATION_MAX_COST_USD，默认本次 campaign 累计上限 $2，包含 smoke、诊断、A–D、失败请求及未明确结算的预留。多个子 runner 必须共享或扣减累计余额，不能每个子进程重新获得 $2。价格无法取得或实际费用未知时保守预留，不能当成零。修复后的新 campaign 明确记录与旧 campaign 的累计花费。

G4 失败先回归定位，不立即启动正式45轮。相同阻碍两次诊断/修复后仍未解决，停止盲目重跑，交付原因和全部证据供主 Agent 处理。不得通过改 scorer 或择优采样补齐分数。

正式批次出现普通质量失败时仍按预定矩阵收集可安全完成的后续样本，整批 gate=false。费用耗尽、失去隔离、未知副作用、持久化不一致等必须立即停，未运行行记 not-run，批次不通过；不要自动 reconcile、reset 后继续。源码/提示/规则/私有判定变更后必须重新冻结，旧失败保留，不能拼接新旧构建凑45轮。

## 9. 每轮和每批保存的证据

在 data/business-validation/<timestamp>/ 保存，版本信息和脱敏结论写入交接文档；不把密钥、原数据库和全量截图提交 Git。

```text
manifest.json                campaignId、base/head、构建/锁文件 hash、版本、模型、flags、预算
protocol.json                五个变体和A–D固定矩阵的版本与hash
diagnostic-reference.json    同冻结构建的通过诊断引用
approval-source.json         只读批准来源与声明hash，不含凭据
runs.jsonl                   所有计划行，含not-run、failed及runId
<group>/<case>/<repeat>/      请求/响应计量、事件、报告、独立真值、下载证据
artifact-index.json          每个文件的runId、artifactId、大小、SHA-256及可用性
scoreboard.json              各轮断言、错误、分组分数、总门槛
durability-audit.json         停服前后读取对照、DB终态/事件尾/规则审批核对
summary.md                   结论、时间/成本口径、失败与未覆盖项
```

每轮至少记录：profile/hash、目标、当前操作与 attempt、业务真值、实际 create/retry 计数、模型请求数与未知 usage、显式 finish、发现来源/规则版本、测量完整性、证据哈希、执行器干预、错误和停止原因。

先经 API 下载证据并核验归属，再停止服务、关闭/检查点数据库，用新连接对照 runs、末尾事件、findings、artifacts 和 rules 状态。文件缺失/hash不一致/API与数据库结论不同均失败。只读审计不编辑源结果。

耗时区分单轮 elapsedMs、模型/工具时间及整个 campaign 墙钟；不要相加重叠时间。报告完整失败分布；本阶段没有“必须比旧版快”的门槛。

## 10. G6：交接、review 与更正

dev 在 plans/business-contracts-handoff.md 填写以下清单并完成提交：

- [ ] base/head SHA、分支/PR/bundle、构建和锁文件 hash。
- [ ] P0–P6 状态，耦合表的每项最终归属，所有设计偏差及原因。
- [ ] 配置/API/schema/兼容说明，截图和复现命令。
- [ ] G0–G3 命令、退出码、测试名与 C/B/P/R/F/U/E ID 对照；不得填尚未运行的结果。
- [ ] G4 诊断和 G5 A=15、B=6、C=18、D=6 全部行及来源；blocked/not-run 明确列出。
- [ ] 模型/提供方/审查 flags、费用、未知计量和失败批次索引。
- [ ] 原批准来源、声明未变证明、停服后持久化审计。
- [ ] 无私有答案泄漏、无额外业务写、无未知结果重放的证据。
- [ ] README/docs 已同步；已知限制、未解决问题、下一步建议。
- [ ] 开发分支已 push，主 Agent review 尚未进行；不标 accepted，不合并 main。

主 Agent 接回后负责：

1. 阅读 diff 和所有设计偏差，重点检查通用执行器是否仍猜购物字段、规则绑定是否跨 attempt 误用、策略是否真正限制业务写。
2. 核验评分器独立性、原批准来源、45轮固定构建及完整失败记录，抽查报告/DB/截图/测量相互一致。
3. 复跑免费门槛和关键安全反例；重现发现的问题并修复，而不是仅转述给用户。
4. 若更正影响业务判定、Agent政策、规则/策略或评分协议，重新冻结并执行受影响真实组；不得把旧构建四组拼成新构建“45/45”。需要宣称整体正式放行时，重新完整运行同构建45轮。
5. 将审查结论、修复提交与最终门槛记录下来，主 Agent 确认后再按用户授权合并 main。

本任务书不承诺自动监控外部开发 Agent。开发完成需将分支/PR/bundle 和 handoff 返回本任务，主 Agent 据此开始 review。
