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

模型预算默认 300 秒、40 次动作、30 次模型请求（包含视觉请求），单工具默认 15 秒。缺失 token 用量显示 unavailable。任务串行，取消阻止新动作；不确定写结果保留为 `interrupted/reconciliation-required`，不自动重放。

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
