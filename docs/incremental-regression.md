# 同入口重复检查与增量报告

从同入口历史健康检查选择基线，比较实际到达步骤的公开事实，并重新验证原路径。未实现自动局部修订或全站增量回归；真实资料语义变化后的模型重新规划仍待验证。

## 实际入口

使用 Node 24，安装锁定依赖并构建；启用已有 `EXECUTION_URL_SCAN=1 EXECUTION_PRODUCT_SOURCES=1` 后启动工作台。正常产品初次调查、资料变更或只读交回可能调用已配置主模型；本轮验证专用入口始终使用本地固定回复。

1. 选择“网址 UI 检查”，输入同一精确网址。
2. “沿用历史检查（可选）”自动列出最近 20 个同入口已完成运行中的健康候选，显示路径名称、来源版本、时间及步骤。历史证据缺失或不健康的运行不提供候选。
3. 显式选择一次历史检查，填写**本次**资料名称、版本和正文，开始检查。无需先保存或复制路径 ID；服务端通过原健康门验证后自动保存声明式候选。修改网址会清除选择。
4. 查看“相对历史检查的变化”，区分历史参考、本次新验证、缺陷和未验证；旧步骤失效与新资料调查分开。测量和证据链接仍在原产品报告。高级手填 ID 保留。

`GET /api/regression-baselines?entryUrl=<编码后的完整URL>` 为只读有界候选发现，不访问目标网页、不调用模型；比较当前页面发生在明确开始的新运行内。

```json
{
  "kind": "ui-scan",
  "entryUrl": "https://example.org/catalog",
  "baselineRunId": "run-…",
  "productSource": { "title": "目录说明", "version": "2", "markdown": "本次实际资料全文" }
}
```

提交至原 `POST /api/runs`。`baselineRunId` 不可与手填 `pathProgramId` 同传；缺本次资料、非健康/丢证基线或非精确入口均在创建运行前拒绝，不暗中创建替代运行。基线和生成的路径 ID 一同进入原冻结契约。

## 比较依据与边界

- 精确入口含 query/fragment，来源比较身份、版本、正文摘要；正文相同而版本变化也使旧计划失效。匹配仅允许尝试重新测量。
- 比较历史每一步原 `sourceReview.page` 与本次同一步操作前的公开观察。结构按 R3 目标描述与来源命名唯一性校验；公开事实比较名称、文本、值、可见性和属性。不能根据坐标或相似名称迁移。
- 依赖之外的变化只比较完整公开叶节点。祖先聚合文本常含长脚本或重复子节点内容，明确排除，避免把同一子节点变化重复算作全页变化。实际依赖本身截断、公开采集不完整、历史缺失时记未知，不声称 DOM 全量相等。展示变化最多展开 12 项并给出总数。
- `path-regression:identity`、`path-regression:observed` 保存前后事实、原入口/来源身份、观察摘要和阶段；`uiScan.regression` 从持久事件与原 `productPathReport` 投影。本次 verified/failed 仍依赖原来源、动作、测量和可读证据；证据降级会同时降级增量报告。
- 动态第二步只在第一步后比较。尚未到达、预算不足、取消及未知执行不能反推后续目标缺失或失效。前置不满足、目标变更/歧义沿原门停止；已发生动作后只读交回，没有局部自动换计划。
- 来源变更时旧步骤均为历史参考/本次未验证；动作前可以进入原 R2 资料读取与新计划登记，新计划的结果放原产品报告，不按相同步骤序号冒充旧路径验证。

本轮“增量”是复用有效的声明式短路径、减少重复资料提取/规划/参数拼装；比较帮助定位需要调查的依赖，未实现自动局部修订或减少必需测量。固定回复的请求数差仅证明接线，不是实际模型费用、时延或语义收益。

## 免费验证与长期回溯

```sh
DOTENV_CONFIG_PATH=/dev/null pnpm test src/execution/path-reuse \
  src/execution/product-handoff.test.ts src/inspection/path-reuse-contract.test.ts \
  src/server/reports/regression-report.test.ts src/server/routes/ui-scan-runs.test.ts \
  src/web/ui-scan-request.test.ts src/web/ui-scan-report.test.ts
DOTENV_CONFIG_PATH=/dev/null pnpm build
DOTENV_CONFIG_PATH=/dev/null pnpm exec tsx scripts/validation/path-reuse.ts --regression
```

R4 模式沿同一 R3 验证程序扩展现有 R2 页族，以随 Git 的资料和健康页新建基线，不读取任何历史真实数据库。独立 SQLite、正式构建服务、loopback 固定模型及真实 Chromium；显式拒绝 `--real`。测试中源页面变体由操作员在运行前设定，模型只收到公开页与资料。

候选发现、普通选择、来源变更后的原 R2 调查、未知/取消不重放及报告恢复属于本期长期回归入口；不需要复制靶场或执行器。按[靶场维护](maintenance/arena-library-followup.md)持续回溯。
