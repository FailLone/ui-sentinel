# 主动视觉发现：P4 执行清单

状态：**P4 accepted**。免费 1093 项测试、真实视觉诊断 4/4、视觉正式 18/18、业务诊断 6/6、业务正式 45/45 及所有审计通过，结果与恢复过的错误见 [P4 交接](visual-focus-p4-handoff.md)。执行冻结提交 `a4c0698`，分支 `review/visual-focus-p4`；未合并 main。以下保留实际执行顺序与门槛，总规范仍以 [完整验收计划](visual-focus-acceptance.md) 为准。

## 1. 冻结边界与新样本

先固定 P3 的 Agent 提示、候选 schema、探针算法、评分器和模型配置，再制作页面。准备期间只改 fixture、展示、对应真值与验收资料，不根据新样本调整产品行为或放宽评分。

- D0/H0/H1 保持原样，供真实诊断。
- 新 D1：绿色宽输入外观、Grid 三列分配两侧空间、不同文案/位置/尺寸；中心原生输入可聚焦，两侧不转交焦点。
- 新 D2：900×700 视口、蓝色圆角区域、独立文字 label、尾部装饰图标、Flex 分配空间；图标是排除区，两侧非图标留白仍可复现问题。
- 新 H2：同 D2 外观，整个 field 使用原生 label 代理，右邻清空按钮保持独立且不重叠。

新案例对应 `visual-holdout-2`。主 Agent 对实际页面、私有几何、真实正向控制/边缘点击以及健康代理进行复核后才填写 review 元数据。免费固定响应仅用于检查夹具与执行链路，不证明模型能发现问题。

旧六例的真值和视口保存在 `evaluation/fixtures/visual-regression-1.json`，旧展示继续可用；原 D1/D2/H2 仍执行真实浏览器回归。原 D0/H0/H1 与新矩阵共享。不能把旧案例更名后重新称为 holdout。

这里的保留集指未用于产品提示/算法调试的页面变体，不宣称训练隔离。被测 Agent 只见正常任务与当前网页，不接收 case ID、私有真值、selector 或坐标。若正式 holdout 结果用于改动提示/算法，它就成为回归样本，下一次泛化验收需要新 revision。

## 2. 免费复核与冻结

1. 验证新旧真实页面几何、聚焦行为、相邻按钮、搜索/清空功能；目视检查 D1/D2/H2 原图。
2. 运行 `pnpm format:check`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm fixture:approved-retry -- --verify`、`pnpm validate:visual-focus -- --preflight`。P3 未改动部分的免费验收记录仍保留；受本次 fixture 影响的检查必须重跑。
3. 检查 diff：产品 src、评分器、预算和模型配置没有改变。commit 后工作树必须干净。
4. 真实 runner 重建并记录 commit、完整 build hash、fixture hash、protocol、模型/provider/profile。后续以这些实际 manifest 为准，不手填或改写旧结果。

固定条件：DeepSeek `deepseek/deepseek-v4.1-flash`、Qwen `qwen/qwen3.7-plus` 均固定 Alibaba；有限 Jev `typesafe/jev-1.13` 保持原端点。视觉 profile=1/1/1，业务=0/1/1。每 run 300 秒、40 动作、30 模型调用；不为了通过提高限制。

## 3. 真实诊断与共享费用

使用同一 campaign 目录，例如 `data/campaigns/visual-focus-p4-01`；默认整个 campaign 上限 $2，所有真实 smoke/诊断/正式矩阵累计已知费用与未知预留，不逐阶段清零。使用本机已有 OpenRouter key，仅传入进程，不提交 .env 或在日志打印密钥。缺凭据明确停止。

```sh
pnpm validate:visual-focus -- --diagnostic --campaign data/campaigns/visual-focus-p4-01
```

该命令包含真实视觉 smoke 与 D0/H0/H1，共 4 行。D0 要有真实 Qwen 候选、DeepSeek 主动调查、独立评分支持缺陷；H0 必须实际探针反驳假设，H1 无误报；三例均购买成功且显式 finish，持久审计通过。先读该批证据，未通过不得启动 18/45。

失败分清模型/提供方故障、候选遗漏、语义绑定、探针、完成策略、评分或持久化问题。两次相同机制失败后停止付费诊断，给出最小复现和针对性修复；不无限重试。保留每次失败和 not-run。

## 4. 正式验收顺序

诊断完整通过且冻结身份不变后依次执行；下列来源参数必须替换为本次实际产物目录，不能指向旧 P2 smoke 或 fixed 结果。

```sh
pnpm validate:visual-focus -- --formal --campaign data/campaigns/visual-focus-p4-01 --diagnostic-source <本次视觉诊断目录>
pnpm validate:business -- --diagnostic --campaign data/campaigns/visual-focus-p4-01
pnpm fixture:approved-retry -- --out <本次批准fixture导入目录>
pnpm validate:business -- --formal --campaign data/campaigns/visual-focus-p4-01 --diagnostic-source <本次业务诊断目录> --approved-source <本次批准fixture导入目录>
```

视觉 18 行与业务 45 行均保留完整分母。诊断行额外计费，不计入正式通过数量。视觉要求缺陷 9/9 真阳性、健康 9/9 无误报，H0 全部实际验证；所有购买、finish、证据和预算约束均通过。业务维持原 A/B/C/D 评分及原批准来源，不重新批准规则。

质量失败保留结果，完成当前批可安全执行的计划样本；批次失败后先 review 再决定后续阶段。隔离失效、未知副作用、持久化不一致、取消或预算耗尽立即停止，剩余行 not-run。未知费用不按 0 处理，不自动 reconcile 续跑。

任何影响执行/提示/模型/证据的修复都产生新冻结版本，重新诊断并重跑所需正式矩阵；不能跨 commit 拼接通过。纯文档更新只有构建 hash 一致时可以引用旧证据，但需如实说明提交差异及 runner 的严格来源门槛。

## 5. 交付与完成标准

最终交接列出：冻结 commit/build/fixture、全部批次与失败目录、每行结论、截图/测量、停服审计、campaign 总费用/未知预留、18 轮耗时分布及模型/工具分项、视觉 18 和业务 45 的完整结论。

只有 G0–G6 全部通过才标记 P4 accepted。单次诊断成功只能标记 G4 passed。免费预检成功只能标记准备完成。没有发生的付费验证一律写未执行。
