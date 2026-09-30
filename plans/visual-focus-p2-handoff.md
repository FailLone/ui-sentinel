# 主动视觉发现：P2 交接

状态：主 Agent 修复中，真实模型复验待完成。P0/P1 ready；P3/P4 未完成。

代码来源：P1 修复 `1df75dd` → dev bundle `865835c` → `review/visual-focus-p2`。不合并 main。

## Review 修复

- 场景选择、样式及代理差异由靶场服务端渲染为当前组件 HTML。浏览器没有固定 v1–v6 token，也不再下载全场景行为对照表；原生 label 负责健康场景的焦点转交。当前 DOM 的正常结构和行为仍可观察，这不是私有答案表。
- H2 添加真实、可用的 Clear search 相邻按钮；D1 改用 Find accessories。浏览器测试确认六例几何/实际焦点、按钮位置、探针未点击按钮、搜索和清空功能。检查实际编译 JS 不含私有场景表。
- 真实模型复验暴露坐标单位不一致：模型接口明确声明 0–1000 归一化坐标，服务端按已验证截图尺寸转换并保存转换信息；Agent 和探针仍使用 CSS 像素。缺少单位声明、未知字段及越界整体拒绝，不根据 DOM 猜单位。算法版本 `visual-focus-3`。
- 修复 binding reason 的百分比/小数单位比较；目标选择本身保持原规则。
- 提供 Git 内的真实模型开发 smoke 入口，复用现有计费 gateway、build identity、证据下载和停服审计。没有临时文件作为运行依赖。

## 复验

```sh
pnpm install --frozen-lockfile
pnpm format:check
pnpm typecheck
pnpm test
pnpm validate:visual-focus -- --preflight
# 显式付费入口，缺 OPENROUTER_API_KEY 明确失败；默认 D0/H0/H1
pnpm validate:visual-focus -- --p2-smoke
# 六个已知开发案例各一次，不是 holdout 或正式 18 轮
pnpm validate:visual-focus -- --p2-smoke --cases D0,H0,H1,D1,D2,H2
```

使用项目 .env，或通过 DOTENV_CONFIG_PATH 指向自己的凭据文件；绝不把凭据发给 Agent 上下文或提交 Git。付费入口要求干净提交，自行构建，固定 DeepSeek/Qwen 及 Alibaba 提供方，不静默切换模型、不自动重跑案例。300 秒/40 动作/30 共享模型调用；P2 smoke 明确关闭 blocker review，原子调查及视觉扫描开启。

默认费用保护为 $2。继续失败批次时传 `--spending-source <前一批目录>`，已知费用及未知预留累计扣除，不自动获得新的 $2。同机制两次失败、提供方错误或隔离问题停止，其余计划行保留 not-run。P3 仍需实现跨新旧正式批次的统一 campaign 协议。

输出 `data/visual-focus-p2/<timestamp>/`：manifest、构建 hash、模型价格、完整请求/响应与费用记录、每例报告/私有真值/原图与标注/回执、图像发送 hash、停服审计、包含失败和 not-run 的 summary。原始资料不进 Git，入口和断言进入 Git；他人可以重新生成证据。当前开发 smoke 复用产品回执校验并额外对照独立 fixture 几何；不能替代 P3 的独立对抗评分器。

`--diagnostic` / `--formal` 仍明确拒绝，待 P3。此次没有运行正式新18轮及旧45轮。

## 证据与结果

待主 Agent 完成本机复验后补齐实际提交、目录、计数、费用与结论。dev 文档中原先六例真实结果的脚本和原始资料没有随 bundle 交付，因此仅视作开发者自述，不作为本次通过依据；旧文档及其失败目录可从 Git 查看。

## holdout 边界

D2 已被用于修改提示词，D1/D2/H2 均已用于开发观察。它们现在是已知诊断/回归案例。冻结后重跑不能恢复其 holdout 身份，也不能声称未见案例泛化。

P3/P4 必须在提示、schema、算法冻结后，由主 Agent 维护未参与调试的 D1/D2/H2 新 fixture revision，并冻结独立真值；原六例保留回归用途。新修订一旦用于修改算法，也必须记为开发案例。没有这样的新修订证据，就只能报告固定案例回归，不能宣布原 holdout 验收完成。

## 下一阶段

P3：完整独立评分器、安全/坐标/usage 反例矩阵、正式 CLI、campaign 费用协议及审计；P4：冻结后的诊断、新18轮和同构建旧业务45轮。P2 ready 不代表这些已完成。
