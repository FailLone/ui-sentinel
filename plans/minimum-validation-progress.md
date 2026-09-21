# 最小可验证路径 - 进度记录

## 实现决策

| 决策 | 选择 | 原因 |
|------|------|------|
| Node.js | v24.10.0 | 本机已安装，超过 22.18.0 最低要求 |
| 包管理器 | pnpm 10.10.0 | 计划要求 |
| TypeScript | 7.0.2 | 最新版，配合 ES2022 + bundler moduleResolution |
| Mastra | @mastra/core 1.67.0 | Agent/Tool 框架 |
| HTTP Server | Hono 4.13.8 + @hono/node-server 2.1.1 | mastra dev CLI 有 bug，改用 Hono 直接起服务 |
| 存储 | @mastra/libsql 1.23.0 + @libsql/client 0.18.0 | 本地 SQLite，无需外部数据库 |
| Playwright | 1.63.0 | 最新版，Chromium 浏览器 |
| Midscene.js | @midscene/web 1.13.0 | 最新版，PlaywrightAgent 适配 |
| 测试框架 | vitest 5.0.1 | 现代 TypeScript 测试，与 Vite 生态兼容 |
| 前端框架 | React 19 + Vite 8.3 | 靶场 UI |
| 产品端口 | 4111 | 计划默认值 |
| 靶场端口 | 4173 (UI) / 4174 (API) | 计划默认值，API 独立端口 |
| zod | 4.6.5 | Mastra 工具 schema 需要 |

## M0：项目骨架与依赖验证 ✅

### 已实现
- [x] TypeScript 项目初始化 (package.json, tsconfig.json, .gitignore)
- [x] 依赖安装并锁定 (pnpm-lock.yaml)
- [x] 环境配置模板 (.env.example)
- [x] 目录结构 (src/server, agent, execution, rules, storage, web, shared)
- [x] 共享类型定义 (RunStatus, BusinessResult, Finding, Hypothesis 等)
- [x] 配置管理与模型检查 (config.ts, checkModelConfig)
- [x] 领域数据库 schema (7 tables: runs, events, findings, hypotheses, feedback, proposals, artifacts)
- [x] LibSQL 持久化 (database.ts, initDatabase, checkStorageHealth)
- [x] Hono HTTP Server (src/server/index.ts, 端口 4111)
- [x] 健康接口 (GET /api/health - 存储状态 + 模型配置)
- [x] Playwright 浏览器工具 (launch, screenshot, viewport)

### 测试 (12 tests)
- [x] 数据库 schema 测试 (6 tests)
- [x] 浏览器工具测试 (3 tests)
- [x] 健康检查测试 (3 tests, 含路由集成测试)

## M1：可控购买靶场 ✅

### 已实现
- [x] React + Vite 靶场 (arena/checkout/, 端口 4173)
- [x] Hono API 服务 (arena/checkout/src/server/, 端口 4174)
- [x] 商品目录 (3 products)
- [x] 购物车管理 (add, remove, clear, total)
- [x] 订单与模拟支付
- [x] 6 个变体 (C0-C5):
  - C0: 正常购买，支付成功
  - C1: 可关闭浮层阻挡提交
  - C2: 不可关闭浮层阻挡提交
  - C3: 按钮改名 + 移动
  - C4: 支付拒绝，原因明确，有重试入口
  - C5: 支付失败，重试永远失败
- [x] 数据重置 (POST /__control/reset)
- [x] 变体验证 (POST /__control/verify)
- [x] Vite→API 代理
- [x] 答案隔离 (变体配置在 server state, 不暴露给 agent)

### 测试 (14 tests)
- [x] 购物车操作 (add, duplicate, remove, clear, total)
- [x] 各变体支付行为 (C0 success, C4 rejected, C5 always fails)
- [x] 状态重置

## M2：服务端任务与 Agent 探索闭环 ✅

### 已实现
- [x] Run 创建与管理 (run-manager.ts)
- [x] 异步执行引擎 (executor.ts)
- [x] API 路由:
  - POST /api/runs (202, 返回 runId)
  - GET /api/runs/:id (状态、usage、latestEventSeq)
  - POST /api/runs/:id/cancel (幂等取消)
  - GET /api/runs/:id/events (SSE + JSON 模式，支持 after 游标)
  - GET /api/runs/:id/report (完整报告)
  - GET /api/runs/:id/artifacts/:artifactId (证据文件)
  - POST /api/findings/:id/feedback (confirmed/intentional/cannot-reproduce/deferred)
- [x] SSE 事件订阅 + 断线重连
- [x] Agent 循环 (基于 Mastra Agent + Playwright)
- [x] 预算控制 (时间、动作、模型调用)
- [x] Web 工作台 (src/web/workbench.html, 暗色主题)
- [x] 模型未配置时返回 configuration-missing

### 测试 (12 tests)
- [x] Run CRUD 操作 (5 tests)
- [x] API 路由集成测试 (7 tests: 创建、查询、events、cursor、report、feedback)

## M3：少量规则与真实证据报告 ✅

### 已实现
- [x] 规则引擎 (engine.ts: register, getEnabled, runChecks)
- [x] 3 条内置规则:
  - overlay-blocking: 浮层阻挡检测 (矩形碰撞 + 关闭按钮检测)
  - business-outcome: 业务终态验证 (success/rejected/failed 识别)
  - response-time: 响应时间预算 (10s 阈值)
- [x] 规则上下文 (PageSnapshot + 事件历史)
- [x] 空规则集返回 not-checked
- [x] 规则评估错误处理

### 测试 (13 tests)
- [x] 引擎测试 (empty, register, not-checked, run-all)
- [x] overlay-blocking 测试 (pass, fail, close-button)
- [x] business-outcome 测试 (not-applicable, success, rejection-with-retry)
- [x] response-time 测试 (not-applicable, fast-pass, slow-fail)

## M4：独立评估 ✅

### 已实现
- [x] 私有答案定义 (evaluation/private/answers.ts)
- [x] 评估器 (evaluation/private/evaluator.ts)
- [x] 评估脚本 (src/scripts/evaluate.ts, `pnpm evaluate`)
- [x] C0-C5 每例 3 次，通过正式 Run API
- [x] 评分: businessResult, findings, falsePositives, budget, answerLeak
- [x] 答案泄露检测
- [x] 评估摘要与 JSON 输出

### 测试 (8 tests)
- [x] C0 成功/失败判定
- [x] C1 需要 overlay finding
- [x] C4 rejected 判定
- [x] C5 hypothesis-based finding
- [x] 答案泄露检测
- [x] 评估汇总

## M5：反馈到规则复查 ✅

### 已实现
- [x] 声明式 transition 规则模板
  - 支持: state-reachable, element-visible, element-actionable
  - 验证: schema, 范围, 证据依赖
- [x] 规则提案 CRUD (proposal.ts)
- [x] 正反案例验证 (validate)
- [x] 人工审阅 (approve/reject, 需验证通过)
- [x] 启用 (仅 approved 可 enable)
- [x] API 路由:
  - POST /api/rule-proposals (创建候选)
  - GET /api/rule-proposals/:id (查询)
  - POST /api/rule-proposals/:id/validate (正反验证)
  - POST /api/rule-proposals/:id/review (approve/reject)
  - POST /api/rule-proposals/:id/enable (启用)

### 测试 (4 tests)
- [x] 创建提案
- [x] 正反案例验证
- [x] 未验证拒绝审批
- [x] 完整生命周期 (create → validate → approve → enable)

## 待验证 (需要模型凭据)

- [ ] `AGENT_MODEL` + `VISION_MODEL` 配置后 Agent 实际运行
- [ ] Midscene PlaywrightAgent 语义定位
- [ ] C0-C5 真实模型评估 (18 次运行)
- [ ] 规则复查比较 (首次探索 vs 规则复查的成本)

## 统计

- 源文件: 44 files
- 测试文件: 9 files
- 测试用例: 63 tests (全部通过)
- 代码行数: ~5,300 lines
