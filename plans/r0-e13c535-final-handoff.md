# R0 最终验收交付：本次未通过

2026-10-08，Asia/Shanghai。当前候选 `e13c535009695ee70c3794868224ac3842090f79`，既有交付文档提交 `562c786`。本轮依据用户恢复授权实际执行 UI 诊断全部六行及一个既定 smoke，**5/6，未通过**；正式 UI、业务诊断和业务正式均未启动。R0 不正式通过，R1 的 R0 完成前置条件未满足。

## 四阶段结果

| 阶段 | 计划 / 实际 | 结果及出口 |
| --- | --- | --- |
| UI 诊断 | 6 / 6；smoke 1 / 1 | 5 通过、1 失败；原始证据核对接受该失败结论，禁止进入下一阶段 |
| 正式 UI | 15 / 0；smoke 1 / 0 | 未运行，缺少本候选 15/15 证据 |
| 业务诊断 | 5 / 0；smoke 1 组 / 0 | 未运行，前置 UI 门禁未满足 |
| 业务正式 | 45 / 0（A15/B6/C18/D6） | 未运行，K5 未完成 |

新批次 `r0-ui-diagnostic-e13c535-01`：healthy-catalog、overlay-healthy、dom-healthy 三行完整完成且零 supported 误报；overlay-defect 完整完成，有独立有效遮挡发现；dom-investigation-defect 有独立有效排序发现，但 execution-error，不能算完成；boundary-diagnostic 为可信 blocked，有先行真实网络阻断及持久证明。普通质量失败后完成了本阶段剩余边界行，完整分母保留。未重试、未拼入旧 13/15 成功行、未修改产品或评分。

[机器可读交付索引](evidence/r0-e13c535-final-delivery.json)、[六行出口复核](evidence/r0-e13c535-diagnostic-exit.json)、[本轮授权记录](evidence/r0-e13c535-authorization.json)。复核由当前 Agent 直接读取原始 SQLite、事件及产物并比较独立 Playwright 重放，不声称另一个 Agent 的盲审。六行原始归档完整性通过，产品质量门未通过；边界的 blocked 是协议要求，不算普通页面完成。

## 最小失败及分类

第 5 行 `dom-investigation-defect`，run `run-ce606f5b-af3a-4cac-ae86-e2c4edcac56e`：

1. seq112–116：真实排序后测得首行仍为 `20 · Blue widget`，与公开 Name 排序要求相矛盾；原检查为 failed，发现为 supported。独立异常重放排序不变，健康对照排序成功，截图和测量均支持发现。
2. 下一次原始上游工具调用：`page_act {type:"navigate", ref:"e25", role:"link", name:"About this catalog", url:null}`。上游响应完整；并非网络截断或验收器改写动作。
3. seq136–140：导航缺目的地址，`action:failed` 为 `navigation denied: a destination is required`，`sideEffectPending=false`；执行器以 `ui-action-execution-error` 停止。未派发该导航，没有未知写入。
4. seq141：`execution-error / execution-error / not-applicable`，耗时 57,045ms，3 动作、5 主模型调用；已选导航仍 pending，0 accepted finish，proof 不成立，persistence 为 not-final。新连接读出的数据库和全部事件一致，证明是失败终态被保存，而非合法完成证明。

违反本轮异常样本出口契约：必须完整完成且有有效发现；有效发现不能抵扣未完成范围。原评分四项拒绝（终态、持久完成证明、accepted finish、proof）正确。当地模型 token usage 因执行器中止为 unavailable，但网关传输与真实费用结算完整；**不是费用 unknown**。

分类：主要是**真实模型工具选择 / 参数契约稳定性失败**。相邻实现边界也有明确证据：`actionInput.url` 为 optional，navigate 的缺参校验发生在 UI 动作执行 catch 内，派发前缺参同样导致致命执行错误。尚未以新免费反例验证改进方案，不能宣称某个改动必然解决稳定性。没有发现本次 fixture、构建、费用或评分器故障。不是 F2 有效阴性再次丢失，也不是 F1 剩余义务循环复发。

最小下一步建议：先收敛“动作专属参数的派发前校验及有界无副作用拒绝”契约；保留真正已派发动作失败、取消、未知写入隔离的原语义。免费定向覆盖 navigate 缺参/有效 URL/已选链接/浏览器真错误/取消，再独立复核新候选。之后需要另行授权完整真实批次；本轮授权不含产品补丁或追加付费重跑。此次未实施建议。

## F1/F2 的实际观察

第 3 行遮挡样本的 seq229 触发全运行一次剩余义务引导，只列真实待完成事项。Agent 自主选择 probe，seq247 得到 `intercepted`：原 run/action/item/ref/snapshot 关联、前后可见启用、完整视口/裁切、零命中、无真实点击。seq263 结束**原** Filters 检查为 failed，已有有效发现保留；seq266 记录真实新测量，随后点击已选导航，完整结束。

独立核对 receipt 内容/哈希、引用截图字节/类型与 DB 归属均一致。该行说明两项修复在真实轨迹中生效；单行及诊断 5/6 仍不能证明正式重复稳定性，不能写成 F1/F2 已带来 15/15 或 R0 通过。

## 冻结、环境及证据

- 隔离候选：主仓库内 `data/r0-e13c535-final/candidate`，独立共享对象 clone，detached HEAD 为 e13c535，干净；主工作区 Roadmap 修改保留。复用锁文件对应 node_modules；仅在 clone 的本地 exclude 排除依赖 symlink，未改版本化文件。
- Node v24.21.0、pnpm 10.17.1；未安装环境、未重建、未重跑全量单测或免费浏览器套件。17 项既有交付/独立复核文件哈希逐项吻合；两个历史本地原始包存在且摘要核对一致。
- dist：`1829cce652b1d67ff3e7d9e8d63c09babfe127acd671c95bd407292011eccb7a`。
- src：`76d57e0d9f48f96274adb921eb259c743327bf7fa33c01d4da2e3c1fe00846b4`；scripts：`e6fb2bbec4624500b8005e8047a51a64b2018029d64a02bd8fe68c0b3592e55a`。
- UI manifest：`18290a7d9ad81619dc61b6d0a84bdf83a98b87b99789bee85442123ffd963746`。新 manifest/approval 绑定当前候选和六行矩阵；配置与原 UI 协议逐值相同。Alibaba 的原报价冻结一致。
- 业务完整构建身份：`b25bf431859530bf652d8a63751846f3dd6d61e815965a95a7cc343ccf7c99c1`。原两 arena、全部业务 fixture/评分器、批准规则来源与业务验收脚本未变。批准 fixture 按现有验证器及只读来源导入器核验，原 enabled proposal、reviewer、数据库摘要保存；未制造批准。
- 保留 DeepSeek V4.1 Flash / Qwen3.7 Plus、Alibaba、holdout-inset-9、1280×768、3页/深度1、300秒/20动作/30主模型调用、15秒工具/60秒模型/重试1；本轮实际模型请求均为 DeepSeek，未发生视觉调用。业务未来配置的 Jev 审查仍完整保留，因门禁未发起请求。
- 凭据仅引用主仓库 `.env`；归档不包含 `.env` 或密钥。最终原始包路径、SHA-256、字节数见索引；不随 Git 推送，换机复核须取得包。

本轮验收工具变化仅为：原出口辅助脚本从 manifest 读取候选身份；归档审计增加 DB 产物类型/归属和 probe receipt/截图封印核对。实际六行上审计通过。完整出口复核的原始 Python 脚本也随原始包保存，未导入生产评分代码。未更改被测行为、评分含义和安全边界。

## 历史证据复用

| 来源 | 本轮接受的范围 |
| --- | --- |
| e13c535 F2 免费自测及原复核者确认 | 63/63、probe26/26、节点替换窗口与截图封印修复；17 个交付/复核引用逐哈希核验 |
| e30a9ef 未变 F1 / 生命周期 / 业务隔离 | 原 F1 引导轨迹、20 项生命周期、5 项定向业务边界；首版 F2 否决保留，原34/34不能抵销否决 |
| 97d39ed、835b11a 已接受契约证据 | 按原影响映射复用取消 B30、K123 B18、动态恢复 B10、连续性 B19、URL42、业务32及未受影响回归；不声称本候选全部重跑 |
| 旧 C10、C11、正式 UI13/15 | 保留历史失败、费用与已见样本信息；不作为当前阶段分数或准入证明 |
| 原批准 retry fixture | 仅复用已批准来源，业务阶段准备核验成功；未执行 B/D，不作为 K5 通过证据 |

详尽来源仍为 `r0-f12-handoff.md`、`evidence/r0-f12-delivery.json`、`r0-k45-execution-plan.md`。当前布局属于已见样本回归，不能宣称未见网站泛化。

## 费用与停止状态

本轮新增 **US$0.08724984**，53 个已结算请求（52 个任务请求及 1 个 smoke），6 个任务。共享 campaign `0946f830-00b6-4f46-af69-79bd2166ef9d` 已知累计 **US$1.91502588**，US$20 累计护栏余额 **US$18.08497412**。加上已核清历史账本 US$0.03722460，R0 总已知费用 **US$1.95225048**。

结束后 unknown=0、held=0、lease=0，无 running stage。原始 SQLite 快照及新请求核对保存于包内。停止原因是 UI 诊断质量门失败；费用余额不恢复后续资格。未发起正式 UI 的第二 smoke 或任何业务 smoke/任务。

## 用户试用

可以试用匿名、有界同源 UI 检查和证据报告，当前仍是实验能力。排序、遮挡、只读调查及边界拒绝有当前证据；自主完整收尾和正式重复稳定性仍未获验收。支持页面内安全交互和同源导航；登录、表单写入、跨域无限探索、任意视觉缺陷覆盖等不在 R0 范围。

现有环境无需重装或重建。在主仓库运行以下命令（使用已有 `.env` 密钥引用，只在进程内映射，不打印凭据；用户自行试用调用不属于此次验收批次）：

```sh
export PATH=/Users/xietian/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH
EXECUTION_URL_SCAN=1 AGENT_MODEL=openai/deepseek/deepseek-v4.1-flash \
OPENAI_BASE_URL=https://openrouter.ai/api/v1 VISION_MODEL=qwen/qwen3.7-plus \
VISION_BASE_URL=https://openrouter.ai/api/v1 VISION_MODEL_FAMILY=qwen3 \
node --input-type=module -e 'import "dotenv/config"; process.env.OPENAI_API_KEY=process.env.OPENROUTER_API_KEY; process.env.VISION_API_KEY=process.env.OPENROUTER_API_KEY; await import("./dist/server/index.js")'
```

打开 `http://localhost:4111`，选择网址 UI 检查，输入完整 HTTP(S) 网址与中性检查目标，保持最多3页/深度1，创建任务。结果区显示范围、发现、未验证事项与证据；保存 runId 后可在“恢复历史运行”重新打开。报告 API 为 `/api/runs/<runId>/report`，单张证据为 `/api/runs/<runId>/artifacts/<artifactId>`。completed + covered 且 proofVerified 才表示该次声明范围完成；blocked、execution-error 或 partial 不能按无发现理解为通过。本机 fixture 仅用服务器配置的精确 `URL_SCAN_TRUSTED_ORIGINS` 放行，用户表单不能扩大边界。

## R1 与 Roadmap 交接

执行器接口已存在，可供后续设计依赖：`createRun(RunSpec)` 持久冻结契约，`startRunExecution` 入统一队列，`cancelRunExecution` 按既有仲裁取消；业务与 ui-scan 共用观察/动作/调查/规则；HTTP 创建、SSE 事件、报告及产物读取接口可用。使用当次 contract/hash、scope item 及证据归属，不把 tool success 当行为完成，不复用 stale ref，不重放未知写入；历史报告须通过持久证明校验。

**此次不能把这些接口的存在等同于 R1 正式准入。** R0 诊断失败、正式 UI 与 K5 证据缺失仍是交付门禁。建议 Roadmap 维护者记录“F1/F2受限候选复核已通过且真实遮挡行生效；新候选 UI诊断5/6，缺参导航 execution-error；K4/K5正式未准入，R0未完成”。维护者核对后更新；本轮保留其主工作区 Roadmap 差异，未发送跨线程消息或启动 R1。
