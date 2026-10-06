# 主动视觉发现：P3 主 Agent 复查交接

状态：**P3 completed / ready，主 Agent 复查修复及 G0–G3 免费验收全部通过。P4 未执行。**

评审基线为 dev bundle `b354376a504b4b111437c0b1ab2ae218a8dfc597`，主 Agent 修复分支为 `review/visual-focus-p3`。P2/main 未被覆盖；没有新规则批准，没有付费模型请求。旧交接中的 B06/W01 partial 和未覆盖的运行器集成已补齐；旧 1034 项结果不作为本次完成依据。

## 修复内容

- 独立评分按实际候选/回执引用取证，不再依赖测试专用 artifact ID；H0 按实际 API 的 refuted hypothesis 判定。逐项校验原始视觉坐标、截图 SHA、snapshot/节点见证、焦点前后事实、500ms 实测、reset/复测顺序、实际 click 数、finding 引用与声明范围。不能借用聚焦回执证明遮挡等其他问题。
- 视觉诊断通过可导入的生产运行器执行；CLI 没有 mock 开关。免费 preflight 注入本地响应，实际经过网关、SDK、浏览器、正式 API、评分和停服审计。成功、价格查询失败、运行中取消均实际走过；固定响应产物永远是 fixed，不能授权真实 formal。
- 视觉和业务入口共用持久 SQLite campaign、唯一 requestId、事务费用预留及 runner 租约。并发锁冲突有界重试；跨阶段/进程保留费用、未知预留。启动失败释放租约；失联进程恢复只标记 interrupted/unknown，不续跑或补齐成通过。
- business 参数透传恢复可用；保留历史 standalone 入口，但联合验收必须显式传同一 `--campaign`。业务 profile 固定 0/1/1，视觉为 1/1/1；网关显式固定 Alibaba，Jev 保持其原决策端点。
- formal 源必须是同一冻结身份、campaign 下的 real diagnostic，并具备完整报告、请求、账本、审计和文件 SHA 封存。单独 `passed:true` 无效。已知六例的 revision 明确为 regression，不能冒充 P4 holdout。
- 完整计划先落盘，失败和 not-run 不丢失。18/45 行使用同一批次循环；质量失败留在分母，隔离/审计/预算/取消阻止继续。持久审计逐事件核对 id/seq/payload/引用及完整 finding/hypothesis/usage，最终退出码包含审计结果。
- 报告只累计视觉请求的 token，缺 usage/费用显示未知；缺回执标记无法核实。Web 展示采样窗口、重置记录、感知框和原生输入框，表格留有间距。截图与恢复通过正式报告路由验证。

## 免费验收映射

所有固定响应仅验证执行机制与证据，不证明真实 Qwen/DeepSeek 自主发现能力。

| ID | 复查证据 |
| --- | --- |
| B01 | 下方最终命令记录：Biome、typecheck、全量测试及最后 build |
| B02 | `runner-profile.test.ts`、`business-stage.test.ts`；免费运行器实际请求断言 Alibaba pin；业务 flags 在调用者 env 之后覆盖 |
| B03 | `run-report-focus.test.ts`：旧数据未记录字段、缺文件、费用未知，视觉/Agent token 分离 |
| B04 | 原 C0–C5、E0–E4 fixture 验证；批准 fixture verify；原业务 preflight，不改旧真值 |
| B05 | 必需输入与 fixture revision 均在 Git；data/DB/凭据不提交；本复查 worktree 无 .env |
| B06 | `build-identity.test.ts` 分别修改真实临时文件树的 web/两 arena/server/scorer/protocol/lock 字节，确认 hash 改变；交付前最后 build |
| V01 | `visual-focus-runtime.test.ts`：真实 foreign artifact、任意路径、scroll/viewport/节点替换/value 失效；拒绝后无点击 |
| V02 | `visual-candidate.test.ts`、独立 scorer 的原始坐标与转换反例 |
| V03 | runtime 浏览器测试：DPR=1/2 都发送 800×600 CSS 图像并实际点击相同区域；不支持的图像尺寸显式拒绝 |
| V04 | runtime：第一次在途变化仅重采一次；两次变化保留 unknown；取消后迟到响应不能写入候选 |
| V05 | runtime 的 iframe/shadow/readonly/disabled/旋转；`focus-binding.test.ts` 的多 input 歧义 |
| V06 | runtime 的真实 text-input 连续观察不可缓存；`observation-version.test.ts` |
| F01 | 六例 SDK/API preflight + runtime/`focus-measure.test.ts` 的真实鼠标点击；H0 label 代理不误报 |
| F02–F04 | `focus-probe.test.ts`、`focus-measure.test.ts`、`focus-neutral.test.ts`；preflight 同候选重复调用不重复点击 |
| F05 | runtime 第一真实点击期间替换节点、layout/value/overlay/scroll 变化；均停止并 inconclusive，实际只点击一次 |
| F06 | runtime 6/7/8 预算；`focus-probe.test.ts` 最大 8 次含 reset 的实际计数 |
| F07 | runtime 与 preflight 的请求/点击中取消；`focus-measure.test.ts` 异步检查后、pointer dispatch 前取消；executor 超时/迟到动作测试 |
| F08 | runtime 点击触发网络写入/弹窗的受控拦截，真实 integrity 使结论无效；原 `side-effect-policy`、`evidence-integrity`、executor 写屏障回归 |
| F09–F10 | `focus-preflight.test.ts` 与六例完整 SDK/API preflight：实际 viewport、排除区、购买后私有订单真值、无公共答案泄漏 |
| S01–S16 | `evaluation/private/visual-focus/scorer.test.ts`：合法 D0/H0/H1/H2 对照、逐项损坏、动态 ID、焦点矛盾、缺 stable/测量、错 witness/finding、改标题借旧回执；传递 import graph 禁止产品 verdict/helper |
| R01–R02 | `cli-args.test.ts`、`formal-source.test.ts`、`business-stage.test.ts`、`campaign-session.test.ts`；错误/缺证据/错 freeze 拒绝，45 行保留 not-run |
| R03–R06 | `row-runner.test.ts` 实际执行 18/45 行注入循环及中断；生产视觉运行器在 preflight 实际成功/启动失败/取消，保留 runId、剩余行和账目 |
| R07–R08 | `campaign-session.test.ts` 死 owner 恢复及拒绝续跑；`freeze-identity.test.ts` known regression/test-only/unreviewed holdout 门槛 |
| C01–C05 | `campaign-ledger.test.ts`、`campaign-session.test.ts`、`business-stage.test.ts`、网关测试：并发竞争、五个独立进程阶段累计、未知成本、去重、租约、额度不可变、价格/超额拒绝 |
| E01–E03 | `audit-compare.test.ts`、`campaign-evidence.test.ts`、文件封存测试；六例与生产运行器停服后新 DB 连接审计；互换 seq/改正文/丢文件均失败 |
| E04 | `model-gateway*.test.ts`、`gateway-evidence.test.ts`、`batch-timing.test.ts`；request/response/ledger 共用 requestId，关联 row/phase；日志脱敏、失败与未知计数保留 |
| W01–W02 | 免费 preflight 实际报告路由 D0/H0/H1 截图并目视复核，原图/框/点/图例一致；六例均 reload、停服重启后复核 |
| W03 | `run-report-focus.test.ts`：缺原图/采样/回执、未知 token/费用和旧记录；Web 明示未验证，不能显示成功/0 元 |

## 最终命令与证据

| 命令 | 结果 |
| --- | --- |
| `pnpm test` | 退出 0；109 文件 / 1089 项，最终全量 133.38 秒 |
| `pnpm format:check` | 退出 0 |
| `pnpm typecheck` | 退出 0 |
| `pnpm build` | 退出 0 |
| `pnpm fixture:approved-retry -- --verify` | 退出 0 |
| `pnpm test:fixtures` | 退出 0 |
| `pnpm test:fixtures:export` | 退出 0 |
| `pnpm validate:persistence` | 退出 0 |
| `pnpm validate:investigation` | 退出 0 |
| `pnpm validate:blocker-review` | 退出 0 |
| `pnpm validate:business -- --preflight` | 退出 0 |
| `pnpm validate:visual-focus -- --preflight` | 退出 0 |

最后一次视觉复验：`data/visual-focus-preflight/2026-10-06T08-17-49-896Z/`，六例独立评分均通过；重启与 Web 截图均完成。D0/H0/H1 报告与 D0 原尺寸标注已目视复核，失败/聚焦点与表格一致，测量范围没有扩大为整个区域。

- 生产运行器 fixed 诊断：`data/visual-focus-validation/2026-10-06T08-18-28-980Z-726c45f8/`，4/4 通过，持久审计通过；vision=4、agent=32，paidRequests=0。分项 model/tool 时间来自持久事件，墙钟独立实测。
- 价格失败和取消：同级 `2026-10-06T08-18-50-362Z-e90ade71/`、`2026-10-06T08-18-50-403Z-37958b94/`。日志中的两条 FAIL 是主动故障注入的预期结果：前者全部 not-run，后者保留首个 runId/cancelled 与余下 not-run。总 preflight 退出 0，未清零预算，也未遗留租约。
- 最后 build hash：`531421723bd8035cc9431559aefbb72025db92c2dc9a34e355c2e14a55f3f686`（94 个文件）；机器可读清单 `data/reviews/p3-final/build-identity.json`。
- 全部命令日志与退出码：`data/reviews/p3-final/`；最终全量日志 `full-test.log`，末次视觉复验 `visual-delivery.log`，之后重新 build 的日志 `delivery-build.log`。
- 验证在提交前工作树进行；fixed manifest 如实记录当时的 bundle 基线 commit，没有为了交付改写旧记录。最终构建哈希对应本次交付代码。生成资料不入 Git，按 [P3 验收命令](visual-focus-p3-acceptance.md#6-必须执行的免费命令)可重建。


## P4 边界

P4 仍 pending：主 Agent 在算法/提示冻结后准备并 review 新 holdout revision，再按同一 clean commit、build、campaign 执行真实 diagnostic、视觉 18 轮及业务 45 轮。原六例是已知回归，历史 P2 smoke 与本次 fixed 流程不能替代真实模型验收。P3 不改变模型、上限、批准规则或 main，也不自动启动 P4。
