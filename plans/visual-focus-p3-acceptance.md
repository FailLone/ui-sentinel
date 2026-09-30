# P3 逐项验收与交付清单

配套[任务书](visual-focus-p3-plan.md)。本文件是待执行要求，不是已通过记录。dev 必须在交接中逐项填写：测试位置、执行命令、证据、结果；已有测试可以复用，缺失才补，不用重复写镜像测试。G0–G3 全部通过才可交付 P3。

## 1. 测试层次

- 纯函数测试：独立评分器、协议身份、费用状态机、矩阵计划。损坏用例从完整合法样本只改变一个事实，断言具体失败码，不能只断言“有错误”。
- 浏览器集成：真实 React 页面、普通 Playwright click、SDK、本地固定模型、正式服务/API；验证真实节点/采样/取消及证据恢复。
- 运行器测试：注入本地 transport/clock/故障，覆盖完整 18/45 行计划和中断。不可让正式 CLI 暴露一个 `--mock` 后仍产生 real 门槛凭证。
- Web 验证：访问实际报告路由，读取 API，检查原图/标注/点表/错误状态；reload、停服重启后复查。不用只断言 HTML 字符串包含某个字段。

固定响应可用于免费测试产品流程，不能证明 Qwen 自主发现或 DeepSeek 自主选择；所有产物必须标 fixed。测试页可以制造 focus/layout/网络变化，生产探针不能通过脚本 focus/blur/force/dispatch 伪造交互。

## 2. G0：构建、兼容和可移交

| ID | 必须验证 | 通过条件 |
| --- | --- | --- |
| B01 | Biome、类型、全量测试、构建 | 全部退出 0，记录实际测试数，不沿用 844 作为新结果 |
| B02 | 默认及显式 flags | 产品默认视觉关闭；新正式 profile=1/1/1，旧业务=0/1/1，调用者 env 污染不能改结果 |
| B03 | 旧 run 与旧报告 | 无视觉字段照常加载，不捏造费用/覆盖，无迁移破坏 |
| B04 | 原 checkout/export、批准 fixture | 原真值/评分门槛不降低；Git fixture verify/import/hash 保持一致，导入不发生新 approval |
| B05 | 可移交 | 新 checkout 不需要本机 learning/data；无未提交脚本、凭据、DB；必要输入均在 Git |
| B06 | 完整冻结 | 最后 build 后产生 identity；换 arena/web/scorer/protocol 任一内容被识别；文档更正不伪造新的测试结果 |

## 3. G1/G2：候选和行为边界

| ID | 输入/操作 | 必须观察到的结果 |
| --- | --- | --- |
| V01 | foreign run 截图、任意路径、旧 epoch/viewport/scroll | 拒绝候选/调查；没有按旧坐标点击 |
| V02 | normalized 单位缺失/错误、NaN/负尺寸/越界/多余字段 | 严格拒绝，不裁剪/猜单位/改用私有 DOM 框 |
| V03 | 同一真实页面 DPR=1/2、受支持截图缩放 | 原图到 CSS 转换及实际点击对应真实区域；若不支持某种缩放，明确拒绝，不能声称已支持 |
| V04 | Qwen 请求在途期间页面变化或取消 | 旧候选不入新状态，最多一次合法重采集；迟到响应无新发现 |
| V05 | iframe/shadow/旋转/只读/禁用/多 input 歧义 | unknown/unsupported；不替换成近似目标 |
| V06 | text input 页面重复观察 | 普通观察缓存仍不可复用 |
| F01 | D0/H0 各真实鼠标检查 | D0 独立失败复测；H0 label 代理实际聚焦，hit 不是 input 不误报 |
| F02 | 开始时 input 已聚焦 | 重置并验证未聚焦基线，死区不会误判成功 |
| F03 | 控制失败/无中性区域/少于两个边缘点 | inconclusive，有未验证说明，无 supported/refuted |
| F04 | 首次失败、复测；重复同候选调用 | 同一坐标重新建立基线后复测；复用回执不新增 click/finding |
| F05 | 每一采样阶段替换节点/改变 layout、scroll、value/增加遮挡 | 停止使用旧坐标，unknown，不产生有效结论 |
| F06 | 剩余 action=6/7/8 | 6/7 不开始需预留 8 的探针；8 可开始且实际每次点击计数，包括 reset，无超额 |
| F07 | tool/run 取消、deadline | 在途操作停止；收尾后无迟到 click/candidate/finding，策略恢复 |
| F08 | 点击触发写入、弹窗或跨域拦截 | integrity 记录干预；结论无效，finally 恢复限制；未知副作用触发运行器停止 |
| F09 | D2 图标、H2 邻接按钮 | 所有证据点避开私有排除区，不点击邻接按钮；无需模型必然输出非空排除框 |
| F10 | 六例完整免费 API 流程 | 用 fixed 模型覆盖六例购买和报告；每例使用规定 viewport、reset 无残留，公共接口无私有答案映射 |

可利用现有真实浏览器边界测试，交接标明具体位置。不要用 source-regex 检查来替代行为结果。

## 4. G3：独立评分器反例矩阵

以下每种均为单独可定位的 mutation，不能只构造一个同时缺十个字段的 record。合法 D0/H0 样本先通过，再逐项损坏；H1/H2 无候选路径也要有合法对照。

| ID | 改动或反例 | 评分必须拒绝的原因 |
| --- | --- | --- |
| S01 | finding 声称 supported，但没有视觉请求/真实图片 | provenance 缺失；不能凭 finding 通过 |
| S02 | 替换图像字节/SHA、candidate 原图或 run/epoch | 图像/所有权/状态不一致 |
| S03 | normalized 到 CSS 变换错误但框仍在视口内 | 单位/变换不一致，不能因 bbox 看似合理通过 |
| S04 | 绑定另一个同尺寸 input 或相同文案节点 | 与私有目标节点见证不符；不能只比 bbox/文本 |
| S05 | 候选是整个卡片或只有真实 input；失败点在图标或按钮 | 私有区域/点位约束失败，交集比例本身不够 |
| S06 | 缺正向控制、控制失败、控制前已聚焦 | 控制无效 |
| S07 | 边缘点点击前已聚焦，或 reset 后仍聚焦 | 未建立独立基线 |
| S08 | 写 windowMs=500，实际无焦点观察仅 100ms | 实测窗口不足；不能只信声明字段 |
| S09 | 单次失败无复测；复测坐标不同/无重置/重复原 sample | 无独立同点复现 |
| S10 | 缺左右一侧、重复 side、额外不合法样本 | 采样集合无效 |
| S11 | epoch/node/布局/值变化，或 integrity 被干预 | 稳定性/完整性不成立 |
| S12 | receipt 点数正确但 click 事件缺失/额外，actionCost 少算 reset | 动作账不一致或超限 |
| S13 | low candidate、缺语义绑定调用、改标题借旧 receipt | 不满足本类证据门槛；产品 API 同样不能绕过 |
| S14 | H0 没调查；H1/H2 scan 错误或 unknown 却说健康 | 缺必要验证/覆盖，不是假阴性成功 |
| S15 | D0 有正确发现但没购买成功/没显式 finish；或多一个无依据 finding | 整轮失败，不能只挑正确发现计分 |
| S16 | 伪造 verdict 字符串，其余测量保持 | 独立结论不跟着字符串改变；与报告声明冲突被检出 |

在交接列出独立 scorer 的 import 边界检查结果；不能调用产品 verdict/helper 或旧 smoke 评分函数。允许共享类型及无判定逻辑的工具。

## 5. G3：运行器、费用、证据与报告

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| R01 | 无参数、未知/重复/缺值/冲突参数、缺 key | 默认免费；非法输入非零且无付费请求；缺 key 不静默 mock |
| R02 | preflight/P2/failed diagnostic/错 build/profile/campaign 作为 formal 源 | 全部拒绝，无上游请求；完整计划行保留 not-run |
| R03 | 正常 diagnostic/formal 调度 | smoke+3、18、45 数量与既有矩阵一致；partial groups 永远不算联合完成 |
| R04 | 中间一行质量失败 | 保留该行并安全继续；最终总数不变、批次非零，失败仍在分母 |
| R05 | 提供方错误/连续同机制诊断失败 | 分类、费用、失败请求保留；达到停止条件不再发下一请求 |
| R06 | 隔离/未知副作用/审计错误/预算/SIGINT | 取消并收尾，余下 not-run；无自动 reconcile/替换失败轮 |
| R07 | 进程强制终止后重开 | 原阶段 incomplete/失败，账目不丢；不自动从中间拼成通过 |
| R08 | old known revision 与 test-only revision | 正式收费门槛拒绝未 review 的旧 holdout；test-only 仅在免费测试中可用 |
| C01 | 两个请求竞争最后余额 | 事务预留不会双花；拒绝者没有外部请求 |
| C02 | smoke/视觉诊断/18/业务诊断/45 跨进程 | 同一账本累加，未知预留纳入上限；不因新输出目录重置 |
| C03 | 超时/流中断/缺 usage；确定未发出的请求 | 前者保留未知预留，后者可释放；失败调用计数保留 |
| C04 | 重复结算/导入、崩溃遗留预留、两个 runner | 不重复收费/不丢预留；第二 runner 拒绝，活租约不被抢占 |
| C05 | 价格缺失/实际高于预留、env 修改原额度 | 明确拒绝或停后续；实际成本不删减，原上限不暗改 |
| E01 | 多页事件历史/超出默认 tail | API 完整历史与新 DB 连接逐条一致，不能只比最后 seq |
| E02 | 删中段、重复/复用 seq、改 payload/evidenceRefs/hypothesis/finding | 每种分别导致 audit 失败；规则批准来源保持不变 |
| E03 | 删原文件/下载文件、改字节、错所有权/缺索引 | byte/SHA/集合对照失败，空集合不能空泛通过 |
| E04 | 请求与费用索引 | requestId 唯一且能关联 run/phase，失败/未知完整；凭据和认证头不落盘 |
| W01 | D0/H0/H1 报告和标注 | 真实页面截图目视复核，框/点/图例可对应原图；不宣称全区域遮挡 |
| W02 | report reload、停服后新进程恢复 | 图像/采样/范围/integrity/费用与 API 持久数据一致，不依赖旧内存 |
| W03 | 缺原图/测量/引用、unknown usage、旧报告 | 明确缺失/未知/未记录，不显示空白成功或 0 元 |

## 6. 必须执行的免费命令

以下已有脚本均应保持可用；新增专项测试进入 pnpm test。先修复局部失败再跑完整集合，绿色后不无故重复。

```sh
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm fixture:approved-retry -- --verify
pnpm test:fixtures
pnpm test:fixtures:export
pnpm validate:persistence
pnpm validate:investigation
pnpm validate:blocker-review
pnpm validate:business -- --preflight
pnpm validate:visual-focus -- --preflight
```

如果预检/测试重建了资源，最后重新 `pnpm build` 再记录交付 hash。preflight 可从脏工作区调试，P4 付费入口必须 clean commit。真实模型 key 不需要提供给 dev；禁用外部模型转发的测试网关不得因开发机碰巧存在 .env 而改变行为。

dev 将结果写入 `plans/visual-focus-p3-handoff.md`：所有 ID 明确 pass/fail/未执行及证据位置；截图使用生成目录引用并给出重建命令；不要提交大批生成证据。零付费的完整调度测试要标 fixed，不生成可用于 P4 的 real diagnostic 凭证。

P3 ready for review 的门槛：本清单无 fail/未执行项，必要新代码已提交并 push，免费证据可重建。P4 的新 holdout review、真实 diagnostic、18+45 轮明确 pending；这些不属于 P3 未完成。
