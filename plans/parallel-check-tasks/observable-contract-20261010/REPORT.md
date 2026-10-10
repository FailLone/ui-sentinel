# 功能后置条件与可见浮层 UI 独立：实现与免费验证

本轮按确认后的可观察行为契约完成修改。源码提交 `00cd8dfe750e1fe47a844ae05e7126e522636b9c`，分支 `codex/parallel-check-tasks`，独立 worktree；没有推送、合并、改 main 或调用付费模型。新建请求为 `popup-viewport-2`，UI 规则为 `popup-visible-viewport-2`。这属于新契约和新评分，**不把旧 P02 的 TARGET unknown 改成通过**。

## 两个目标与共享证据

| 目标 | 输入、适用条件 | 通过/失败与未检查 |
| --- | --- | --- |
| 功能 | 原目标或公开页面声明在动作前明确指定按钮和预期浮层；有效前态、原动作、同一文档原节点及既有 generic 后观察 | 指定预期从未满足变为在有界样本内出现 → verified；原先已存在、错误浮层、无关通知、多匹配、替换、观察不足 → unverified/pending。没有 SLA 时不把没观察到写成业务失败 |
| UI | 观察中实际可见的 dialog/popover、dialog 角色、或明确 fixed + 不透明背景 + 边框/阴影面板；节点、状态、截图及几何支持成立 | 每个浮层独立 pass/fail；未检查、类型不明、绘制不支持、预算或状态失效 → unknown。无需按钮归因，不据此完成按钮功能 |

功能继续使用原 item 的 generic/effects、动作前 source review/hash 和原动作回执；复用即时、约 1 秒两次原观察，不为功能重复点击、拍照或新建检查库。声明示例：`After clicking "Open details", show popup "Details overview".`；中文支持 `点击「Details」后，应显示浮窗「Details overview」。`。按完整 aria-label（如有）或规范化完整文本精确匹配；只有明确的 `show any popup` / `应显示任意浮窗` 才接受任意浮层。单纯按钮名称不构成业务预期。当前有限句式以外保留 source unresolved，不猜测。

UI 对已存在、异步出现及无关浮层同样适用。每层收据为 `popup-ui-measurement-2`，汇总为 `popup-ui-summary-2`；actionId/itemId 均为 null，reproduction 仅记录可能的复现操作。finding 只声明观察到的浮层裁切。功能收据 `popup-effect-observation-1` 留在原 effect 下，引用原 generic 收据；报告分别显示两种结论。

ENTRY 继续使用原 Jev `popup-semantic-2` 与 `popup-purpose-policy-2` 探索规则。新 UI 路径不再发 TARGET，也不换种措辞询问内部因果。几何明确时由程序检查；剩余类型/绘制歧义直接保留 unknown。本轮没有新建任务数据库、调度层、PRD 输入框架，没有增加权限、预算、并发或默认范围。沿用原最多 3 动作、6 决策、4 读取且受原 run/子配额约束；最多测两个浮层，未覆盖项不能被已测结论掩盖。

## 真实 Chromium、本地固定模型的四个产品场景

最终验证于 2026-10-10 19:26（北京时间）运行，环境隔离，只有本机模型替身。所有操作经过正常 HTTP API、执行器、原 generic/effects、规则/finding 和持久报告，不直接伪造动作或测量。

| 场景 | 原动作 / ENTRY / TARGET / UI 读取 | UI | 功能预期 | 整任务 |
| --- | --- | --- | --- | --- |
| direct：150ms 后同时出现 Details 与无关 notice，640px | 1 / 1 / 0 / 2 | 两层各 pass，共用一张 UI 状态截图 | Details verified；无关 notice 没有充当预期 | blocked / partial |
| nested：两层入口，400px 面板置于 320px 视口 | 2 / 2 / 0 / 1 | fail，真实裁切；产生新 UI 规则 finding | Details verified，复用第二次原点击观察 | blocked / partial |
| wrong：点击 Details 后只出现 Error | 1 / 1 / 0 / 1 | pass | unverified，不被 UI pass 覆盖 | blocked / partial |
| existing：点击前已有 Details 浮层 | 0 / 0 / 0 / 1 | pass | pending，没有虚构点击和功能成功 | blocked / partial |

[完整结果](evidence/result.json)、[direct 报告](evidence/direct.json)、[nested 报告](evidence/nested.json)、[wrong 报告](evidence/wrong.json)、[existing 报告](evidence/existing.json)。所有四份在线 persistence=verified，重启后两类报告投影不变。故意破坏 UI 汇总收据后，结论降至 unknown、persistence=inconsistent，恢复原件后封存；见[损坏检查](evidence/corruption-check.json)。工作台截图已视觉检查：[两个目标同时成立](evidence/direct-report.png)、[UI 通过但功能未验证](evidence/wrong-report.png)。

四个根任务均保持默认义务 partial，没有用功能或 UI 单项结论替代整任务覆盖。既有子任务资源/证据/调度保护也在聚焦回归测试内。本轮没有运行新的真实并发 P02，不能把本地固定 ENTRY 测试称为真实模型能力或旧 P02 评分改善。

## 免费验证与历史兼容

- 23 个测试文件、200 个测试通过：[原始测试结果](tests.json)。覆盖直接/嵌套入口、已有/异步/多个浮层、错误预期、普通 div、绘制不支持、节点替换、取消、预算耗尽、迟到结果、截图/动作复用、源冻结、任意浮层的显式许可、文档身份变化、证据损坏、原默认义务及并发子资源保护。
- TypeScript、生产构建通过：[验证记录](validation.json)、[构建日志](build.log)。四场景免费产品脚本退出 0；真实模型调用及费用均为 0。
- 183 份附件及四份报告、数据库、截图、局部传输记录均保存于 `evidence/`；[附件索引](artifact-index.json)包含所有权、metadata、归档路径和 SHA-256。离线只读归档并使用临时数据库副本，重新核对 completion、原 source/generic/effects、UI 几何与汇总；四份 issues=[]，报告与在线一致：[离线复核](offline-integrity.json)。
- 旧 `popup-viewport-1` 运行兼容代码和验证器保留；旧 TARGET 归因含义不变。最新已封存 paid P02 的两子一父用当前读取器再次核对，205 份原附件与归档字节匹配，三份报告完全一致且 issues=[]：[旧报告复核](legacy-integrity.json)。相对本轮起点 `1ac666fe5ba894b0629fe855b049da67a9f6219c`，原 `plans/parallel-check-tasks` 的 1,677 个已跟踪文件字节全部未变。
- 最终封存之外，开发时一次本地产品验证发现把“观察版本”误当“文档身份”的问题，已修正为独立文档/节点身份，再完整验证以上四场景。没有通过放宽状态保护或修改旧报告来消除失败。

复验入口：`scripts/popup-ui-contract/validate.ts`（零付费产品场景）；`plans/parallel-check-tasks/observable-contract-20261010/verify.ts`（只读归档离线复核）；`scripts/popup-ui-contract/verify-legacy.ts`（旧封存报告只读复核）。均使用 Node 24、隔离环境和 `DOTENV_CONFIG_PATH=/dev/null`；常规使用与支持范围见 [USAGE](../../goal-directed-jev/USAGE.md)。

## 是否还需付费复验

当前修改解决的是已确认的职责错误：把可观察功能后置条件、可见 UI 几何和内部因果证明混为一件事。新分支使用确定性的已存观察复核，ENTRY 的模型/采纳政策未变；本轮不需要新增付费实验来证明这条实现路径。因此没有发起收费请求，也没有冻结新的付费 P02 proposal。若后续另测真实模型泛化或新契约下的并发产品效果，应明确使用新评分并取得新一批授权；旧批准已经消费，旧 unknown 永久保留。
