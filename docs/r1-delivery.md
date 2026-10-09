# R1 本期交付与 main 合并

2026-10-09。本期 R1 完成：普通入口的有界程序优先探索通过真实验收，维护者已审阅并合入 main。Jev 默认关闭，收益研究单独推进。

## 身份与依据

- 验收源码：`e3de7cb890803c69e89e2ef8b91986e392901fc4`。
- Agent 交付：`84246f9`；合并前 main：`16cf9fd`。
- main 合并：`7b35d7bfd4bb714c4d986f447e012412cbb6486b`。
- [唯一验收入口](../plans/r1-online-pilot/README.md)、[逐项审计](../plans/r1-online-pilot/product/deadline60/paid-20261009/audit.json)、[费用](../plans/r1-online-pilot/product/deadline60/paid-20261009/accounting.json)。

28/28 项通过：22 completed、6 预期 blocked，52 个实际动作、30 次真实主模型请求、Jev/视觉调用为0。边界场景正确保留未完成事项与安全停止，未计作页面功能健康。全部28份保存报告由原验收器复核，1,693份附件核验一致。测试对象为固定公开合成靶场，不是任意公网覆盖保证。

本批 usage 费用 USD0.061762584，无新增 unknown/held。累计产品已知 usage USD0.066787134；两笔历史 unknown 预留 USD0.116 原样保留，实际总账单未知。独立历史 Jev frame USD0.000250824 另列。历史 HTTP400、假 covered、15秒超时及已消费许可不重写、不复用。

## 普通入口与范围

启用网址扫描后，在工作台选择“网址 UI 检查”，勾选“R1 有界探索”；API 使用 `exploration: { "mode": "program", "jev": false }`。省略 exploration 维持原有行为，Jev 默认不调用。

程序规划与现有执行器共用动作、测量、检查事项和完成证明，支持有限多步、状态变化重检查、去重、公平性、公开输入边界、明确目标下返回/刷新、有界恢复及报告历史。每页最多3项本地检查、24个程序步骤、2次返回/刷新，仍受原任务权限与预算约束。公开目标/结果歧义后仅只读调查和 partial 收尾。

登录角色、任意副作用、全站无限状态、任意自然语言语义验证及浏览器历史栈恢复不在本期范围。Jev 的收益、S1 更广状态、S2 评分校准和旧72轮比较尚未完成，已正式后置，不作为重新打开 R1 的条件。

## 维护者接收检查

重点审阅普通入口与冻结策略、程序调用原工具、状态绑定和义务保留、歧义后动作阻止、预算/取消、报告证据关联、Jev 显式开关与费用门。未发现阻止本次整合的明确缺陷；此审阅不声称穷尽所有代码路径。

合并无冲突、无功能补丁。合并树与源交付只有 `docs/product-roadmap.md` 不同：保留 main 最新维护记录。验收源码至源交付之间无 src/scripts/evaluation/package/lockfile 变更。维护者核对150项源码、1,904项本地材料摘要，均一致，并核对28项通过标记；没有重新运行浏览器或付费验收。

接收工作区执行锁定依赖离线安装及 `pnpm build`，类型检查、服务端、工作台和两个靶场构建通过。源代码差异检查通过；历史证据日志的末尾空行告警保留，未为格式清理改写原始材料。

接收工作区为 `/Users/xietian/.codex/worktrees/rules-main-closeout/ui-sentinel`。维护者核对结果和构建日志在 `/Users/xietian/Documents/ChatGPT/ui-sentinel-local-archive/r1-main-closeout-20261009/`。源交付工作区及运行数据库、截图、账本继续保留，完整大文件并非随 Git 迁移；定位以[原始材料索引](../plans/r1-online-pilot/product/deadline60/paid-20261009/raw-local-files.json)为准。

原主目录 `/Users/xietian/Documents/ChatGPT/ui-sentinel` 的旧分支、未提交 Roadmap 和未跟踪资料保持原样。它不自动代表最新 main；使用当前交付应从 main 的干净工作区启动。

## 后续

由新的独立会话按[Jev 收益研究任务书](../plans/jev-benefit-study/README.md)推进。目标是判断是否值得在指定场景启用 Jev，不以研究尚未完成否定本期产品交付，不沿用已经消费的付费许可。
