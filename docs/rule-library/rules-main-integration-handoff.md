# 规则分支 → main 整合交接

## 维护者实际整合结果

2026-10-09，用户授权维护者审阅并整合。完整交付 `723185ea62141239de38546d621c1cd7bb6d3f3b` 已正常合入 main，merge 为 `5e3255b405dad8a9214fd1206668b1935adebeee`，第一父为 `60c315a04e30b84356381763e33dd976a3ace836`，第二父为交付 SHA。合并无冲突，提交树与规则交付树完全相同；没有产品补丁。

维护者另行阅读了执行器/观察适配器、D005/D004判定、R005材料、历史投影与工作台、DNS配置/resolver/session/transport的实际代码及差异，未发现阻止本次合并的明确缺陷。下方已知支持范围、性能和关联证据校验局限继续适用；这次针对整合边界的代码审阅不是全量运行时证明。

main原有Roadmap先逐字备份，合并前后摘要一致，再作为 `fd9dbd2` 单独提交保存完整维护记录。原主目录、规则/R1分支和本地原始数据未改动或删除。备份及构建日志位于 `/Users/xietian/Documents/ChatGPT/ui-sentinel-local-archive/rules-integration-20261009-7lj2v0zp/`，不随Git分发。

在接收代码的main工作区使用Node24.21.0、pnpm10.17.1执行 `pnpm install --frozen-lockfile --offline`，下载0；随后 `pnpm build` 退出0，包含类型检查、服务端、工作台和两个靶场构建。未启动扫描或服务，未修改部署配置，未重跑旧测试/浏览器矩阵、公网或真实模型。历史6场景仍按下方原状态解释。当前产品说明见[规则](../rules-and-rule-library.md)、[架构](../architecture.md)及[Roadmap](../product-roadmap.md)。回退产品合并可使用 `git revert -m 1 5e3255b405dad8a9214fd1206668b1935adebeee`，之后同步对应文档状态；不硬重置、不删除证据。

## 原准备交付记录（保留原时点）

2026-10-09（Asia/Shanghai）。**整合准备完成，建议将完整规则分支作为一个合入单元；本次实现者静态自检未发现明确的代码阻塞。** 本轮只增加交接文档、原任务说明快照和静态清点索引，没有功能修改，因此没有重跑测试、构建、浏览器、公网或模型。尚未合入 main、未 push；这不是独立复核或新的全量验收。

## Git 身份与现场

| 身份 | 完整 SHA / 状态 |
| --- | --- |
| 本轮接手、静态检查的源 HEAD | `fae4819094f79e5e84cdafc0ebdb27a7a2080fff`，`codex/rule-image-proportion` |
| 实际目标 main | `60c315a04e30b84356381763e33dd976a3ace836` |
| 实测 merge-base | `60c315a04e30b84356381763e33dd976a3ace836`；目标已是源的祖先 |
| 产品入口交付基线 | `ea38712ecb747759c0b57d863c4d889bb0045b46` |
| 实现及既有产品链路实际运行版本 | `156ffbea3bdbeb0ee7e4a8ace0bbe56efd3d9a44` |
| 既有交付文档/证据 | `1c89b2166075a689d0ddda089cfdc1869fe55103` |
| 已完成的 main → 规则分支合并 | `77699a861c3f3ba07f08bb2d3c3cd43aabdd987e` |

工作只在 `/Users/xietian/.codex/worktrees/rule-image-proportion/ui-sentinel` 进行。上级 `/Users/xietian/.codex/AGENTS.md` 为空，沿路径及仓库内未找到其他适用 AGENTS.md。主目录 `/Users/xietian/Documents/ChatGPT/ui-sentinel` 未用于开发、未切换分支。

目标检查位置为 `/Users/xietian/.codex/worktrees/r0-main-integration/ui-sentinel`。其唯一未提交修改 `docs/product-roadmap.md` 未编辑、暂存或提交；首次只读记录 SHA-256 `477540078dbe024653de4aa7cb78b913d2ac5b45cf7b94044d1339e46df0eb4f`，结束前再次读取为 `c708ca535760f7eb946fdaae66047f489111454a5a846a102e387398fb2a9faa`。两次之间该文件有外部并发修改，main HEAD 及唯一脏文件路径不变；本任务没有写入或恢复它，也不声称其字节未变。规则分支相对 main 的已提交差异不包含该文件。

接手时规则 worktree 仅有 `rules-scan-integration-current-task.md` 未提交修改。已先读取完整正文及 diff，将 **3423 字节原文逐字保存**到 [接手前快照](https://github.com/FailLone/ui-sentinel/blob/25409ce/docs/rule-library/evidence/rules-main-integration-current-task-before-20261009.md)，SHA-256 为 `83bd7ecb3249845cb8ceda6c2c1bc1ae68a7e72b44283f749ed17b74c577d7b3`，再将[当前入口](https://github.com/FailLone/ui-sentinel/blob/25409ce/docs/rule-library/rules-scan-integration-current-task.md)改为本轮已完成状态。快照及旧文档中的任务指令均为历史记录。

本文件的交付提交是以上源 HEAD 的文档后继，不改变实现身份。可在交付仓库用 `git log -1 --format=%H -- docs/rule-library/rules-main-integration-handoff.md` 取得包含本交接的完整提交 SHA；维护者应冻结实际要合入的完整 SHA，不能只合入上表的旧源而遗漏本轮交接。

## 全分支差异与实际依赖

对实际 `main..fae4819` 做完整清点：105 个文件，27,675 行新增、128 行删除及一张 PNG，24 个提交（含两个历史 merge）。不是仅检查 `156ffbe` 或最后一次提交。[机器索引](evidence/rules-main-integration-static-audit-20261009.json)逐文件保存类别、源版本字节数与 SHA-256；本轮新文档不混入这份接手基线清单。

| 层 | 相对 main 的实际内容与依赖 |
| --- | --- |
| DNS 兼容 | `6566d568f5cd1bbe9b6afaef1b12a4b90463288a` 添加部署 DNS 配置、resolver、创建预检、network session/transport/boundary 接线、测试以及 package/lockfile。`487dba2df1bcee7a0947d5b4dc4db0e433f19d64` 把 DNS 历史合入规则分支。普通 ui-scan 与两个实验宿主共用此网络实现。规则算法不要求开启 DoH，但最终分支依赖这些模块/依赖包组成的整体，不能只拿配置或最后的执行器提交。 |
| D004 图片比例 | `01fb867ab0ff74887eef598ea96d09d99cd6649b` 引入默认关闭 builtin、图片事实类型与采集、注册器/缓存约束、共享 browser/executor 接点及合成夹具。合同必须绑定具体资源摘要、页面、视口和明确设计依据；不是通用图片语义判断。 |
| 图片合同候选 | `330c5ba844ef420778b3b9124f528f772207ae4d` 添加独立 host/CLI 和快照绑定消费。依赖 D004、共享观察及 pinned 网络边界；不会在普通扫描中自动生成/批准合同。 |
| 共享采集修正 | `46cc7c035b87f5b69469f66563b86d37f71f72cb` 保留实验观察 caret 样式；`abb27ddf435cca8090b2e44511a035ff53bb0b11` 增加共享有界几何扫描。普通扫描接线后来复用了这些 browser/image-paint 能力，即使 D004 不启用也不能直接删去。 |
| 只读诊断 | `36e008f54d32d8f5ee1e185e4d7c6daabc57d478` 在 image-bindings 中共享 `validateBinding`，增加 diagnose/CLI。普通 ui-scan 不调用该诊断，但它与 D004 消费共用同一文件和校验门，拆除会扩大本轮改动。 |
| D005 / R005 算法 | `5fa18aa9ed7bedb90ec1a9b5982e0c3605b712fc` 添加 `batch2-facts`、文字像素核对、D005 builtin、`image-fallback-review`、独立 host/CLI 与测试。虽然目录叫 experiments，普通执行器已直接 import 其中事实与审查模块；不能因目录名将它们排除。 |
| 普通扫描入口 | `156ffbea3bdbeb0ee7e4a8ace0bbe56efd3d9a44` 在共享执行器自动调用 D005/R005，增加被动请求账本、历史投影、工作台分区和定向验证脚本。依赖前述采集、算法、证据保存、现有 main 的检查账本/完成门。API 沿用 `POST /api/runs` 的 `kind: ui-scan`，没有新 API 开关。 |
| 最新旧公网记录 | `fae4819094f79e5e84cdafc0ebdb27a7a2080fff` 仅新增旧公网验证说明及索引两个文件。与产品运行版本没有代码差异。fake-IP 拒绝是当时网络边界记录，不是本轮整合阻塞或新任务。保留提交。 |

清点分类如下；分类是审阅用途，不代表要删文件或拆提交：

| 类别 | 文件数 | 处理 |
| --- | ---: | --- |
| 运行实现、配置和依赖 | 31 | 整体保留，含位于 experiments 下被普通扫描 import 的模块 |
| 测试与夹具 | 14 | 保留既有回归资产，本轮未执行 |
| CLI / 验证工具 | 4 | 保留可复现入口，不自动执行旧公网脚本 |
| 交付说明与关键证据 | 19 | 包括 [普通入口说明](rules-scan-integration.md)、[第二批算法](rules-batch2.md)、[诊断](image-binding-diagnosis.md)、D004/采集边界、[DNS 交接](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/network-dns-compat-handoff.md)与相关索引/截图 |
| 原规则知识库与映射 | 27 | 保留来源追踪；23 条知识条目不等于23条启用的运行规则 |
| 历史实验材料 | 10 | 旧公网、caret/visibility 索引及旧任务锚点等；保留审计链，不作为当前执行清单 |

接手时 **未忽略的未追踪文件为0**。被忽略的本地目录为 `data/`、`dist/`、`midscene_run/`、`node_modules/`、两个 arena 的 `dist/` 与 `node_modules`。它们不随 merge 转移；构建/数据库/截图原始包不能被误认为已进入 Git。本轮不删除或提交这些目录。

## 实现者静态自检结论

以下是本轮读代码、对照 Git 与既有收据得到的实现者自检，不是独立审查，也不宣称验证所有运行时交错。

| 核对项 | 实际代码依据及结论 |
| --- | --- |
| 默认参与与开关 | `executor.ts` 仅在 `uiScan` 时创建 `createUiRuleObservation`，在 `performChecks` 补充 D005 RuleResult 并持久化 R005。D004、D005 在 builtin 中仍 `enabled: false`；D005 由 ui-scan 专用 factory 调用。`config.features.urlScan` 仍只认 `EXECUTION_URL_SCAN === '1'`，没有全局启用。 |
| 业务模式 | 无 uiRules 适配器，不新增 D005/R005；默认启用仍只有 business-outcome、overlay-blocking、response-time。业务默认不采集图片资源；显式启用图片合同规则的宿主除外。共享 browser 的新增参数均可选。已有2项定向测试之一覆盖此默认注册/上下文，不能推断完整业务旅程已重验。 |
| 单次共享观察 | `captureCurrent` 在同一次 observePage 前后采事实并复用 screenshot/snapshot；原观察版本变动时的 recapture 路径仍在。ui-scan 使用 `caret: initial`，避免截图隐藏 caret 引起样式变动；未强改其他业务截图默认。像素解码在同一 browser 的独立拒绝网络 context 中处理已有 PNG，并在 finally 关闭。 |
| R005 不算缺陷/pass | `reviewImageFallbacks` 返回 review-material，`ruleEvaluated:false`、`confirmedDefects:0`、`healthyPasses:0`；executor 只把 D005 放进 RuleResult 列表。工作台单列待审查/证据不足，loaded 为 not-applicable。review-needed 不证明身份等效或替代正确。 |
| unknown 与完成门 | D005 保留 unknown/省略明细；只有 fail 进入既有 finding 路径。稳定、清洁、未过期、同截图的支持范围限制可附 `unchecked`，在原 inspection-host 中记录为 unverified/unsupported 且不选为完成义务，**不是 verified/pass**。变化、干预、过期不满足此豁免；原完成门/采样模块相对 main 无改动。部分目标 fail 仍可与其他 unknown/省略并存，报告必须按行阅读。 |
| 普通观察失效 | 适配器对 before/after/live 的页面、视口、documentId、nodeId、DOM epoch、样式及图片加载/资源字段比对；D005 再核 run/url/viewport/screenshot 与5分钟期限。新观察清空 `last`，D005 路由缓存 `never`；重复结果也先读 live，再核完整性和期限。变化得到 unknown，不把旧结论用于当前目标。此为有界观测，不是浏览器状态持续不变的证明。 |
| D004 消费与诊断 | `validateBinding` 校验会话候选、期限、原 evidence hashes、同一 ElementHandle、页面/视口、资源URL/SHA、paint identity及干预；新 observe 使旧候选失效。diagnose 不替换候选、不延长有效期、不转移确认，`checkInvoked/ruleEvaluated/canConsumeNow` 为 false。只有显式 check 输入完整依据且机器门通过才调用 D004。 |
| 报告与历史恢复 | `run-report.ts` 向投影器传本 run 的 artifacts；`projectUiRuleReports` 校验正文版本/runId/摘要、同次截图摘要及关联证据可读性。缺失/改动正文或截图返回 unavailable；不重新调用规则推断历史。旧 run 没有事件则无分区，业务投影为空。**其余关联文件只验证存在和可读，不逐一校验内容摘要**，因此不声称所有关联证据均可检测篡改。 |
| 资源与预算 | 每次最多16控件、16图片；文字绘制扫描1024元素/64祖先，单文字区域100,000像素；图片几何最多32目标、4096节点、256相交候选、250ms扫描预算，decode等待150ms。请求账本256条；资源 collector 最多32 URL、保留静态 PNG/JPEG 单资源≤4MiB、读取等待100ms；不会主动补抓。目标网络仍500请求、单响应10MiB、总50MiB，字节预算同时约束 wire/decoded。无新模型调用。 |
| DNS 默认与私网边界 | `readDnsConfig` 默认 system/5000ms、无默认公共 resolver；DoH 必须部署显式配置 endpoint/bootstrap/精确域名清单，无自动 fallback。创建预检优先暴露混合回答中的私网地址；每次连接重新解析并核全部地址，再固定选定地址连接，保留域名 Host/SNI/证书校验。`address.ts`/私网分类相对 main 未改；fixture 豁免仍来自部署 exact origin，DoH bootstrap 授权不等于目标私网授权。 |

## 复用证据、构建对应与限制

首选阅读 [rules-scan-integration.md](rules-scan-integration.md) 和 [既有机器证据](evidence/rules-scan-integration-20261009.json)。从 `156ffbe` 到本轮检查的 `fae4819`，`src/`、`scripts/`、`evaluation/`、package/lockfile、`.env.example` **零差异**；本轮继续保持零功能改动。

只读摘要核对结果已写入[本轮索引](evidence/rules-main-integration-static-audit-20261009.json)：普通接入9项源码、5项构建、155项 localFiles、4项日志全部匹配；第二批8项源码、52项最终本地文件、9项日志匹配；诊断4项源码、83项本地文件匹配。各清单有重叠，不能相加为独立文件或测试数。摘要匹配证明保留文件与既有索引一致，不是本轮重新测试。

既有产品运行的 server bundle SHA-256 为 `dcb324daa149844d081896364bc0210d187b00480451407b4d0d096006254129`，工作台 JS 为 `caf89d9f615d938281dd62dce59ebb98225c7f4cfadde9098ce466dc1962fd5b`；路径和其余构建摘要见既有索引。没有重建或将旧 dist 冒认为 main 新构建。

| 已有场景 | 本轮读取到的历史运行状态 |
| --- | --- |
| 工作台只填网址，文字 fail 与缺图 review 分区 | blocked |
| 黑白健康文字、已加载图片 | blocked |
| 阴影等不支持绘制 | blocked |
| 20控件与文档预算缺口 | blocked |
| 图片/POST 网络干预 | blocked，provider 调用0 |
| Switch 替换节点，旧 fail → 新 pass | completed / goal-reached |

六项是 **6个产品链路断言场景通过，不是6次完整扫描通过**。前五项保留完整扫描义务、干预或固定 provider 的部分收口；另有2项业务默认/历史截图测试。第二批8项算法场景是更早的另一组证据；诊断6场景加最终2项身份复验也不能混算。全部能力范围、初次失败与证据时间差沿用各自交付说明。本轮不重验 R0/R1，不设适用率门槛。

非 Git 原始材料的定位必须以以下根目录加索引中的 `path` 为准：

```text
/Users/xietian/.codex/worktrees/rule-image-proportion/ui-sentinel/
  data/rules-scan-integration/2026-10-09T08-14-31-836Z/
  data/rules-scan-integration/                 # 上层日志
  data/experiments/rules-batch2-20261009-35dccaf/
  data/experiments/image-diagnosis-20261009-ea23bfc/
  dist/web/                                  # 索引指向的历史工作台构建
```

上述是**本机不可随 Git 自动迁移的证据**，服务端口已是历史地址。Git 内有索引、CLI样例和工作台截图；新机器上不要凭历史 artifact API URL 猜路径。若维护者需要原始数据库/PNG/收据，应按索引从此 worktree 另行复制并校验摘要，原始大数据不要加入 Git。其他旧公网材料仅保留其既有索引，本轮没有重核其全部原始包或重访网址。

以下为已知局限/后续可选改进，不作为本轮新开发或合入门槛：

- D005 只支持稳定原生纯文字 button/a 的有限平面绘制；黑白像素见证不是通用可读性/WCAG。R005 只枚举 native img，同父关系不证明实体身份或替代含义；无 img 的头像区域不在枚举范围。
- 普通适配器比对 DOM/加载字段，不能把它宣传为所有异步网络变化的实时监控。重复评价的缓存键没有请求账本版本；仅请求元数据变化时可能延后更新 R005 材料，后续正式观察重新生成。它不产生缺陷或健康 pass。
- 数量/绘制扫描预算不等于整段函数的严格CPU/内存上限：`readBatch2Facts` 仍先 querySelectorAll 枚举、为默认集合生成 selector，再截取16项；存在全页动画查询。图片 body 未声明长度时先读取再判4MiB，普通 ui-scan 仍受原网络10/50MiB预算约束；多次观察会重复保存证据。可在专门性能任务中收紧，不在本轮重构。
- 历史投影正文2MiB检查在 readFile 后，关联证据也会读取；没有完整证据图的摘要认证/报告流式内存上限。当前历史测试仅证明正文持久投影及截图缺失/改变拒绝，不能扩大为所有文件防篡改认证。
- 13次观察的52–215ms是共享 observePage **之外**的新增处理小计，新增图片采集仍在共享观察里；未做 main/candidate 性能差分，不代表公网延迟。
- DNS 保留原 system 路径，但增加有界解析等待/失败诊断；Node 系统 getaddrinfo 超时后底层查询可能晚到，晚到结果不继续连接。DoH 不含通用代理/VPN/fake-IP适配；旧公网成功或拒绝都不能推断今日全网可达。

## 最小整合方案、维护者步骤与回退

**保留整条分支，用一次正常 `--no-ff` merge 形成可整体回退的交付单元。** 当前 main 已在源历史中，若目标仍是固定 SHA，此操作无需重新拼接代码或解决源/目标冲突；新增 merge commit 仅用于明确交付边界。既有默认关闭实验、文档和历史材料一起保留，比手工挑提交/删 experiments 更少改动且保全依赖。无需重基、squash、删除 `fae4819` 或再做 DNS 实验。

以下为维护者后续操作，**本轮未执行**：

1. 从本交付最终回复/本文件 git log 取得交付 SHA，并冻结为 `RULES_SOURCE`。核对当前源分支 tip 等于所审完整 SHA，目标仍为 `60c315a04e30b84356381763e33dd976a3ace836`；用 `git diff --stat <目标> <交付SHA>` 阅读整个单元。若目标推进，先查看新增差异，仅处理实际冲突及受影响验证，不把旧六场景重跑设为默认前置。
2. 保留维护者 main worktree 的 Roadmap 修改。建议在**新的、干净的维护者整合 worktree/分支**从目标 SHA 开始，不在脏 main 或主目录操作；分支命名如 `codex/rules-main-integration-review`。确认工作区干净后执行 `git merge --no-ff <交付完整SHA>`，记录合并 SHA 及父顺序（第一父为目标，第二父为交付）。不要 cherry-pick `156ffbe` 或单摘最后文档提交。
3. 正常代码审查按上述依赖/自检/限制核对。未改代码且构建身份一致时，复用既有证据即可；只有实际整合冲突或代码改动才做受影响的免费定向验证。独立复核如由维护者进行，应另记结论，不能把本文改名为独立审查。
4. 维护者按项目自己的提交/发布流程接收该整合分支。已有启用 ui-scan 的部署正常安装锁定依赖并构建 server/工作台后即可用原入口；不要拷贝旧 dist 当发布包，不修改 `EXECUTION_URL_SCAN` 或写入本机 DoH 实验配置。已有业务部署保持其配置。

回退分两层：尚未落定的整合若发生冲突可在这个干净整合 worktree 中 `git merge --abort`，不清理证据、不操作维护者脏工作区；已接收的正常 merge 用 `git revert -m 1 <整合merge完整SHA>` 生成反向提交，再按部署流程切回此前构建。不要硬重置 main、删除分支/数据库/证据或批量 revert 两个历史 merge。仅停用 DoH 时可由部署者恢复 `URL_SCAN_DNS_MODE=system` 并重启，这不会移除规则接线；要回退规则交付则用上述整合回退。

本次无数据库 schema 变更。回退不会删除已经保存的 artifacts；旧版界面可能不展示新 uiRules 分区，应保留数据库及原始证据，恢复新版后再读取。

**具体阻塞：未发现代码整合阻塞。** main 尚未接收、维护者尚未执行审阅/整合属于后续交付动作；脏 Roadmap 要保留，通过新 worktree 可避开，不能成为覆盖它的理由。旧 fake-IP 拒绝、公网适用率和未重复全量扫描均不作为本轮阻塞。本地提交交接后停止，不自动进入下一轮。
