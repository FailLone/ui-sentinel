# 可观察浮窗契约：审查修复

基于 `4c3b5a9`，修复审查确认的三项问题；维持功能效果与 UI 几何分别验证的契约。

1. **普通控件误通过**：功能检查复用浮层分类器时传入节点标签，普通 button/a/input/select/textarea/img/svg 不因 fixed、背景、边框及文字变化就成为自定义浮层；明确的 native/dialog-role 语义仍保留。
2. **插入误判替换**：逐份后观察检查原节点身份是否仍然存在。新面板插入使兄弟节点的 nth-of-type 改变可以通过；原节点消失、身份缺失或样本间真实替换仍拒绝。
3. **显式刷新无效**：`step('refresh')` 在旧 handoff 去重前执行受限刷新。刷新前后事实去重、每动作读取记忆及原读取/时间/取消限制共同生效；`frame(true)` 消费外部读取配额，运行时仅登记本地计数，避免双计费。新入口可继续探索，新浮层可直接测量。

## 验证

- 先加回归：修复前两文件 35 项中 12 项失败，覆盖三项审查问题；修复后通过。
- 最终定向回归：6 文件 **69/69**，涵盖新/旧 runtime、几何、功能效果、两类收据读取。
- 真实 Chromium：**4/4**；固定按钮改文字为 unverified，插入新面板为 verified，隐藏原目标被替换为 unverified，原生 dialog 出现为 verified。完整前后公开 DOM 见 [browser-results.json](browser-results.json)。
- 类型检查、生产构建、修改文件格式及差异检查通过。
- 所有验证使用本地合成页面，无真实模型调用，新增费用为 0；没有重跑历史付费验收或修改历史证据。此前审查的失败原件仍在本地 `data/review-observable-contract/result.json`。

测试文件：`src/inspection/popup-effect.test.ts`、`src/execution/popup/ui-runtime.test.ts`、`src/execution/popup/runtime.test.ts`、`src/execution/popup/geometry.test.ts`、`src/inspection/popup-artifacts.test.ts`、`src/inspection/popup-ui-artifacts.test.ts`。

浏览器复现脚本：`scripts/popup-ui-contract/review-regressions.ts`。在项目根目录使用 Node 24：

```sh
mkdir -p data/review-observable-contract
pnpm exec esbuild scripts/popup-ui-contract/review-regressions.ts --bundle --platform=node --format=esm --packages=external --outfile=data/review-observable-contract/fixed-browser.mjs
DOTENV_CONFIG_PATH=/dev/null node data/review-observable-contract/fixed-browser.mjs
```

本轮完成三项缺陷修复，保留在 `codex/parallel-check-tasks`；未推送或合并 main。这证明确定性执行与判断得到修复，不新增真实模型收益或整任务验收结论。
