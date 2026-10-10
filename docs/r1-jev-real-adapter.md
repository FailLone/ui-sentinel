# R1 真实 Jev 适配与评分工具

当前能力：已实现独立提供方适配器、免费测试、开发输入、请求 dry-run、显式真实批次入口、持久费用账本、证据校验、离线计分和开发阈值重放。尚未调用真实 Jev，尚未核实线上兼容性、评分质量或整轮收益。本项和 R1 均未完成。[计划](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/r1-jev-real-adapter-scoring-plan.md)仍有效。

## 边界

纯探索模块和旧离线命令保持不变。新模块 `src/agent/decisions/jev-provider/` 只在显式实验入口注入：按可信量表编译 state/questions，以每次请求私有映射归一响应，绑定 attemptId/原始摘要/线上摘要；实际 HTTP 默认只指向冻结的 OpenRouter HTTPS 入口，不重定向、不重试。模块不读环境、不读 fixture、不操作浏览器、数据库或终态。

`createJevSession` 强制真实 identity 和 billableTransport，按输入字节限制组装传输，复用原预算、缓存、状态与消费约束。profile/模板/量表/归一化规则进入 adapterRevision。原 promptVersion 仍标识公开投影契约；真实问题模板的身份由 adapterRevision 和 wireDigest 表达，不把旧 system 当成真实提供方指令。

脚本 `scripts/r1-jev-real/` 是独立实验控制端。只有 `cli.ts --run` 在所有门槛通过后读取 `R1_JEV_API_KEY`。不加载 .env，不借用 R0 的授权/费用账本。默认配置明确保留问题数量及计费上界未核实的阻塞，不能开始付费运行。详见[协议记录](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/r1-jev-real/protocol.md)和[量表](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/r1-jev-real/rubric.md)。

## 免费使用

环境 Node 24.x、pnpm 10.17.1。无新依赖，沿用锁文件。命令从本 R1 工作区根目录执行；输出目录必须全新，父目录须已存在，不覆盖历史证据。

```sh
pnpm install --frozen-lockfile --store-dir .r1-pnpm-store
node plans/r1-jev-input/preflight.mjs
pnpm exec tsc --noEmit
pnpm r1:jev:test
pnpm r1:jev:real:test
mkdir -p artifacts/r1-jev-real
pnpm r1:jev:real -- --dry-run --config plans/r1-jev-real/development-config.json --output artifacts/r1-jev-real/dev-dry
pnpm r1:jev:verify -- --evidence artifacts/r1-jev-real/dev-dry
```

dry-run 不读密钥、不外发，保存 24 份公开输入、实际线上请求/问题映射、摘要、问题计数和阻塞；退出 0 只代表材料生成成功，不代表允许付费。工作区有未提交改动时 freeze 记录对应阻塞，提交后重新生成冻结。旧网络陷阱保持；新增递归导入边界检查。只有单独 HTTP 集成测试使用动态回环端口，其他传输测试全为内存注入，无外部请求。

## 真实运行与重放

真实运行需先解决协议计费上界、复核配置与开发标签，生成 clean commit 对应的 freeze，再取得该冻结批次的明确授权。保留批次还要求预先封存标签摘要、独立标注复核和固定量表。布尔字段不是外部证据；执行者须审查 source/basis、金额和授权记录，不能为跑通随意勾选。

freeze 中的 configSha256/requestsSha256/lockSha256 和源码 SHA 由工具校验。authorization 文件严格字段：version=`r1-jev-authorization-1`、authorized=true、freezeSha256、approvedBy、approvalReference、ISO expiresAt；freezeSha256 为解析后严格 schema 对象 `JSON.stringify` 的 SHA-256，不是带格式文件字节摘要。authorization 只在用户已经明确批准该冻结批次后编写，密钥存在不等于批准。该本地文件是可信操作者的记录，不是防恶意操作者的密码学签名。

```sh
# 仅在前置条件与授权完成后；本次没有执行这条命令。
pnpm r1:jev:real -- --run --freeze <freeze.json> --authorization <authorization.json> --output <new-evidence-dir>
# 以下读取已保存材料，不重新调用 Jev。
pnpm r1:jev:score -- --evidence <evidence-dir> --labels <labels.json> --output <new-report-dir>
pnpm r1:jev:calibrate -- --evidence <development-evidence-dir> --labels evaluation/r1-jev-quality/development-labels.json --output <new-calibration-dir>
```

每个 frozen campaign 在 `artifacts/r1-jev-real/authorizations/` 留单次领取记录，换输出目录不能重置同一批预算。账本在派发前持锁、追加预留并 fsync；未知费用、超报价、剩余次数/时间/费用不足均阻止后续请求。崩溃遗留 lock/pending 不自动清理。恢复前人工核对原记录；没有自动重发或尚未经协议验证的费用查询。该限制不能约束提供方实际超收，也不能阻止有文件写权限的人篡改所有记录。

费用与建议独立：已读到合法 usage 时，即使回执无效或状态过期也记录费用；取消后未观察到真实费用则保持未知。批次等待传输结束后封存，迟到回执不能恢复建议。单次 session 的 trace 可能先返回 unknown，最终核算以可校验的持久账本为准。

## 证据与结论

输出包含冻结、公开输入、prepared/dispatch/response/failure 记录、逐状态两组排序、原始有界响应、模型身份、两类摘要、费用追加链、环境和汇总。manifest 索引全部叶子文件，不索引自身；校验拒绝摘要错误、缺项、多余文件、绝对路径、上级路径和符号链接。日志/文件不含认证头，异常消息不原样回显提供方正文。收到成功 HTTP 但语法无效的有界文本也留存；包含凭据的响应拒绝落盘，费用保持未知并停机。

计分先核对完整索引，再按冻结公开输入重新编译、解析提供方响应和程序排序，核对候选与状态；账本独立重算费用，不能靠一份结果摘要通过。失败和未运行计入计划分母；无有效建议时单价为 null，费用未知时不计算完整单价。按家族 bootstrap，重复测量不增加独立样本量。开发报告固定为 development-only，阈值重放不能读取保留集。完整真实评分也只评价给定状态，不能证明未执行动作的后果或三组端到端收益。

标注和实现由同一 Agent 完成的部分明确属于开发自测。本期未创建保留集、没有独立标注复核，不宣称换人验收。下一步先解决计费协议与小批授权；R0 稳定后的页面采集、执行和整轮三组对照另行冻结。本分支来自脱敏导出树，后续只移植允许路径，不能整树合并。
