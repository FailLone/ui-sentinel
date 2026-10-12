# 工具与验证入口

所有命令从仓库根目录执行，环境见[README](../README.md)。源码位置按用途组织；版本化协议、记录 ID 和一次性费用 claim 保留原值，目录更名不改变产品行为或运行许可。

| 位置 | 用途 | 入口 |
| --- | --- | --- |
| `cli/` | 重置、报告、模型 smoke 与既有业务评估 | `pnpm arena:reset`、`pnpm report`；smoke/evaluate 会调用真实模型 |
| `validation/` | 长期免费回归、固定模型接线与分离的业务/网址批次入口 | `pnpm validate:exploration`、`validate:product-sources`、`validate:path-reuse`、`validate:regression` |
| `validation/counterexample-arena/` | 反例页面服务及检查器直测 | `pnpm arena:counterexamples --list`、`pnpm validate:counterexamples` |
| `decision/offline/` | 公开开发状态与固定回复的离线排序 | `pnpm jev:offline -- --output data/decision-offline/new-run`、`pnpm jev:test` |
| `decision/jev/` | 提供方适配研究、冻结、离线计分与校验 | `pnpm jev:real -- --dry-run --config evaluation/configs/jev-development-config.json --output data/jev/new-dry-run`、`pnpm jev:real:test` |
| `acceptance/product-sources/` | 资料六行冻结协议，免费与真实模式明确分开 | [资料协议](../docs/testing/product-sources-acceptance.md) |
| `acceptance/path-reuse/` | 作者、复用、缺陷、交回四行依赖协议 | [路径协议](../docs/testing/path-reuse-acceptance.md) |
| `research/` | 旧对照研究、特定历史来源复验及证据重放 | 下述边界，不作为首次使用入口 |
| `experiments/`、`popup-product/`、`popup-ui-contract/`、`parallel-popup-real/` | 图片/浮层专项工具，具有各自证据和费用契约 | [图片](../docs/rule-library/README.md)、[弹窗](../docs/popup-checks.md)、[并行](../docs/parallel-checks.md) |

共享的批次预算、取消和上游响应完整性代码位于 `evaluation/support/`，公开探索页面在 `evaluation/fixtures/exploration.ts`，资料回归辅助在 `evaluation/support/product-sources/`。不依赖某个阶段目录复制第二套实现。

## 研究与历史边界

`research/decision-comparison/` 重放冻结公开状态；`research/exploration-comparison/` 研究 Agent/程序/Jev 对照；`research/exploration-acceptance/` 保存旧探索真实验收和续跑契约；`research/path-handoff/` 依赖指定历史作者；`research/evidence-replay/` 核对原始证据。后四类部分入口依赖未随仓库提供的封存文件，不保证 clone 即可执行。

`validation/product-sources.ts` 的默认及动态控件模式从Git材料运行；部分 readiness/continuation/progress 历史恢复模式还会核对原 `data/r2-product-acceptance/` 报告，缺封存包时不能宣称可复现。这些旧数据定位只读保留，不是新输出目录。

尤其 `exploration-comparison/continuation.ts`、`exploration-acceptance/recovery.ts` 固定了原账本、claim路径与摘要。保留这些绝对路径是历史消费保护，不能改为任意输入来绕过原授权。需要历史重演时使用原执行提交及原封存包；当前工具搬迁后必须重新冻结，不能重用旧批准。

不要用未核对的 `--help` 探测真实入口；有些历史工具默认执行。当前安全的材料生成是明确的 `--dry-run`，不是在 `--run` 后追加 dry 标志。提供方密钥环境名和 claim 命名空间中的 R1/R2/R3 是兼容标识，保留以避免重置费用与一次性授权。

## 旧入口迁移

| 旧路径/命令 | 当前路径/命令 |
| --- | --- |
| `scripts/r1-jev` / `r1:jev:*` | `scripts/decision/offline` / `jev:*`（real工具在下一行） |
| `scripts/r1-jev-real` | `scripts/decision/jev` |
| `scripts/r1-decision-pilot` / `r1-controlled-loop` | `scripts/research/decision-comparison` / `scripts/validation/exploration-loop` |
| `scripts/r1-online-pilot` | `scripts/research/exploration-comparison`；batch/lifecycle分别为 `evaluation/support/model-batch.ts` / `run-cancellation.ts` |
| `scripts/r1-product` | 免费入口 `scripts/validation/exploration.ts`；fixtures为 `evaluation/fixtures/exploration.ts`；upstream为 `evaluation/support/validated-upstream.ts`；旧付费工具在 `research/exploration-acceptance` |
| `scripts/r2-product-acceptance` / `r3-path-acceptance` / `r3-handoff-recheck` | `scripts/acceptance/product-sources` / `scripts/acceptance/path-reuse` / `scripts/research/path-handoff` |
| `scripts/validation/r2-product-sources.ts` / `r3-path-reuse.ts --r4` | `pnpm validate:product-sources` / `pnpm validate:regression` |
| `evaluation/r1-jev-*` | `evaluation/fixtures/decision`、`decision-quality`、`jev-smoke` |
| `evaluation/r2-product-sources` / `r3-path-reuse` / `r4-incremental-regression` | `evaluation/archive/results/product-sources` / `path-reuse` / `regression` |
| `evaluation/fixtures/legacy-runs` | `evaluation/archive/legacy-runs`（内部冻结名称不变） |

旧目录不保留第二套实现。历史 `--r4` 暂作 `--regression` 的转发别名；版本化 JSON、模型策略、预算、原始证据以及一次性 claim 名称不改。
