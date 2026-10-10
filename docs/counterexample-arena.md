# 长期反例靶场

2026-10-10；基线为已合入 main 的 `1d2748b`。本轮将三类成熟行为接到一个独立本地入口，共 14 个变体，未新增规则、执行器、评分器或模型平台。它们是开发回归资产，不是未见保留集。源代码中的旧状态说明以当前[规则接入](rules-and-rule-library.md)、[弹窗契约](popup-checks.md)为准，不重新解释历史成绩。

## 盘点与去向

| 行为/反例 | 已在 Git 的长期资产 | 当前缺口与本轮处理 |
| --- | --- | --- |
| 两步嵌套弹窗、宽窄视口、普通按钮不能充当浮层、隐藏节点替换 | `scripts/parallel-popup-real/fixtures.ts`（`71eb6b4`）；`scripts/popup-ui-contract/review-regressions.ts`（`373abc8`）；`src/execution/popup/geometry.test.ts`、`src/inspection/popup-effect.test.ts` | **本轮入库接线 CA01–05**。直接复用页面；把四个既有 effect 反例小幅抽取为共享私有输入，原脚本继续使用同一份。几何和功能分别核验。 |
| 图片等比留白、合法裁切、真实拉伸、无保形依据 | `evaluation/fixtures/image-shape.ts`（`01fb867`）；`src/execution/image-paint.test.ts`、`image-visibility.test.ts` | **本轮入库接线 CA06–09**。复用原 PNG 和页面生成器；增加正常产品保形说明，以真实响应字节绑定资源。D004 仍默认关闭。 |
| 操作文字裁切、兄弟背景遮字、合理滚动、不支持颜色 | `evaluation/fixtures/control-layout.ts`（`4983896`，由 `3350042` 整合）；`src/execution/layout-facts.test.ts`、`layout-observation.test.ts`；`scripts/validation/rules-clipping-overlap.ts` | **本轮入库接线 CA10–14**。原 fixture 不改；同一页面可同时供 D001/D002 和指针采样使用。未把矩形相交当作遮字结论。 |
| R0 更新反馈 Ready/Wrong、结果节点重建、错误引用/目标/旧动作、重复读取与新证据恢复 | `scripts/validation/r0-remediation.ts`（`5f8eee9`）；`scripts/validation/r0-default-check-v2.ts` 的同步/延迟/数字结果；`evaluation/private/url-scan/fixture.ts` 与独立 truth/replay | **已有可复用，保留引用**。前两者页面嵌在验收 runner，证据在本地 `data/r0-remediation/`、`data/r0-default-check-v2/`；不再复制同类页面。节点身份 unknown 已由 CA04 提供可访问入口。 |
| R1 三阶段、状态循环、切换视图回访、重复缺陷、名称歧义、合理输入上限 | `scripts/r1-product/fixtures.ts`（最近 `ddf1dd9`）、`validate.ts`、`acceptance.ts`；`scripts/r1-controlled-loop/fixtures.ts` | **已有可复用，保留引用**。独立页面生成器和原工作流回归已在 Git；离线冻结输入在 `evaluation/fixtures/legacy-runs/`，不是新的盲测资产。 |
| 弹窗异步/已存在/多浮层、内部滚动、变换 unknown | `scripts/popup-ui-contract/validate.ts`、`scripts/popup-product/validate.ts`、`src/execution/popup/geometry.test.ts` 与 `ui-runtime.test.ts` | **已有回归，保留引用**。旧脚本 URL/title 有测试语义，不直接作为 Agent 新靶场入口；内部滚动与复杂绘制边界不为凑数再造页。 |
| 并发取消、迟到结果、子证据互换、数据库篡改、费用 unknown/超限 | `scripts/validation/parallel-popup-product.ts`；`src/execution/popup/ui-runtime.test.ts`；`src/execution/completion-integrity.test.ts`；`evaluation/support/campaign-ledger.test.ts`、`campaign-session.test.ts`、`cost-reconciliation.test.ts` | **协议/集成回归保留**。网页无法证明账本、取消传播、证据所有权和持久历史正确。原数据库和费用证据留 data/归档，不做 UI 故障开关。 |
| DNS fake-IP、私网/重定向、预算与完成证明 | `src/execution/network/{resolver,boundary-dns,session-dns,acceptance}.test.ts`；`src/inspection/completion.test.ts`；[R0 接手](r0-closeout.md) | **协议回归保留**。历史公网拒绝是网络观察，不是页面缺陷，不用本地页面冒充公网复现。 |
| 动作前登记的资料路径，第一步创建第二步按钮后准入失败 | 原失败保留于 R2 工作区 `data/reviews/r2-maintainer/REVIEW.md`、`dynamic-control-repro.ts`；原审查候选 `aa535ca`、交付 `30002a3`；修复 `d8b5cee`、证据交付 `53d60ae` | **R2 已修复，有独立长期回归，待整合**：`scripts/validation/r2-product-sources.ts --dynamic-only` 与 `evaluation/r2-product-sources/dynamic-admission.json` 已在 R2 分支入库；整合后才可与本靶场在同一 checkout 使用。本分支只建立引用，不复制页面或执行器。 |
| 文字消失、加载占位、缺图及同区替代材料 | `src/experiments/rules-batch2.test.ts`、`src/execution/ui-rule-integration.test.ts`、`scripts/validation/rules-clipping-overlap.ts` 的 existing 场景；[第二批](rule-library/rules-batch2.md)、[普通接入](rule-library/rules-scan-integration.md) | **已有回归/本轮暂缓新增入口**。本轮选成熟裁切/覆盖与滚动对照；合理加载不是持续缺陷，缺图审查也不是确定缺陷或健康 pass。 |
| 原 Jira 图片/文字报告、旧真实网站扫描 | [D004 来源与范围](rule-library/image-shape-candidate.md)、[整合交接](rule-library/rules-main-integration-handoff.md)；旧索引与归档 Git、原工作区 data | **暂缓**。缺原资源、设计附件或完整可重放环境；本轮全部只称“合成机制示例”，不称原 Jira/网站复现。旧日志不批量进 Git。 |

历史计划按 `git show archive/pre-r2-cleanup-20261010:<旧路径>` 只读查阅；不恢复 plans 树。清理后的冻结资产和旧全套失败基线见[维护记录](maintenance/pre-r2-cleanup.md)。本轮未逐一重核所有旧 data 原始包，盘点依据是现存源码、回归及已注明来源的交接索引。

R2 整合交接核对（2026-10-10）：只读核对实现 `d8b5ceec8d5f2a72bbc3301971e760dd7566a989` 与交付 `53d60ae7749a0b9b6749f585f00af0055d1385e4` 的 Git 内容。独立动态入口覆盖健康、错误结果、目标缺失、重名、未登记额外按钮、默认样本仍 pending 六种情况，并保留重启与准入证据篡改回归；准入绑定动作前冻结的资料名称、唯一原节点、前置条件及预算，不开放任意新控件。上述两个路径尚不在本靶场分支，可先用 `git show 53d60ae:<路径>` 核对；整合并构建后再使用 `DOTENV_CONFIG_PATH=/dev/null pnpm exec tsx scripts/validation/r2-product-sources.ts --dynamic-only`。其收据记录的是 **fixed-local 固定模型 + 真实 Chromium**，不证明真实 Agent 自主提取或选择能力，不计入下方 14 个靶场变体的验证成绩。本次仅更新目录交接，未重跑该回归；原维护者失败反例和首次八场景证据继续保留。

## 三个场景族与私有预期

下表仅供操作者和维护者，不交给被测 Agent。ID 稳定，浏览器 URL 一律为 `/`；场景表、私有预期位于 `evaluation/private/counterexample-arena/catalog.ts`。

| ID | 来源与触发步骤 | 健康/缺陷对照、适用边界及私有预期 |
| --- | --- | --- |
| CA01 / CA02 | 复用 parallel-popup-real `/p/two`；More options → Details；分别 640×480 / 320×480 | 同一固定面板，宽视口完整可见 **pass**，窄视口外框越界 **fail**。这里只是“两步嵌套入口”，不是同时打开两个嵌套模态。未建立按钮功能完成结论。 |
| CA03 | 373abc8 fixed-button-text-change；点击 Open details | fixed 普通按钮改字后仍是按钮；**无浮层**，不是 UI pass；显式浮窗效果 **unverified**。按钮边框、背景、名称不能使它变成浮层。 |
| CA04 / CA05 | 373abc8 replace-hidden-original-target / native-dialog-appears；点击 Open details；640×480 | CA04 克隆替换隐藏面板后可见，几何 **pass**，身份替换使功能 **unverified**；CA05 原生 dialog 出现，几何 **pass**、命名效果 **verified**。页面公开相同的动作前功能要求，检查器不能仅凭结果字样声称原目标已验证。 |
| CA06 / CA07 | 原 image-shape fixture；打开页面；1280×768 | 同一 120×60 有透明边距的 PNG，在 240×240 框中 contain 留白 / cover 裁切均保形 **pass**。合法裁切、透明边距不能误报为拉伸；不评价裁切美观或源码圆形语义。 |
| CA08 / CA09 | 同一图片以 240×60、fill 显示；打开页面；1280×768 | CA08 有公开保形规格、精确资源合同，非均匀缩放 **fail**；CA09 没有保形规格，不提供合同，**unknown**。不能从 alt、比例异常或私有 ID 推导保形义务。 |
| CA10 / CA11 | control-layout healthy / clipped；打开页面；1280×768 | 黑白 Arial 单行原生按钮；CA10 两规则实测 **pass/pass**；CA11 高 12px、overflow:clip 的垂直墨迹损失，D001 **fail**、D002 **unknown**。不能将裁切替代为覆盖结论。 |
| CA12 | control-layout overlap；打开页面 | 兄弟按钮背景擦除首按钮部分文字，D001 **unknown**、D002 **fail**；兄弟 pointer-events:none，不能因鼠标仍命中首按钮就断言文字无遮挡。 |
| CA13 / CA14 | control-layout scroll / unknown；打开页面 | CA13 窄按钮可水平滚动，实际滚动到达已核验；CA14 navy 字色超出支持范围。两规则均 **unknown/unknown**，不误报，也不冒充健康 pass。健康对照 CA10、缺陷对照 CA11/12。 |

每个场景的确定性复位相同：页面无服务端可变业务状态、无存储、无定时任务；新建匿名浏览器 context 后访问同一 `/`，恢复初始状态。同文档 reload 也已逐例核验恢复初始 DOM。切换场景必须先结束本轮、关闭浏览器并停止旧服务，再以另一个 ID 启动；禁止活动检查期间切换。并发运行使用独立进程/端口/context，同一窄宽对照无共享可变状态。

## 公开与私有边界

- `evaluation/fixtures/counterexample-arena/pages.ts` 仅组装公开产品界面；原 fixture 的服务端 mode/原路径不会出现在响应里。图片合同中的规格来自公开产品说明，真值从不补写到产品说明。
- `server.ts` 仅绑定 `127.0.0.1`，只提供 `/`、`/emblem.png`、favicon；拒绝查询选场景、未知路径、写请求、控制路径及源码路径，无目录浏览、source map 或公共答案 API。CSP 禁止外部资源和网络连接。
- 沿用 `evaluation/private/url-scan/fixture.ts` 的**进程内私有控制**：选择在启动时完成，此后不可变，没有 HTTP reset/控制口，因此不新建 token 协议。与 checkout/export 的可变业务不同，这里不共享需要受 token 保护的持久状态；不开放热重置。
- `--list`、私有 catalog、验证结果和 data 只给操作者，不作为 Agent 输入或静态资源。Agent 只拿 entryUrl、视口及正常任务目标；正式执行器使用这些 loopback 页面时仍须由部署端配置精确可信 origin，不更改产品网络权限。
- 验证入口调用现有只读采集器和规则工厂，不创建模型客户端，不载入历史评分答案作为页面内容。校验过程里的截图/字形参考属于私有证据。

## 启动、选择与免费验证

在本分支仓库根目录执行；不使用有他人修改的默认项目目录。Node 24 与锁定依赖：

```sh
cd /Users/xietian/.codex/worktrees/counterexample-arena/ui-sentinel
export PATH=/Users/xietian/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH
pnpm install --frozen-lockfile
DOTENV_CONFIG_PATH=/dev/null node --import tsx scripts/validation/counterexample-arena/serve.ts --list
DOTENV_CONFIG_PATH=/dev/null node --import tsx scripts/validation/counterexample-arena/serve.ts --case CA02 --port 4190
# 浏览器访问 http://127.0.0.1:4190/，视口 320×480；Ctrl-C 停止。
# --port 0 由系统选空闲端口，实际地址与视口只打印到操作者终端。

DOTENV_CONFIG_PATH=/dev/null node --import tsx scripts/validation/counterexample-arena/validate.ts
DOTENV_CONFIG_PATH=/dev/null pnpm typecheck
DOTENV_CONFIG_PATH=/dev/null node node_modules/vitest/vitest.mjs run \
  src/execution/popup/geometry.test.ts src/inspection/popup-effect.test.ts \
  src/execution/layout-facts.test.ts
```

`validate.ts` 用项目现有 esbuild 编译一个隔离 runner，避免 tsx 的浏览器回调闭包辅助函数问题，不改共享构建配置。真实 Chromium 按各例规定视口访问 HTTP 页面；先独立核实 DOM/几何/资源字节或滚动状态，再调用生产 `popupCollector` / `evaluatePopupEffect`、`readImagePaintFacts` / D004、`readLayoutFacts` / `measureLayoutPixels` / D001/D002。没有固定模型，也没有真实模型请求。

每次独立写 `data/counterexample-arena/<timestamp>/`：summary、源码与 bundle SHA256 清单、每例完整采集/规则输出、截图、图像响应字节、字形参考图。失败保留失败截图和 summary 并非零退出，不覆盖旧结果。仅作为 fixture 与检查器接线验证：**不证明 Agent 自主选择入口/规格/合同，不证明正式执行器完成门、持久报告或网络策略通过**。D004 合同仍由验证宿主根据公开规格显式绑定；不能宣传为模型自动识别图片意图。

## 本轮验证

2026-10-10，Node 24.21.0、Playwright Chromium：

- 新入口 **14/14** 通过：独立 DOM/几何/图片字节/滚动见证 + 原采集器/检查器实测；14 次复位和页面私有标签/控制路径隔离检查均通过。
- 最终证据：`data/counterexample-arena/2026-10-10T13-19-33-876Z/`。`source-manifest.json` 绑定实际源码与编译 bundle；summary 的 commit 是开发基线 `1d2748b`，此次未提交新文件由源码摘要标识，不冒充干净基线原有结果。首次同样 14/14 的记录保留在 `2026-10-10T13-17-05-600Z/`。
- 原 popup effect 浏览器脚本抽取后 **4/4** 通过；结果 `data/counterexample-arena/review-regressions.json`。定向 Vitest **3 文件、31/31** 通过（geometry / popup-effect / layout-facts），与新入口覆盖重叠，不相加宣称覆盖数。
- `--list`、`--case CA02 --port 0` 的真实 HTTP 启动和退出已验证；抽查窄弹窗、等比留白、兄弟遮字截图与实测一致。
- 类型检查、`pnpm build`（服务端、工作台、两个原靶场）、改动的 8 个 TypeScript 文件格式、差异空白及两份文档本地链接检查均通过；锁文件、package.json、共享构建配置未改。

未重跑 R0/R1 全矩阵或全套测试；[维护记录](maintenance/pre-r2-cleanup.md)的旧失败基线不在本轮宣称修复范围。没有付费、公网或固定模型调用。页面与检查器接线通过不代表真实 Agent 自主能力通过，合入仍由维护者独立审查。
