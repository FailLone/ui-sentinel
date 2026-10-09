# R0 必需范围登记接口（受限实现，2026-10-08）

## 契约差异与可信来源

既有公开中性 goal 和 `url-scan-1` 协议只规定有界采样，未规定逐个独立控件全部必查。`evaluation/private/url-scan/healthy-behavior.ts` 的 overlay 健康判定额外要求展开筛选；运行时没有收到这一项。因此不能把私有判断导入产品，不能从样本 ID、文案或缺陷答案生成义务，也不能追溯改写历史通过结果。

通用解决路径：请求方把其公开要求显式提交为 `requiredChecks`，经严格校验后冻结在 UI 契约/hash 中。来源是创建请求的用户/API 调用方；页面、Agent、评分器不能改写它。调用方负责这份声明覆盖其 goal；执行器不声称能证明自然语言目标已完整编译。冻结验收的公开要求需要同样通过该接口提供，私有评分器只负责独立核验。

## 具体接口与规则

```ts
POST /api/runs {
  kind: 'ui-scan', entryUrl, goal,
  requiredChecks?: Array<{
    id: string; description: string; selector: string;
    action: 'click' | 'fill' | 'link'; value?: string;
    verify?: { selector: string; condition: ExistingInteractionCondition;
               expected?: string; basis: string };
  }>
}
```

- `id` 唯一、1–60 位字母数字/下划线/连字符；最多 12 项；严格拒绝额外状态、删除或权限字段。description/selector 不得空白。
- 本次只绑定入口页的实际可见候选。click/fill 必须带原有公开后置条件；fill 必须有显式 value；只有 fill 接受 value。link 禁止 verify，仍按原契约实际点击与落地观察验证。需要 expected 的条件不得省略它。
- `requiredChecks` 存在表示请求方显式提供了完整公开目标映射；空数组仍保留原默认采样、已选工作、规则及假设义务。缺省则兼容旧目标路径，**不启用新自动 closing 或扩展准入**。新声明的 policyRevision 为 `url-scan-scope-2`；旧请求仍为 `url-scan-1`。
- `createInspectionHost` 在首个观察前创建 executor 所属、selected/pending 的必需事项，并写入原 scope 事件。`requiredRegistrationComplete()` 核对声明与登记；漏登记/擅自排除使原完成函数的 contractValid 事实不成立。
- 观察阶段只有选择器唯一匹配、实际候选节点与目标 ElementHandle 相同且仍连接时才 `scope:required-bound`，自动选择该候选。缺失、歧义、候选截断或节点替换保留未完成义务；不靠文字相似度代换。
- `requiredActionError()` 在真实派发前核对原动作、value、verify；不改写请求。实际测量/阴性只读 probe/原有只读恢复通过原事项回执同步必需事项。阳性 probe 不解决效果检查。持久校验另核对每项登记、绑定、结论及证据关联。

## 实时准入和收尾

每次新选择/动作使用执行器当前 actions/modelCalls/timeMs。已选事项、已登记事项及原默认采样保留为必需；同一批选择只允许一个尚缺的默认采样名额，不能批量夹带扩展。不得因预算不足改成可选。

`admitOptionalScope()` 按三维上界核对必需剩余工作、扩展及原收尾保留量。当前自由探索没有可信成本上界，生产路径保守拒绝；不采纳 Agent 的成本估计。拒绝不派发、不新增已选事项，返回实时预算，并以 `scope:admission-refused` 及报告 `optional-not-checked:*` 记录未检查范围。原候选列表中未选事项也保留，closing 事件明确列出。

串行工具边界/下一模型调用前，先检查取消、真实阻断、动作结算、调查程序、写入与对账状态，再调用**原 `decideInspectionCompletion`**。全部满足才设 closing 栅栏，拒绝排队扩展，调用原 `finishUiScan` 的 flush → seal → 新事实复判 → 原持久提交。复判变化不重开探索。没有新循环额度、模型续期或预算重置；F1/工具修正实现不变。未知写入、取消和真实执行失败仍优先。

## 本次边界

这是显式 API 范围声明的执行闭环，不是目标 NLP 编译器、跨页步骤调度器或整个 R1 调度器。保留原 8 候选、每页 3 个不同本地控件、同源页/深度及时间/动作/模型上限。超界的必需工作不能默默豁免。工作台尚未提供该声明编辑器；普通网址扫描继续旧路径。新付费冻结前必须先有可信公开声明，不能拿历史通过行补分母。
