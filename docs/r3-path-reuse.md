# 已验证资料短路径复用

保存完整健康路径，在同入口、同资料身份/版本的新运行重新执行和测量。候选只保存声明，不携带新运行权限、旧 ref 或成功证据。

## 产品入口与最短用法

支持 Node 24，沿用现有本机主模型配置。在本工作区安装锁定依赖、构建后启动：

```sh
pnpm install --frozen-lockfile
pnpm build
EXECUTION_URL_SCAN=1 EXECUTION_PRODUCT_SOURCES=1 pnpm start
```

1. 打开 `http://localhost:4111`，选择“网址 UI 检查”，填写网址、资料名称、版本和 Markdown。先完成一条健康资料路径。
2. 在该运行的产品资料报告点击“保存可复用路径”，复制返回的 `path-…` ID。服务端重新校验完整报告和原证据；不完整、有缺陷、有额外路径外动作或没有可保存目标描述时拒绝保存。
3. 新建运行，填写相同网址和相同资料名称、版本、正文，将 ID 粘贴到“复用路径 ID”。本次仍使用新会话、新动作、新测量；报告展示复用、交回或本次缺陷，并保留所有普通检查义务。

候选保存在本机数据库 `path_programs` 中。ID 是完整声明的内容摘要；保存相同候选幂等。没有自动全库检索、批量执行、跨项目共享、修改或自动淘汰接口。无需另开 R3 全局开关，非空 ID 是本次运行的显式启用项。不填 ID 的运行保留原有行为。正常运行在首次提取或交回后可能调用配置的主模型；下述免费验证只使用本地固定回复。

API：

```sh
# 从服务端已有完整健康运行保存；不接受客户端编写的程序体。
curl -X POST http://localhost:4111/api/runs/RUN_ID/path-program
# 查看已保存声明及原运行定位；旧动作 ID 只用于溯源。
curl http://localhost:4111/api/path-programs/PATH_ID
```

`POST /api/runs` 沿用原 `kind: "ui-scan"`、`entryUrl`、`productSource`，增加 `pathProgramId: "path-…"`。仍须提交本次真实资料，不能只给 ID 继承旧来源。`GET /api/runs/:id/report` 新增 `uiScan.pathReuse`；新测量继续位于原 `uiScan.productSource`，发现继续位于原 `findings`。

## 支持与失效边界

- 同一精确入口 URL（含 query/fragment）、精确 origin、资料名称/版本/正文身份与当前 `product-path-12`；一条 1–3 步、不同本地 click/fill 控件、匿名无业务写入路径。页面结果节点在动作前已存在。候选来自完整健康运行，原动作必须有 `networkWrites: 0`，该运行不能夹带其他动作。
- 目标描述使用已观察的规范 CSS 定位、标签、公开稳定属性、控件名称和父容器描述。新运行重新观察 DOM，并检查来源中命名控件唯一性；不搜索“差不多”的替代节点。动态创建的下一步控件可在上一步后重新准入。任意 CSS 表达式不一定能转换为可保存描述，无法对应原公开节点时拒绝保存。
- 同结构跨运行节点本来就不同，不要求保留旧节点身份；同次复用从预检到绑定后的节点替换则拒绝。原执行器继续在派发、测量和截图处核对当前身份。公开结构完全相同并不证明任意网站业务语义没变；这仍是来源及原模型语义判断的适用边界。
- 来源/入口不匹配或候选不可用时，零复用动作、不安装旧计划，交回普通 Agent 阅读本次资料。计划安装后的目标/前置/预算失效将本次运行限制为只读检查、原引用核验和诚实结束；不在原运行替换计划或重复动作。修订路径须新建运行、重新验证、重新保存。
- 交回记录包含本次动作 ID、是否完成、各步测量、前置实测及未完成步骤；已测出的失败不列为“尚未测量”。真正的测量失败为 `measured-failure`，真实执行错误/取消保留原终态，不能伪装成缓存失效。无法判定的动作不重试；未知业务写入异常原样传播至既有隔离流程。
- `path-reuse:*` 是执行过程说明，不能核销任何检查。只有新运行的原登记、绑定、来源审阅、动作、效果测量及完成证明能产生 verified/covered。原证据不复制为新成功，其他必需或默认义务仍可阻止完整结束。
- 暂不支持导航路径步骤、登录角色、业务写入、多文档/多项目检索、结果容器执行后才创建、长流程、结构迁移、自动修订/淘汰或自动规则发布。没有新模型循环、任意 JavaScript 执行或额外预算。

## 免费验证与复现

所有输入均随 Git 保存，R3 验证直接复用 `evaluation/fixtures/r2-product-acceptance/page.ts` 和 `product-spec.md`；新增反例由启动前的操作员模式生成，不把模式标签或私有答案交给被测 Agent。没有读取 R2 原始本地证据。

```sh
export DOTENV_CONFIG_PATH=/dev/null
pnpm build
pnpm test src/execution/path-reuse src/inspection/path-reuse-contract.test.ts \
  src/execution/product-handoff.test.ts src/inspection/contract.test.ts \
  src/server/routes/ui-scan-runs.test.ts src/web/ui-scan-request.test.ts \
  src/web/ui-scan-report.test.ts
pnpm exec tsx scripts/validation/r3-path-reuse.ts
```

验证脚本启动临时本地网页、固定模型服务、正式编译后的 Server、真实 Chromium 和独立 SQLite；模型与视觉地址显式限定 loopback，不接受 `--real` 或付费入口。正常目标网络策略、取消、测量和完成证明都使用产品实现。日志、报告、截图、固定模型上下文和数据库保存在脚本打印的 `data/r3-path-reuse/<timestamp>/`；附件仍在本工作区 `data/artifacts/<runId>/`，不能仅复制报告声称原始证据完整。

模型额外文字解释仍未验证。系统交回报告保留已做事实与未完成步骤；历史真实失败及限定接收范围见[历史索引](archive/README.md)。
