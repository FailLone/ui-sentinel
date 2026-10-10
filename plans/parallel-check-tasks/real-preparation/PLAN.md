# 一次小规模真实并行弹窗验证：待授权

2026-10-10（Asia/Shanghai）。本轮仅完成免费准备，**真实付费请求 0**；未使用旧 USD 2.16 提案、旧研究授权或任何旧费用账户。已在原分支同步 main `5595a14`，未修改维护者 main 或旧脏工作区。

冻结运行源码：`c8f59a2`（完整 SHA 在 [manifest.json](manifest.json)）。清单 SHA-256：`26110502dfc06faadf0bf3d9f54302ba02c2cf54181f41775a001367ff213056`；构建 SHA-256：`e8792a14f7fa967cbb0bde1a75ba03915d896c19665d8f379911741d393aeca3`。清单记录逐文件源码摘要、Node 24.21.0、安装依赖版本/锁文件、构建文件、夹具字节、公开 API 输入、离线预期和公开报价。文档提交不会改变运行源码身份。

## 3 行、每行 2 个子执行

三个父任务顺序执行，每个父 Agent 自行调用真实 Mastra 委派工具，安排 320×480、640×480 两个独立子检查。真实模式不会安装固定决策器；公开目标只说明弹窗检查、委派、额度和诚实报告，不给正确按钮、隐藏答案或预期 verdict。HTML 可见按钮是正常页面证据；离线评分文件不进入 Agent/Jev 输入。

| 行 | 公开夹具 | 子目标评分 | 父范围评分 |
|---|---|---|---|
| P01 `/p/one` | 原生弹窗，另有排序、密度按钮 | 400px 浮层左边 20px：窄视口 fail、宽视口 pass；原入口动作/回执必须归属各子 run | 单独保留原覆盖和未完成项 |
| P02 `/p/two` | 含无关按钮的两步自定义浮层 | 公开路径 More options→Details；测量分别 fail/pass；不得把无关按钮当有用弹窗动作 | partial 不自动算失败，也不能因子目标成功伪造 covered |
| P03 `/p/three` | Details 只更新行内文本，没有浮层 | honest unknown：直接交接，或观察到预测未成立后补证/交接均可；不要求真实模型必须犯固定错误 | 报告缺失事实与默认义务，禁止无测量的 pass/fail |

分别记录：真实父委派是否成功、各子目标/入口路径是否正确、read/target/recovery 的实际使用、原动作/事项/回执归属、原报告持久化、父范围。P03 采用“预测可能不成立”而非强迫模型犯错；这比同时加入另一行多目标歧义更小，已覆盖诚实交接目的。本批不做通用排序 A/B，不推断统计加速比，不扩成任意站点验收。

## 模型、费用和期限

- 主模型：`deepseek/deepseek-v4.1-flash`，仅 **Wafer**，接受原协议对应的 `...-20260910` 响应身份；low reasoning，输出总上限 4096 tokens。
- 子模型：`typesafe/jev-1.13`，仅 **TypeSafe**，原响应身份 `typesafe/jev-1.13-20260917`。原 popup choice 协议和原 provider 实际发送、记账。
- 准备时已核对 [Wafer 公开端点报价](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4.1-flash/endpoints) 和 [TypeSafe 公开端点报价](https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints)。启动真实批次前再次无凭据查询公开报价；供应商、能力或价格超出清单即拒绝。原 Jev 每次调用仍做自己的报价检查。

| 限额 | 每父任务 | 全批 |
|---|---:|---:|
| 父主模型请求 | 10 | 30 |
| 子 Jev 请求 | 两子合计 6，每子最多 3 | 18 |
| 动作 | 父子共 6，每子最多 3 | 最多 18 |
| 原模型总预算 | 父子共 16 | 最多 48 |
| 运行期限 | 180 秒，包含子执行 | 可派发窗口 600 秒；连收尾墙钟上限 660 秒 |
| 单次请求期限 | 主模型 60 秒，Jev 原产品 8 秒 | 无更短的主模型诊断限额 |

额度算式：主模型按整个 1,048,576-token 上下文计输入、不抵扣缓存，加 4096-token 输出，`1,048,576×0.00000005 + 4096×0.0000016 = USD 0.0589824`，每次保守预留 **0.060**；Jev `32,000×0.000000042 = 0.001344`，沿用原预留 **0.003**。因此每行 `10×0.060+6×0.003=0.618`，全批 `30×0.060+18×0.003=1.854`，申请新增总上限 **USD 1.86**。启动公开报价查询不计为收费模型请求。

父主模型与两子 Jev 共享**一个新建、限额固定为 USD 1.86 的原 campaign 账户**，不是各自满额后相加。一次父请求加两子请求同时在途的最大预留是 0.066，连同此前已知、未知和其他持有额度，在同一原 SQLite 写事务中裁决；不足就停止。请求计数在异步派发前同步占额，父/子身份逐笔绑定，结束后再对照原 `model:request-started` / `popup:provider` 与原账本。

无自动收费重试、length recovery、补样、换供应商或收费后调参继续。新 unknown、越权、证据/费用归属失配、原费用超限、传输失败、期限耗尽即停止新派发并取消父子；原 unknown 不会归零，迟到结果不恢复批次。旧账户不读取、不解封、不清零。清单授权的全局单次声明保存在本工作区 `data/parallel-popup-real/.claims/<manifest-hash>.json`；复制同一批准文件也不能自动再跑同一清单。失败不自动续跑。

## 必要的最小产品接点修复

原交付已接通子任务生产链，但主 Agent 通道尚未加入同一批次费用账户。本轮新增**进程内受信任启动资源接点**：共用原账户 owner/ledger，保留原 `createPopupProvider` 和原 reserve/dispatch/settle/unknown；HTTP/环境不能安装该接点。真实分支使用真实上游，免费分支只有合成上游，不混用凭据。原普通启动默认行为不变。

单行免费检查还发现：把父目标中的委派说明原样继承给子执行，会被原动作范围校验拒绝。现将 `popup-viewport` 子合同收窄到既有规范几何目标；父完整目标、默认覆盖义务和缺口保持原记录。未绕过动作校验或伪造父 action/item。故候选冻结身份已更新，不能按旧 `3411413` 的字节身份执行本批。

## 免费准备证据

[free-evidence/summary.json](free-evidence/summary.json)：最终仅 P01 一个普通 API 父任务、两个真实 Chromium 子执行；免费脚本主模型通过真工具调用，原 Jev provider 使用合成协议响应、真实原账本。**5 笔主请求 + 2 笔 Jev 请求**和原事件匹配；窄 fail、宽 pass，父 partial；unknown=0、held=0、账户锁=0。合成账本金额用于记账验证，实际付费为 0，不能当真实模型质量证据。

26 项定向测试通过；类型检查、服务/工作台构建通过。定向测试覆盖共享余额竞争、unknown 对主通道和兄弟的停止传播、原 provider、证据与目标来源规则。准备中保留了 readiness 配置拒绝和目标继承故障的免费诊断目录；修复后只复验 P01，没有重跑旧免费矩阵或 DNS 全套。未填写授权的运行命令在建账户前拒绝，未占用真实批次声明。

## 可运行命令

在本工作区 `/Users/xietian/.codex/worktrees/parallel-check-tasks/ui-sentinel`，使用已冻结的本地构建；不要重新冻结后沿用旧批准摘要。实际输出目录必须新建且位于 `data/parallel-popup-real/`。

```sh
VALIDATION_NODE=/Users/xietian/.local/share/fnm/node-versions/v24.21.0/installation/bin/node
# 免费单行连接复验（已完成，通常无需再跑；需要新的输出目录）
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null \
  "$VALIDATION_NODE" data/parallel-popup-prepared/runtime.mjs --dry-run \
  plans/parallel-check-tasks/real-preparation/manifest.json \
  data/parallel-popup-real/dry-manual-new

# 仅收到本批明确批准后：维护者填好 approval.json 的 approvedBy/reference/有效期。
# 批准模板是 approval.example.json，其中空值故意使收费执行被拒绝。
# PARALLEL_POPUP_API_KEY 由操作者安全提供；不要把密钥写入文档或批准文件。
env -i PATH="$PATH" HOME="$HOME" DOTENV_CONFIG_PATH=/dev/null \
  PARALLEL_POPUP_API_KEY="$PARALLEL_POPUP_API_KEY" \
  "$VALIDATION_NODE" data/parallel-popup-prepared/runtime.mjs --run \
  plans/parallel-check-tasks/real-preparation/manifest.json \
  data/parallel-popup-prepared/approval.json \
  data/parallel-popup-real/approved-batch-01
```

若本地冻结构建丢失，先在冻结源码/依赖环境用 `--freeze <新目录>` 免费重建并核对；任何清单摘要变化都不能复用旧批准。最终原始证据在新输出目录、原 run artifacts 和新账户内；正常退出会输出父子评分、费用逐笔核对、原账本汇总及停止原因。留存失败与 partial，不自动补跑。

**供维护者转述的一句话授权问题：** 是否授权按冻结清单 `26110502…ff213056` 仅执行这一批 3 个父任务、最多 30 次真实主模型请求和 18 次真实 Jev 请求，新建独立原费用账户，新增总费用不超过 **USD 1.86**，遇到新 unknown、越权或证据失配立即停止，且不自动重试或补样？
