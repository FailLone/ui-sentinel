# 实现契约

显式请求 `popupCheck: {mode:"popup-viewport"}`，服务开关 `EXECUTION_POPUP_JEV=1`；默认关闭，与原 R1 planner 互斥。系统固定生成弹窗视口子任务，可选 goal 是公开关注背景，不是效果规格。入口问题选择可能打开弹窗或揭示嵌套入口的实际控件；目标问题只处理操作后出现的有限实际浮层；恢复问题选择新入口、补充观察或交接。不使用通用排名。

每个子任务最多 3 动作、6 次语义决策、4 次补充读取，全部包含在原运行预算中。Jev 共用已批准持久费用账户机制但需要单独显式配置，不新建、重置或解封旧账户。固定替身只由进程内测试注入，HTTP 无注入入口。

原执行器动作及测量链保留。子任务准入只延后“先登记全部默认样本再动作”的时序要求，不改变原采样数量、必查或已选控件义务。单个目标选入原 sampling pool 时仍计入默认样本；新的嵌套入口作为附加选择。未访无关控件仍是整任务未覆盖事项，不能用子任务通过核销。

结果来自两个稳定样本的实际节点外框，原生 dialog/popover、role dialog、自定义 fixed 浮层受支持；首次探索不需要事先知道结果选择器。正常内部滚动不算越界。非 fixed 布局可能通过页面滚动到达，变换、动画、复杂绘制等为 unknown；未出现弹窗、低置信度、歧义及预算不足均不能通过。测量回执绑定原 action/item、节点、页面、前后观察、截图和契约摘要。历史报告重新核验回执字节与计算结论。

主 Agent 获得同一子任务动作、证据、缺失事实和失败尝试，可调用同一 `popup_check` 工具继续或有理由刷新；未变化的已知交接结果直接复用，刷新或变化允许再次决策。最终整任务完成仍走原证明门。

本次只做免费实现及验证；无真实模型调用或凭据读取。

## 供并发任务适配器复用的入口与资源所有权

- `src/execution/popup/runtime.ts:createPopupRuntime(deps)` 是唯一生命周期入口。`step('continue'|'refresh')` 推进一步；`snapshot()` 返回目标、原 item/action、有效回执位置、缺失事实、尝试、决策/读取消耗以及测量结果。依赖输入包含 `taskId/contractHash/goal/signal/guard/remaining/frame/decide/act/measure/screenshot/seal/save/emit/settle`。不创建浏览器、Context、队列、账户或全局运行。
- `src/execution/popup/geometry.ts:popupCollector(page)` 只使用调用者的 Page，并持有有限目标 ElementHandle；拥有这些句柄并提供 dispose，不关闭调用者 Page。runtime 的 act/measure/save 均由原执行上下文提供。
- `src/agent/popup/contract.ts` 为语义提问/有限候选契约；`provider.ts` 为可选真实 Jev 传输。生产模型调用通过原上下文 countCall；原 run 总取消和预算仍为上限。进程内 fixed provider 仅用于免费产品集成测试。
- 共享接点集中：`inspection/contract.ts` 请求及冻结策略；`shared/config.ts` 单开关；`server/routes/runs.ts` 准入；`executor.ts` 原动作适配、工具和主循环前置步进；`inspection/check-artifacts.ts` 历史复核；`server/reports/ui-scan-report.ts` 与工作台两处展示。并发框架应在此模块提交后包装依赖，不复制 runtime 或创建第二个浏览器循环。各自独立分支提交后再整合共享接点；不读取或合入对方未提交代码。

## 实现状态

产品接线、原节点派发复查、几何与截图封存、持久证据重算、可重入 Agent 工具已完成。八场景真实 Chromium 免费产品验证及重启恢复通过；不支持/歧义/错误预测/预算不足没有被写成健康，原采样义务未被核销。新增真实收费调用为零；启动/API/支持范围见 USAGE.md，独立的一次真实验证提案见 REAL-VALIDATION.md。最终提交与证据索引将在 RESULT.md 封存。
