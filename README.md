# UI Sentinel · 界面哨兵

单机 Web 质量检查服务。Mastra Agent 根据目标和真实页面观察选择工具；Playwright 执行动作与取证，Midscene 提供受预算限制的视觉定位。规则检查、探索发现、证据和反馈保存到本地数据库。

当前实现面向购买靶场。真实模型 smoke、18 次评估和学习后复查需要显式配置模型并实际运行；确定性测试通过不能替代这些验收。

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

`MODEL_REQUEST_TIMEOUT_MS` 默认 60000；`MODEL_REQUEST_MAX_RETRIES` 允许 0 或 1，默认 1。仅在本次尝试尚未开始任何工具、没有未决写操作且仍有预算时重试暂时网络错误。重试计入总请求数，取消和鉴权错误不重试；无法取得的 usage 保留 unknown。主模型响应等待与工具执行分别计时，视觉请求同时受工具和整轮期限限制。当前使用非流式调用，没有首 token 或流式 idle 指标。

工作台从持久事件显示等待模型、执行工具、验证和收尾阶段，以及经过时间和期限。即使模型未返回也能看见请求已经开始。

连续三轮没有新增页面或调查事实会提醒，五轮触发收尾；剩余请求不超过两次或时间进入预留窗口也会触发收尾。收尾最多两次主模型请求（包括重试），禁止新业务动作，只允许保存结论及有限的补充观察/既有调查测量。已验证业务结果与检查状态分别保存；开放假设或已记录的未覆盖分支会阻止成功结束。当前账本不能证明 Agent 未记录、未发现的检查项已覆盖。假设与未覆盖分支都使用结构化 trigger，支持支付成功、拒付、可重试失败和遮挡触发；已观察到业务结果后，未触发的条件单独列出，不自动当成缺陷或阻断。

结束请求不匹配时返回 `finishAdvice`，给出已验证的业务分类和适用缺项；模型必须重新提交正确的请求，不由系统代替其宣布完成。可重试的处理失败（status=failed）对应 `unknown + blocked`，明确拒付（rejected/declined）才对应 rejected。

模型超时为 `execution-error/model-request-timeout`；收尾仍未有效调用 `run_finish` 为 `blocked/no-progress` 或 `blocked/finish-incomplete`，不会因为支付成功就把检查改成 completed。整体预算耗尽和未知写结果沿用原有失败/核对语义。

最新工具结果通过 `latestToolResults` 优先交给下一次决策，较早历史单独提供；两者共享 8,000 UTF-8 字节预算。命中采样、规则结果和持续测量有专门摘要，超限时给出明确的 `resultRef`，可用 `tool_result_read` 分页读原文。原始结果保留在事件和本轮存储中；`history_read` 返回的正文也会进入下一轮。每次决策最多执行八个工具，其中最多三次历史/原文读取；这些读取结果在共享预算内优先完整交付，不能再次被替换为引用。历史页最多 1,800 序列化字节，原文片段最多 1,000 序列化字节，通过明确游标续读；`resultRef` 始终指向原文，`receiptRef` 标识当前回执，不混用二者。读回新信息最多提供三次进展宽限，重复查询不会无限绕过收尾。

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

当前范围和验收状态见 [开发计划](plans/minimum-validation-plan.md) 与 [进度记录](plans/minimum-validation-progress.md)。

### 浏览器循环对照实验

隔离比较当前执行器与 Stagehand 3.7.3。使用本机 `.env` 的 `OPENROUTER_API_KEY`，生产模型配置和执行器源码不变。

```sh
pnpm build
pnpm experiment:browser --repeats 3 --arms current,stagehand
```

运行真实付费模型，缺凭据明确失败。协议、限制及结果见 [实验计划](plans/browser-loop-experiment.md) 和 [实验结果](plans/browser-loop-experiment-results.md)。本实验只验证购买操作，不代替 C0–C5 的质量检查验收。


### 真实验收诊断

```sh
pnpm build
pnpm experiment:acceptance
# 单轮六例全部通过后，接着运行固定 18 轮：
pnpm experiment:acceptance --minimum
```

使用本机 `.env` 的 OpenRouter key 和已选 DeepSeek / Qwen 模型。自动分配端口、独立数据库和私有控制 token；先真实 smoke，再串行跑 C0–C5 各一次，通过正式 API 收集报告并使用同一个私有评分器。保存全部失败、模型账单及配置到 `data/acceptance/<batch>/`，结束后清理自己启动的服务。

单轮诊断不计入 18 轮门槛；指定 `--minimum` 时也必须先六例全过，否则保留失败并停止后续批次。学习规则不能混入未知缺陷发现验收，M5 的人工确认/审阅及启用后复查另行记录。
