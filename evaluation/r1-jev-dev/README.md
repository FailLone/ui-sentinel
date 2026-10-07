# R1 Jev 独立开发种子

22 个新造合成情境，无真实浏览器/账号/历史运行样本。public 是正常任务与公开事实，evaluator 是评价侧标签与理由，stub 是替身回执/动态场景指令。后两者不能进入实际 send body，也不能被 src 运行模块导入。

stub-reply-1 是**测试替身描述**，不是声称提供方的真实 wire 协议。dev 将它适配到自己的注入接口并保存原始/解析回执。scenario 类型由测试驱动器调度事件实现；不能把 operation 当生产指令。所有固定分数/期待状态只属于评价测试，不证明真实 Jev 判断正确。

label expectedStatus 针对 stub 模式的归一化 outcome；invalid-input 可由 handoff + reasonCode 归一，须保留确切原因。pure baseline 不做语义预测，agent-investigation 样本的 handoff 只要求 stub 支路，baseline 结果单列。zero-transmissions 是严格要求；禁用与缺候选不应请求模型。几何样本允许的 inspect 只是建议，不能启动浏览器。

22 个种子不替代 T01–T16 的竞态/费用/缓存/并发反例，dev 必须补充。改变 fixture 时更新 manifest 的全部摘要；有理由修正标签须写勘误并保留旧失败，不能为测试变绿降低预期。公开字段名/序列结构详见主计划第4节，任何字段扩展须版本化且记录兼容性。
