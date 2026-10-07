# R0 adc6b54 执行交付：本次未通过

2026-10-08，Asia/Shanghai。用户明确恢复冻结四阶段执行授权，记录见 `evidence/r0-adc6b54-execution-authorization.json`。候选 `adc6b540b7c25c06cbcad7d3e8b657d480bec474`，构建与冻结一致，产品未改动。本轮 UI诊断全部6行及1个smoke已执行，**5/6，R0未正式通过**；按门禁未启动后续三阶段，未补丁或另起付费重跑。

## 完整阶段结果

| 阶段 | 计划 / 实际 | 结果与出口 |
| --- | --- | --- |
| UI诊断 `r0-ui-diagnostic-adc6b54-01` | 6 / 6；smoke 1 / 1 | 5通过、1失败，出口复核确认未通过 |
| 正式UI | 15 / 0；smoke 1 / 0 | 前置失败，未准入 |
| 业务诊断 | 5 / 0；smoke一组 / 0 | 未准入 |
| 业务正式 A15/B6/C18/D6 | 45 / 0 | 未准入，K5未完成 |

诊断分布：healthy-catalog、overlay-healthy完整且零误报；overlay-defect完整且有独立有效遮挡发现；dom-healthy有可信partial证明但不完整，失败；dom-investigation-defect完整且有有效排序发现；boundary-diagnostic可信blocked，真实先行阻断及持久证明有效。健康2/3、异常2/2、边界1/1。普通质量失败后完成了本阶段剩余固定行；未拼入任何旧通过行。总计6/71任务运行，后续65任务及2组smoke未运行。

[独立出口记录](evidence/r0-adc6b54-diagnostic-exit.json)与[机器交付索引](evidence/r0-adc6b54-final-delivery.json)包含全部runId、逐行结果、费用和原始路径。复核由当前Agent直接读取原始SQLite、事件及产物、比较独立Playwright重放和截图；不是另一个Agent盲审。六行归档完整性通过，产品质量门未通过；档案一致不授予下一阶段资格。

## 最小失败：完成后返回并迟迟增补Price检查

第4行 `dom-healthy`，run `run-d3c02c56-5066-47f9-be6a-2e9b2e0f5805`：

1. seq88/103：Sort选择Name，原事项及selected-label后置测量verified；seq124/139：实际点击Apply sort，Name排序后首行Amber gadget，原按钮检查verified。原始请求/完整快照排序值也与健康独立真值一致。
2. seq160：真实点击About链接并观察落地，原导航verified；随后seq184直接返回原目录（不是用navigate替代原已选链接）。原本已完成的检查证据保留。
3. 返回后生成新文档的Apply sort候选，seq193 item `item-2c2b8b11-0ff7-4503-a3ae-2c4a0116031a`。此后继续读取页面；seq252才选中新Price排序检查，依据为默认Price页面的初始列表尚未按价格排列。该事项没有实际后置测量，仍pending。
4. 原时间收尾保留区生效，seq257完整结束被拒：`local-interaction:selected-not-resolved`。seq258/259保留真实时间预算未验证范围；seq263接受的是 **unverified-scope**，不是scope-covered或observed-blocker。
5. seq266持久终态 `blocked / blocked / not-applicable`，coverage=partial，proofVerified=true、persistence=verified。耗时272,857ms、4动作、18主模型调用。原Price事项pending及time-budget-reserve范围unverified，共2个未解决事项。零supported发现，并非Price排序缺陷。

违反验收契约：健康样本必须完整completed/goal-reached，不能用可信partial或零误报替代。原自动评分唯一拒绝terminal-invalid正确，原始新SQLite连接、完整事件、证明摘要和所有证据字节/类型/归属均一致。健康独立重放Name与Price排序都正常，排除“健康fixture实际坏了”；没有伪造完成或把旧成功事项覆盖新pending。

**分类：真实模型完成/范围规划稳定性缺口。** 已验证原范围后返回、读取并迟增补额外检查，在原时限内未履行完成。此行没有参数validationErrors、action:failed、contractRepair或F1引导事件，不是navigate/null再次进入派发区，也不是修正与F1叠加续期。没有发现本批评分器、构建或环境故障；不能从单次轨迹断言参数修复造成回归。

下一最小建议仅为：围绕此状态收敛“已有范围的结束准备度、剩余预算与增补检查”的决策契约，先评估为何不及时收尾/执行，而非增加时限或再跑一次。必须保留已选事项，不能删除Price义务或回填完成来制造通过。新开发和新付费批次均需另行授权；本轮未实施建议。

## 修复在实际轨迹中的表现

- 第5行seq55：真实模型的fill同时携带role/name和selector，被SDK字段契约拒绝。模型读取字段错误后发出合法请求，随后正确发现并测量排序失败、点击导航并完整结束。没有注入指定动作序列；没有contractRepair调度事件，不能宣称一次性修正提示被调用。
- 第2行seq378：Filters的probe=actionable、dispatched=false，没有把原检查结束。seq413实际click后，seq433以可见后置测量验证**同一原item**；截图/receipt封印一致。正面probe没有冒充行为效果完成。
- 第3行遮挡异常由自动几何规则发现并完成，没有负面probe分支。F2阴性仍复用已接受的原证据，不把未运行分支写作本次新覆盖。
- 本批没有F1或一次性工具修正引导事件。可以确认字段拒绝及自然修正有一条实际成功轨迹，不能证明新的15次重复稳定性或把5/6写成R0通过。

## 身份、方法和原始证据

独立工作区 `data/r0-adc6b54-resume/candidate`，HEAD始终adc6b54且干净；Node v24.21.0、pnpm10.17.1。复用已验明构建，未重建或重跑免费套件。

| 身份 | SHA-256 |
| --- | --- |
| dist | `1a26f780a560a7876e1633f9045e9cd92bf3acad031279881891e9d514276770` |
| src | `d0767424eca3de0552d2c852dcd0230ba14f59f793d2a547e155a474d4b26e03` |
| scripts | `856a58c449b1193598ee37c8c6adcc0115d65023ae40091839fdfd744cfaca97` |
| 业务构建 | `47dd20c15b2303d4fcf910d05d334731f8cea59da060e6d0f440fa8b9b3b6e59` |
| UI诊断manifest | `ab448ba92a0de68ee1ec4687e7a81186619e37a1cf7e5d0fdbfa209a9426b395` |

配置、价格和完整矩阵沿用已提交冻结；DeepSeek/Qwen固定Alibaba，Jev业务审查没有关闭，因门禁未发生业务调用。本批实际64个模型请求均为DeepSeek/Alibaba，没有视觉/Jev请求。仅有一项环境修正：隔离clone原本只有origin/main，为现有业务formal脚本的merge-base补齐同提交本地main引用；未切换候选、修改源码/构建/评分或合并main。

使用原 `r0-k45-audit-ui.py` 核对SQLite终态、全部事件、产物字节/类型/归属、scope投影、probe封印；另以原始请求/快照核对健康排序与Filters/导航事实，比较异常/健康重放，核验所有accepted proof及事件顺序。第3/5行重放与健康反例、第4行健康重放PNG已查看。复核没有新增模型请求、重新运行原Agent或修改Oracle。

原始目录：`data/r0-adc6b54-resume/candidate/data/r0-url-campaign/r0-ui-diagnostic-adc6b54-01`。完整本地压缩包及SHA/字节数见机器索引；包含全部失败、报告、事件、SQLite、截图、模型请求/响应、账本及审计材料，不随Git推送。换机复核须取得原始包，不能只凭摘要。

复用映射：adc6b54的57项定向、5项业务边界、8项API及有界只读复核照原交付接受；e13c535已接受F1/F2封印/归属、K1–K3和未改模块按原影响映射复用。原97d39ed正式13/15与e13c535诊断5/6失败不改判、不参与新批分母。布局holdout-inset-9仍是已见样本回归，未证明未见网站泛化。

## 费用和授权停止

本轮新增 **US$0.10388787**，64条已结算请求（63任务请求+1既定smoke）。共享campaign `0946f830-00b6-4f46-af69-79bd2166ef9d` 已知累计 **US$2.01891375**，原US$20累计护栏余额 **US$17.98108625**；另加历史账本US$0.03722460，R0总已知 **US$2.05613835**。unknown/held/lease/running stage均0。

64个请求ID与本批原始request日志及原共享账本逐项对应；没有费用核对重发。停止原因是UI诊断质量门失败，未触及预算或费用unknown。后续三个阶段未生成有效执行approval或启动记录；余额不能自动恢复已终止批次或授权补丁/新批次。

## 可以如何试用、R1边界和维护交接

当前可以试用匿名、有界同源网址扫描、DOM调查、规则与证据报告。已有排序/遮挡发现、参数拒绝与自然修正、可信partial/blocked/历史证明能力；自主完整收尾与重复稳定性尚未通过。登录、表单写入、无限跨域和任意视觉缺陷覆盖不在R0承诺内。

现有环境无需重装/重建。在主仓库使用已有 `.env` 的OpenRouter密钥引用启动（映射只发生在进程内，不打印凭据）：

```sh
export PATH=/Users/xietian/.local/share/fnm/node-versions/v24.21.0/installation/bin:$PATH
EXECUTION_URL_SCAN=1 AGENT_MODEL=openai/deepseek/deepseek-v4.1-flash \
OPENAI_BASE_URL=https://openrouter.ai/api/v1 VISION_MODEL=qwen/qwen3.7-plus \
VISION_BASE_URL=https://openrouter.ai/api/v1 VISION_MODEL_FAMILY=qwen3 \
RUN_TOTAL_TIMEOUT_MS=300000 RUN_MAX_ACTIONS=20 RUN_MAX_MODEL_CALLS=30 \
node --input-type=module -e 'import "dotenv/config"; process.env.OPENAI_API_KEY=process.env.OPENROUTER_API_KEY; process.env.VISION_API_KEY=process.env.OPENROUTER_API_KEY; await import("./dist/server/index.js")'
```

打开 `http://localhost:4111`，选“网址UI检查”，填完整HTTP(S)网址与中性目标，按最多3页/深度1创建任务。结果区查看范围、发现、截图和未验证事项；保存runId，在“恢复历史运行”重新打开。报告API `/api/runs/<runId>/report`，证据 `/api/runs/<runId>/artifacts/<artifactId>`。completed+covered+proofVerified才表示所声明范围完成，partial/blocked不能按“无发现=通过”解读。本机fixture需服务器配置精确URL_SCAN_TRUSTED_ORIGINS，表单不能自行放宽。手动试用不恢复本次验收批次，本轮未额外创建试用任务。

R1可参考既有createRun/统一队列startRunExecution/cancelRunExecution、versioned RunSpec、共享动作/调查/规则、HTTP/SSE及报告/产物接口；调用须按动作专属字段契约，原目标/证据归属、动态绑定、已派发错误/取消/未知写入边界保持。接口存在不表示R1正式准入：R0诊断未通过，正式UI/K5证据缺失仍是门禁。

给Roadmap维护者：记录“adc6b54受限参数修复及只读复核已接受；真实UI诊断5/6，健康行在返回后迟增补Price检查并因时间保留区partial；无参数错误或引导续期；正式UI/K5未准入，R0未完成”。主工作区Roadmap差异保留，未纳入提交、未发跨线程消息、未进入R1。
