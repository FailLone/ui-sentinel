# S0：评分证据两处定向修复

本任务已根据用户明确要求交给本次开发 Agent；不是委派整个 R1，也不启动真实服务或全面免费复验。

开发位置：现有独立 R1 工作区，`codex/r1-jev-closeout`，基线 `c47f496405524db9fc3f66683266f3c5dc3ecedf`。只改 `scripts/r1-jev-real/score.ts`、必要评价辅助及就近/独立反例测试；不修改核心排序、真实提供方、执行器、fixture 预期或验收门槛。超出允许范围先说明必要性。

## F1：派发与费用账本完整对应

对整个 evidence 包，核对真实 dispatch、prepared/response/result 与账本 ticket 的双向关联。已有 `tickets ⊆ result.attemptId` 不足：空/缺失账本不应让有派发的请求免费通过，重复或错绑派发也不能合并消失。核对 attemptId、两类请求摘要、对应状态/结果、可用原始 usage 与结算值。未知费用保持未知，合法派发前拒绝/缓存不能伪装为一次收费请求；不能仅依赖自报 summary/trace.attempted。

## F2：交回结论回放

语义交回 `uncertain/insufficient-information/requires-agent-investigation` 必须由绑定的原始响应经同 profile 的 normalizeResponse 重算，比较 kind 和 reasonCode。raw scores 不得伪造成 handoff，raw handoff 不得随意改理由或 confidence 结果。取消、超时、预算不足、传输失败等是生命周期/失败结果，不可当模型正确交回；缺 raw response 不能靠 result 自报补证据。

## 定向验收和停止

新增反例至少覆盖：空/漏票据；多余/重复/错绑派发；费用与原始 usage 不符；scores→伪 handoff；handoff 理由伪造；删除/错绑 handoff 原响应。保留合法语义 handoff、完整费用记录、非语义失败的正例。篡改样本应重建其摘要/索引，确保拒绝来自语义复核而不是旧 hash 失配。

只运行新反例、直接受影响的 tooling 测试及必要类型检查。复用原 181+55 与干净克隆证据，不再全量重跑或克隆。记录代码提交、测试文件内容身份、命令、退出码、原始日志及失败修复；证据放 `artifacts/r1-jev-real/targeted-scoring-fix/`，提交实现与测试，返回摘要。父 Agent 只审查这两项的修改/证据并形成结论，不接管无界返工。最多一次定向整改；再次同类失败则保留阻塞和根因，不降低标准。
