# UI Sentinel · 界面哨兵

单机 Web 质量检查服务。Mastra Agent 根据目标和真实页面观察选择工具；Playwright 执行动作与取证，Midscene 提供受预算限制的视觉定位。规则检查、探索发现、证据和反馈保存到本地数据库。

当前实现面向购买靶场。2026-09-23 M4 冻结版本已通过真实模型 smoke、六例诊断及正式 18/18 验收；后续绑定式执行修复版本的学习后复查（M5）6/6 通过，历史失败批次保留。详见 [验收结果](plans/acceptance-results-2026-09-23.md)和 [M5 记录](plans/learning-validation-results-2026-09-23.md)。两个阶段使用各自冻结版本；最新执行层未重跑完整 M4 18 轮。这些结果不等于任意业务都已覆盖或稳定提速已经实现。

最新关键路径改动的实现、失败记录及真实模型对照单列于 [关键路径实验结果](plans/critical-path-results-2026-09-23.md)。当前支持冻结证据后台分析，像素覆盖猜测仍可能无法验证；不能把该能力或并发发生本身当作提速证明。

当前按 [Agent 决策效率与开源执行方案验证计划](plans/agent-decision-efficiency-plan.md) 推进：定位慢决策的原因、验证信息契约、实测开源完整 Agent 循环，再决定是否采用及继续并行优化。进度见 [实验结果](plans/agent-decision-efficiency-results.md)。

## 环境与安装

使用 `.node-version` 指定的 Node 24 LTS，pnpm 10.17.1。不要提交 `.env`、数据库或运行证据。

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cp .env.example .env
```

Linux 首次运行可能需要 `pnpm exec playwright install --with-deps chromium`。首次启动自动创建数据库目录。测试使用独立内存数据库，不需要模型凭据。

在 `.env` 中选择并填写 `AGENT_MODEL`（`openai/<model>`、`anthropic/<model>` 或 `google/<model>`）和对应 provider 密钥。视觉配置 `VISION_MODEL` 使用供应商的模型名，填写 `VISION_API_KEY`；按供应商需要配置 `VISION_BASE_URL`、`VISION_MODEL_FAMILY`。模型由操作者选择；本项目不自动选择付费模型。

私有靶场控制使用 `ARENA_CONTROL_TOKEN`，设置为随机本地秘密（例如用 `openssl rand -hex 32` 生成后填写）。该值不会提供给被测 Agent。未配置时私有服务使用临时随机 token，评估命令明确报配置缺失。

## 开发和生产启动

```sh
pnpm dev
```

启动产品 Web/API（默认 `http://127.0.0.1:4111`）、靶场（4173）、靶场业务 API（4174）和带认证的私有控制器（4175）。根 `.env` 由开发启动器读入并传给子进程。Ctrl-C 统一清理子进程，任何子服务失败也会停止同组服务。各端口可通过 `.env` 修改。Vite 仅用于开发和构建。

正式评估使用静态靶场，避免开发服务器暴露源码：

```sh
pnpm build
pnpm start
# 第二个终端，在项目根目录运行：
pnpm arena:start
```

产品和靶场运行均不依赖 Vite 开发服务。生产构建仍需保留根依赖及 `arena/checkout/dist/`。仅绑定 loopback；该版本是受信本机工具，没有生产多用户认证。

工作台可启动任务、按 Run ID 恢复历史、查看事件/覆盖/原图/红框副本、反馈和审阅规则。浏览器关闭不终止后台运行。模型未配置时创建 Run 返回 503 configuration-missing。

## 验证命令

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm test:fixtures
pnpm smoke:model
pnpm arena:reset -- --case C0
pnpm evaluate -- --suite minimum --repeats 3
pnpm report -- --run RUN_ID
```

- `test`：确定性契约、规则、队列、取消、真实浏览器截图和 0.5/12 秒计时测试；其中模型替身明确只用于测试。
- `test:fixtures`：需要先 build；自动分配独立端口和临时数据库，启动生产服务并验证 C0–C5、私有入口隔离，自动清理。不会调用模型。结果在 `data/verification/fixtures.json`。
- `smoke:model`：真实主模型工具调用和视觉定位，最多一次主模型生成和三次视觉请求；缺配置直接失败，结果在 `data/smoke/`。
- `arena:reset`：产品、靶场均需运行。私有浏览器验证条件后清空验证产生的业务数据；活动/排队或待核对的 Run 存在时拒绝重置。
- `evaluate`：固定 C0–C5 各三次，正式 Run API、独立后端和原始证据评分；每轮立即保存（含失败/invalid），最后生成固定门槛摘要。结果在 `data/evaluations/<batch>/`。失败退出非零。测试期间工作台新任务被拒绝；已有学习规则时拒绝将其用于“未知规则发现”的 minimum 评估。
- `report`：打印工作台链接并导出 `data/reports/<run>.json`。

模型预算默认 300 秒、40 次动作、40 次模型请求（包含视觉请求），单工具默认 15 秒。正式 `minimum` 评估固定为每轮 30 次模型请求，不能通过增大预算改变验收口径。缺失 token 用量显示 unavailable。任务串行，取消阻止新动作；不确定写结果保留为 `interrupted/reconciliation-required`，不自动重放。

## 请求超时与任务收尾

`MODEL_REQUEST_TIMEOUT_MS` 默认 60000；`MODEL_REQUEST_MAX_RETRIES` 允许 0 或 1，默认 1。仅在本次尝试尚未开始任何工具、没有未决写操作且仍有预算时重试暂时网络错误，或恢复未执行工具的输出截断；两者共用原有的一次重试配额。重试计入总请求数，取消和鉴权错误不重试；无法取得的 usage 保留 unknown。主模型响应等待与工具执行分别计时，视觉请求同时受工具和整轮期限限制。当前默认流式调用，记录有效增量、工具执行和响应完成等分段时延；心跳不算进展，尚未引入按空闲时长重试的策略。

工作台从持久事件显示等待模型、执行工具、验证和收尾阶段，以及经过时间和期限。即使模型未返回也能看见请求已经开始。

连续三轮没有新增页面或调查事实会提醒，五轮触发收尾；剩余请求不超过两次或时间进入预留窗口也会触发收尾。收尾最多两次主模型请求（包括重试），禁止新业务动作，只允许保存结论及有限的补充观察/既有调查测量。已验证业务结果与检查状态分别保存；开放假设或已记录的未覆盖分支会阻止成功结束。当前账本不能证明 Agent 未记录、未发现的检查项已覆盖。假设与未覆盖分支都使用结构化 trigger，支持支付成功、拒付、可重试失败和遮挡触发；已观察到业务结果后，未触发的条件单独列出，不自动当成缺陷或阻断。

结束请求不匹配时返回 `finishAdvice`，给出已验证的业务分类和适用缺项；模型必须重新提交正确的请求，不由系统代替其宣布完成。可重试的处理失败（status=failed）对应 `unknown + blocked`，明确拒付（rejected/declined）才对应 rejected。

模型超时为 `execution-error/model-request-timeout`；收尾仍未有效调用 `run_finish` 为 `blocked/no-progress` 或 `blocked/finish-incomplete`，不会因为支付成功就把检查改成 completed。整体预算耗尽和未知写结果沿用原有失败/核对语义。

最新工具结果通过 `latestToolResults` 优先交给下一次决策，较早历史单独提供；两者共享 8,000 UTF-8 字节预算。命中采样、规则结果和持续测量有专门摘要，超限时给出明确的 `resultRef`，可用 `tool_result_read` 分页读原文。原始结果保留在事件和本轮存储中；`history_read` 返回的正文也会进入下一轮。每次决策最多执行八个工具，其中最多三次历史/原文读取；这些读取结果在共享预算内优先完整交付，不能再次被替换为引用。历史页最多 1,800 序列化字节，原文片段最多 1,000 序列化字节，通过明确游标续读；`resultRef` 始终指向原文，`receiptRef` 标识当前回执，不混用二者。读回新信息最多提供三次进展宽限，重复查询不会无限绕过收尾。已提交发现另有最多 2,000 字节的持久摘要（明确列出省略数量），在关闭遮挡或导航后仍保留标题、实际表现和证据引用；不需要仅为撰写结论重读全部历史。

当前购买检查明确限定一笔订单。收到订单响应后，浏览器进入只读网络阶段，后续非 GET/HEAD/OPTIONS 请求会被拦截并留档；`page_act(type="probe")` 只检查点击可操作性，不实际提交。此策略适用于当前购买靶场，跨业务或需要多次业务写入的任务应先扩展显式权限契约。已核验的订单结果及证据不会因离开结果页而丢失；相矛盾的新业务响应仍会使旧结论失效。

## 代码规范

使用 Biome 格式化服务端、React 靶场、工作台、评估器、脚本及测试中的受支持文件。统一两空格缩进、单引号、按需分号与 100 列排版；构建产物和本地运行数据不参与检查。

```sh
pnpm format
pnpm format:check
```

当前关闭 Biome 的 linter 和 assist，只整理格式；后续需要时在 `biome.json` 中逐步开启检查。保留 TypeScript 7 类型检查，提交前执行格式检查、测试和构建。Markdown 文档暂不参与自动排版。

## 反馈与规则复查

在问题卡中确认发现，再生成候选（真实模型调用）。候选只支持声明式 transition，不执行生成代码。审阅页填写结构化异常、正常观测数组；缺失事实测试由验证器追加。需要 fail/pass/unknown 均验证正确才可人工批准并启用。已启用声明在后续检查和重启后加载。

单个观测示例：

```json
{"eventType":"retryable-failure","startedAtMs":0,"observedUntilMs":5250,"samples":[{"atMs":0,"target":"retry","value":true}],"evidenceRefs":["measured-artifact-id"]}
```

实际 eventType、target、前后状态必须对应生成候选与真实测量。异常用例必须覆盖整个时间窗口，采样间隔不超过 500ms；一条 false 样本不足以证明持续不可用。输入 JSON 数组，界面会提交序列化观测。真实复查应保留启用前后 Run 报告比较调用数、耗时和结果，不能以合成 fixture 宣称完成模型学习验收。

## 中断核对

服务重启将未完成 Run 标为 interrupted。私有操作者需检查订单和副作用，确认处理方式，再以控制 token 调用 `POST /api/evaluation/reconcile`，body 为 `{"verified":true,"reason":"核对过程与结果"}`。该操作保存核对记录，不重放旧 Run，也不自动回滚订单。没有待执行任务才能解除阻塞。

下一轮开发入口：[执行效率与能力复用计划](plans/execution-efficiency-plan.md)。原始交付门槛见 [最小验证计划](plans/minimum-validation-plan.md)，当前状态见 [进度记录](plans/minimum-validation-progress.md)；整体设计见 [架构文档](docs/architecture.md)。

### 浏览器循环对照实验

隔离比较当前执行器与 Stagehand 3.7.3。使用本机 `.env` 的 `OPENROUTER_API_KEY`，生产模型配置和执行器源码不变。

```sh
pnpm build
pnpm experiment:browser --repeats 3 --arms current,stagehand
```

运行真实付费模型，缺凭据明确失败。协议、限制、复现命令与结果统一见 [浏览器循环实验记录](plans/browser-loop-experiment-results.md)。本实验只验证购买操作，不代替 C0–C5 的质量检查验收。

### 真实验收诊断

```sh
pnpm build
pnpm experiment:acceptance
# 单轮六例全部通过后，接着运行固定 18 轮：
pnpm experiment:acceptance --minimum
```

使用本机 `.env` 的 OpenRouter key 和已选 DeepSeek / Qwen 模型。自动分配端口、独立数据库和私有控制 token；先真实 smoke，再串行跑 C0–C5 各一次，通过正式 API 收集报告并使用同一个私有评分器。保存全部失败、模型账单及配置到 `data/acceptance/<batch>/`，结束后清理自己启动的服务。

单轮诊断不计入 18 轮门槛；指定 `--minimum` 时也必须先六例全过，否则保留失败并停止后续批次。学习规则不能混入未知缺陷发现验收，M5 的人工确认/审阅及启用后复查另行记录。

`transition_observe` 的 `element-actionable` 采样要求目标可见、enabled，且视口内采样点至少一处没有被其他元素截获；不会发送点击或主动滚动。目标缺失或选择器歧义返回 unknown。它是当前时刻的命中采样，不证明事件处理器已成功执行；需要验证业务动作时仍须使用正式动作和反馈证据。

### M5 学习验证

`pnpm experiment:learning -- --source <已关闭的验收目录> --finding <finding-id> --confirm-reason <人工确认原文>` 在独立数据库副本中生成候选，并用原始异常测量、真实浏览器正常恢复对照及 unknown 验证。正常恢复对照保留处理失败业务结果，只改变重试入口的可用性；默认 C0–C5 行为不变。

候选验证失败或人工要求修订时，可用 `pnpm experiment:learning -- --revise <上次学习目录> --previous <候选 ID>` 将验证反馈交给模型生成新候选；可附加 `--revision-reason <人工审阅意见>` 修订适用范围。旧候选和证据保留，审阅意见不视为启用批准。

准备命令不会批准或启用规则。获得针对具体候选的人工批准后，才能执行 `pnpm experiment:learning -- --resume <学习目录> --approve <proposal-id> --reviewer <人工审阅者>`，进行异常/正常各三次真实 Agent 复查。原始 M4 数据库不修改，学习规则不参与未知发现验收。详见 [M5 验证记录](plans/learning-validation-results-2026-09-23.md)。

已批准且启用的同一规则，在执行器修复后使用 `pnpm experiment:learning -- --recheck <已关闭的学习目录>` 复查。它创建新目录、复制关闭的数据库、核对声明未变化并继承已有人工批准，不覆盖旧结果。绑定式检查还验证单次绑定测量、声明时间窗口、无重复发现及无无效证据引用。


### 执行效率对照（P0）

`pnpm experiment:efficiency -- --baseline-ref <提交 SHA> --candidate-ref <提交 SHA> --phase diagnostic --max-cost-usd 0.50` 使用两个不可变提交的独立构建，交替运行 C0/C2 各一次，共四轮；共用当前私有评分器，失败时停止扩大样本。两组锁文件须与已安装依赖一致，不能借共享依赖比较不同版本。

`--phase compare --learning-source <已关闭且已批准的学习目录>` 则复制同一已启用声明，交替运行异常/正常各三轮/每组，共十二轮。原始批准与数据库不修改，正式 minimum 的未知发现环境不加载该规则。缺密钥、模型、价格或有效审批明确失败，不生成替身。主模型供应商默认 Wafer，可显式配置；实际路由不符时标为不可比。

清单、隔离构建、每轮记录及原始证据放在 `data/efficiency/<batch>/`。费用限制在发起新请求前按请求大小与模型列表价格估计预留，已发出的请求仍可能收费；缺失费用保留估计占额及 unknown 标记。它是估计支出上限，不是供应商账单的硬上限。

运行报告的 `execution:profile` 事件包含截图、DOM、a11y、规则及持久化的父子 span；`exclusiveMs` 按时间区间分配，嵌套时间不重复累计，并发区间标为 overlap，未覆盖部分为 unattributed。`inclusiveMs` 用于分项诊断，不能相加当作总耗时。未完成 span 保持 unfinished；旧版本没有该事件时显示 unavailable。计时只记录工程阶段，不记录隐藏推理。


效率验收补充：`experiment:efficiency --phase learning-diagnostic`（同时传入两个不可变版本及 `--learning-source`）只执行候选的异常/正常两例，不计入正式六轮 M5；与 `experiment:acceptance` 的真实 smoke、六例诊断共同构成 P4 预检。验收脚本通过 `EXPERIMENT_MAX_COST_USD` 配置估算支出上限，费用未知时保留预留额度；取消在途请求不能保证供应商不计费。


### 冻结证据分析与关键路径实验

Agent 可调用 `visual_review`，让 Qwen 分析当前保存的截图。页面由一个操作者控制；分析只消费冻结证据，与独立工作重叠。结果作为待验证假设返回，结束前必须汇合；支持使用相同证据的已验证遮挡发现解决重复假设。任务状态、证据版本、消费与关联日志进入 Run 报告，失败不会当作通过。详见 [执行契约](docs/execution-engine.md#冻结证据的后台分析工具契约-18)。

后台视觉分析尚未通过新增质量/性能门槛，默认关闭；`EXECUTION_EVIDENCE_ANALYSIS=1` 显式启用实验工具，现有视觉动作定位独立可用。`EXECUTION_ANALYSIS_MODE=serial` 使用相同分析工作量进行串行对照。`EXECUTION_MODEL_STREAMING=0`、`EXECUTION_SHORT_FINISH=0` 分别恢复非流式请求和旧收尾协议，用于诊断。所有请求仍共享原 Run 预算；这些开关不是增加预算的入口。

`EXECUTION_ATOMIC_INVESTIGATION=1` 启用单次有类型调查，Agent 声明问题与条件，执行层完成连续测量并保存有界证据；目前保持默认关闭，正在正式验收。执行器干预导致的后续页面状态不能直接报告成站点缺陷，报告会保留来源与未验证范围。参见 [架构验证结果](plans/architecture-convergence-results.md)。

完成独立诊断后，`pnpm experiment:acceptance -- --minimum-only` 运行真实 DeepSeek/Qwen smoke 和固定 18 轮正式 minimum，省去重复的六轮诊断；原 `--minimum` 仍先诊断再验收。该入口用于发布质量验证，不用于对照架构的冷启动性能。

私有 `experiment:efficiency` 增加 `--phase visual-compare --protocol visual-1`：必须同时提供指向同一提交的 `--baseline-ref`、`--candidate-ref`；固定 C0/C2 各两对，共八轮，唯一调度差异为 serial/parallel。无需学习规则目录，禁止加载学习规则。`--protocol finish-1` 用于短收尾十二轮对照，保留原 `efficiency-1` 门槛。

[关键路径实验记录](plans/critical-path-results-2026-09-23.md) 保留所有批次与失败。短收尾首批十二轮质量通过，但没有实现性能目标；并行能力成立也不等于端到端稳定提速。
