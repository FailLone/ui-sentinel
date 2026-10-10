# 可观察浮窗与 Jev：main 合并收尾

2026-10-10，按用户“好，收尾”接收 `codex/parallel-check-tasks` 最终候选 `373abc83cb4b496961ea5ed58a5e02bdfb824cd3`。正常合并提交 `878edc0`，无冲突；合并前main为 `d2fa772`。保留所有源提交、旧授权/费用账本和失败证据，没有删除分支或本地原始材料。

## 接收范围

- Jev官方Choice协议、传输诊断和原费用边界；嵌套入口所需公开上下文与有界读取。
- 新请求采用 `popup-viewport-2`：Jev选择探索入口，UI程序测量实际可见浮层；功能预期由原generic/effects和 `popup-effect.ts` 验证。新路径不发送TARGET或要求内部因果证明。
- 已有、异步出现及多个浮层分别检查；受支持的几何产生pass/fail，缺证据、不支持或未覆盖保留unknown，最多测两个浮层。父任务必需/已选义务与partial不被子结果覆盖。
- 审查修复：普通控件不因文字变化冒充浮窗；插入造成位置选择器变化不冒充原节点替换；显式刷新有效且保留去重、配额、取消与每动作读取上限。
- 旧 `popup-viewport-1` 及旧报告读取保留原含义。未新增默认启用、权限、收费授权或通用规则框架。

## 接收验证

维护者核对合并后的 `src/`、`scripts/`、`package.json` 和 `pnpm-lock.yaml` 与候选逐文件无差异；main上的规则/Skill/脚本复用设计保留。Node 24下以 `DOTENV_CONFIG_PATH=/dev/null pnpm build` 完成组合构建，包含TypeScript检查，退出0。

直接复用已完成材料，不相加成互不重复的总测试数：

- [新契约原交付](observable-contract-20261010/REPORT.md)：200项测试、4个本地固定模型/真实Chromium产品场景、历史证据核验。
- [审查修复](observable-contract-review-fixes-20261010/README.md)：69项定向测试、4个Chromium反例、类型及构建检查，含完整前后DOM。
- 本次没有重跑上述套件、浏览器或真实模型，也没有新收费请求；新增费用0。

使用方法与支持边界见[产品说明](../goal-directed-jev/USAGE.md)。`EXECUTION_POPUP_JEV` 与 `EXECUTION_PARALLEL_CHECK_TASKS` 仍须显式设为1；合并不会启动服务或修改现有运行环境。

## 结论与后续

本轮实现和审查整改已接收，结束这批开发，不等待额外收益实验。历史真实调用说明有限协议和探索轨迹，新契约免费证据不等于真实网站泛化、稳定提速或整个R2验收通过。原失败、旧TARGET unknown及最早三笔费用unknown均保留。

后续优先按实际使用暴露的问题定向修复。规则驱动取证、跨规则程序复用仍按Roadmap另行选定范围；如需评估新契约下真实模型效果，必须另冻样本、评价与预算，并取得对应授权，不自动恢复旧批次。本次保留分支/worktree以保存未入Git的材料。
