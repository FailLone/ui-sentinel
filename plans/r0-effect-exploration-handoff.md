# 未知效果首次探索与原事项关联：受限免费交付

实现候选 **`5f41285`**。真实产品服务、真实Chromium、确定性本地模型驱动；没有直接浏览器点击证明通路，没有真实模型或新增付费。R1、Roadmap、原R0失败和已关闭付费批次未改。**确定性通路已成立，不证明真实Agent能稳定使用，更不代表R0通过。**

## 原实现实际行为

最小页面只有一个已选Filters按钮，操作前无结果区域/ARIA关联，点击后才创建可读取内容。独立公开规格在操作前固定，缺陷变体输出不同内容，不能从实际结果反推预期。

- 普通调查程序空assertions被拒，0动作；不支持明确的无效果断言证据收集请求。
- 前置规格核对程序能经真实investigation_run点击一次；它没有效果后置断言，但原事项变成unverified。后续只读调查可测得真正结果并pass，仍不能关联原事项；完整结束拒绝。
- 更严重的负例：无关的稳定段落后置断言pass，会把Filters标verified并取得完整证明，**即便实际输出违背独立规格**。本批保存原始失败回执，不将它重标为成功。

原证据：`data/r0-effect-exploration/baseline-2026-10-08T13-45-05-574Z/` 与强化缺陷负例 `baseline-counterexample-2026-10-08T13-58-11-378Z/`；完整路径见机器索引。它们确认上轮“衔接尚未确立”，也确认原程序并非完全不能探索。

## 必要的局部改动

仍用两个既有产品入口、同一performAction/网络边界/预算/收尾与持久流程，没有第二执行器、规划器或需求编译器；工具契约升为28。

1. investigation_run增加显式`exploration`模式：UI已选pending本地控件、仅一次click、一个已知控制目标、assertions必须为空。操作只收集证据，verdict=unknown/effectTested=false，不创建伪缺陷假设；原项保持pending。动作、前后证据、actionId/itemId和运行内checkRef持久保存。
2. 可选expectedEffect只有`text-equals/text-contains`。其字面expected必须已在**原用户目标**中，并在操作前冻结条件/值/basis及目标哈希；没有独立期望仍可探索，但不能因观察到变化就核销原项，不能事后改期望。
3. page_inspect读取实际反馈并记录节点身份；interaction_verify用探索checkRef及其实际读取的selector，在同文档、同原动作版本、清洁证据及源字节匹配下，用既有measureInteraction绑定/测量。只归属原itemId；不点击，不改变冻结期望；原固定恢复入口不允许改selector。
4. 拒绝未读/错误/被替换的结果、body/html/交互控件占位、原本已满足的谓词和无关未变内容；另一动作使旧引用失效，同原未完成探索禁止补点击。最多两次只读测量，不能用换结果目标擦掉未知。
5. 原UI程序不再因“任一后置断言”一锅核销动作项：只有单动作、相关post-action结果、非焦点/存在等占位、前态未满足且实际有效的结果比较可关联；真实unknown/故障仍不能核销。既有明确关联的展开程序回归仍通过。pending证据追加不重开已完成事项，持久投影保留resolvedAt=null及原分母。

动作权限仍来自原运行契约、选样/准入、网络和预算门，**不是可见/启用**；真实取消、故障和未授权写入处理未另造分支。

## 最短调用示例

先从真实element_details回执取得已选按钮的`controlCSS`；独立公开用户目标在创建run时已包含“Availability options”，没有给结果selector。

```json
{
  "version": 1,
  "phenomenon": "收集已选控件的未知结果",
  "basis": "原匿名检查授权；尚不声称效果通过",
  "exploration": {
    "expectedEffect": {
      "condition": "text-equals",
      "expected": "Availability options",
      "basis": "操作前原用户目标的独立公开规格"
    }
  },
  "targets": [{"name": "control", "selector": "<实际controlCSS>"}],
  "steps": [{"op": "act", "type": "click", "target": "control"}, {"op": "measure", "name": "after"}],
  "assertions": []
}
```

这是investigation_run输入，尖括号是示例中的真实回执变量，不是可直接发送的CSS。无独立期望时用`exploration:{}`。随后：

1. `page_inspect({selector:"section,[role='region']",offset:0})`，仅从实际返回节点取得`resultCSS`；未提前猜新内容或结果id。
2. `interaction_verify({checkRef:<原探索实际checkRef>,selector:<实际resultCSS>})`；回执应同时指向原actionId与itemId。根据真实测量可以verified或failed，均保留证据；无依据/无效/不确定保留pending。

示例的三个请求、前后截图、公开读取、测量及原事项状态都在真实回执中保存。没有把未执行的示意参数称为通过。

## 定向验证与保留问题

**14个直接相关浏览器反例核对通过**：真实关联pass、真实关联fail、探索后拒完整结束、无独立期望、拒重复点击、错误结果、事后改预期、其他动作使旧证据失效、取消、执行故障、匿名POST拒绝、原无关断言负例、原有已知结果槽回归、无效程序预检后权限标志正确恢复。一次正常探索只有1动作；唯独“其他动作”负例总计2不同控件动作。通过/失败测量都回连原action/item，不要求Filters必须通过。

**66项定向单元/相关回归通过**（新8项；已有恢复、交互测量、调查服务、UI绑定、scope及记忆契约），另**5项真实在途未知业务写入/取消隔离回归通过**；其余70个executor测试未运行。typecheck通过。没有重跑R0全量或付费验收。免费场景预算保持300000ms/20动作/30请求；同run探索→读取→测量没有重置预算。匿名POST负例没有请求逃逸，真实不确定业务写入仍quarantine且不重放。

构建身份不混同：14条原始回执使用`candidate-final`产物；最终源码额外恢复旧UI关联的`result.verdict !== 'unknown'`总故障门，只对直接受影响的`legacy-related`重验通过。`final-legacy-guard`源码映射与候选完全一致；机器索引保存两份产物摘要及唯一源码差异，不声称最终构建重跑全部14例。原正式dist未替换。

开发验证失败也保留：初版身份映射/持久pending投影问题已受限修正；一次并行验证出现持久化尾部/终态核对失败，数据库和日志留存，**未修改持久化模块来消除该失败，原因尚未完全定位**。串行隔离通路通过，不据此宣称并发持久化稳定。最后测试脚本误要求“零动作预检失败”产生探索事件，保存其失败退出与原14条回执；只读审计确认第14例0动作且完整结束拒绝，校正后单独重验该例通过，没有重跑补齐付费/质量分母。

## 尚未支持的边界

- 此受限探索仅一个已选本地click，不支持fill/scroll/navigation、跨文档、另一次动作后的迟到关联。
- 独立期望须操作前冻结且字面来自原用户目标；后来才获得的网页规格、新声明、非文字/复杂视觉效果不在此候选自动核销范围。原健康overlay中未声明的具体效果不能靠新反馈事后补成预期。
- 当前关联是单动作时间片、节点身份和字节来源证据，不自动证明任意动态网站的因果或需求适用性；不新增自然语言语义判定。
- before DOM采集有500元素上限，长基线/隐藏或歧义结果保守拒绝；原8000字节决策记忆、完成标准、已选分母不放宽。
- 旧多动作UI程序不能仅凭聚合verdict核销所有原项；可保留调查结果，原义务需分别取得关联证据。源码候选未替换原正式构建，没有真实Agent稳定性证据。

机器索引 `plans/evidence/r0-effect-exploration-delivery.json` 保存候选、构建/来源、全部阶段路径、原错误、实际回执及本地压缩包摘要。本轮新增付费0，不触碰共享资金池、不恢复A/B或后续验收。维护者文件未混入提交；交付后停止。
