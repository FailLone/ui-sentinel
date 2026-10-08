# DOM 省略回执的局部修复交付（2026-10-08）

源码候选 **`c1d41e1`**，基于交付 `b4e0973`，保留已接受的 `b266089` 费用停止修复。**本次证明信息交付得到修复，尚不证明真实模型减少重读或 R0 通过。** 本轮模型/浏览器/新增付费均0，没有执行独立诊断中的6次付费对照；原失败保持原样。

唯一运行时变更为 `src/agent/context/decision-memory.ts`：`page_inspect` 进入 omitted 短回执时，保留原 args 的 selector/offset、原 total/nextOffset 和原 resultRef，继续保留 omitted=true。在1800字节 history 查询回退中也保留这些定位字段。没有补 DOM 节点、验证答案、动作建议或查询默认值，没有改提示词字符串、调度、模型、动作契约、完成门和预算。

查询使用完整字符串：普通短回执 selector 的 JSON 编码上限256字节，紧凑 history 回退80字节；超出则只标记 `queryOmitted=true`，不生成截断 CSS，原完整查询仍可通过 resultRef 取回。缺失/非法分页值不补0或null；原始终止游标null仍与缺失区分。`page_inspect.nextOffset` 是 DOM 匹配项偏移，`tool_result_read.nextOffset` 是原 JSON 字符偏移，两者不混用。8000字节决策记忆、1800字节历史检索页和现有窗口/引用规则不变。

来源：健康 overlay 的 run `run-2f9f51f3-a7f7-4f22-8f4d-6325de29c0ad`，第11请求 `efd690aaeaea758f222284d7`，原 requests.jsonl 第17行。原 DOM 回执 `8.0` 为事件 seq203；第11请求的输入截止 seq209，下一模型开始 seq210。原请求传输是 success，所在任务 blocked/partial，不能把它改写成传输故障。原回执含 `args={selector:"body *",offset:0}`、`total=21`、`nextOffset=12`，与归档 SQLite 和保存的 JSON 证据逐项一致。

静态 A/B 保存于 `data/r0-dom-locator-free/`：

- `original-request-line.json`：原 JSONL 行逐字保留；另有原 body、记录、截止前历史与原8.0回执。
- `A.original.json`：原第11请求 body。
- `B.locator-only.json`：仅在 `/history/3/tools/0` 增加 args、total、nextOffset；omitted、hint及所有其他输入均与A一致。不添加后9节点、后续页面、隐藏推理/评分答案或下一步提示。
- `locator-only-diff.json`、`static-ab-index.json`、`static-ab-verification.json`：差异、截止位置、来源摘要与离线核对。验证材料不是模型输入。
- `dom-locator-static-ab-and-free-evidence.tar.gz`：上述原始材料、免费测试和核对日志的本地包；字节摘要见 `plans/evidence/r0-dom-locator-free-delivery.json`。跨机器需取得该包及原来源包，不能仅用 Git 摘要代替原请求。

免费验证 **20/20**：4个新增反例加16个现有相关记忆检查，typecheck通过。覆盖真实8.0省略后构造合法续读、完整原引用恢复、字符游标不混用、7条超大DOM回执与关键 verification 同包、8条 history 回退、长查询、缺字段、真实错误及终止null。原第11输入离线重压缩与B的记忆部分完全一致：**6576→6643字节，仍≤8000**；history索引 `[5,6,7,8]`、最新index9及其回执保持不变，scope/task/finishReadiness/预算等字段没有变化。其他有效证据（费用41项、84项旧定向验证、12浏览器场景）复用，未追加整批回归。

限制：长查询仍需检索原引用；原历史窗口外事实没有被自动保留；分页定位不证明当前页面未变化，也不证明隐藏区域与控件的业务关联。未替换现有 `08acc95` 构建、重放浏览器或取得新模型输出，不能授予真实验收继续资格。

R1 字段/来源澄清：此前8状态包不重建、不标注新答案。该8.0回执来自 seq203，而健康 overlay 的S06截止 seq179，**不能回填进S06**。原公开包的 estimatedCost 是相对工具工作量，不是美元报价；归档版本/候选只供离线建议，实时目标权限仍由执行器核验；fill保留在原生操作记录，不转换为click。本次A/B是独立历史时点材料，没有替R1生成决策。

维护者 Roadmap 和独立诊断文档保留，未修改或提交；没有新增开发/付费实验轮次，交付后停止。
