# 待另行授权：语义职责拆分后的 P02 单行真实验证

本方案只检查真实 Jev 能否在窄问题下探索两级入口、关联已出现的目标，并观察候选几何与归因结果。它不验证整任务 covered，也不校准准确率。当前仅完成免费准备；未发出真实模型请求。

- 源码：`182e65eca2c316755b736303264f7dcbeca163cf`。
- Manifest SHA-256：`bce6785d7cfb8b9fb877d4003d159110d3e3c603a33fd50a7605cfbc0dae08d6`。
- Runtime SHA-256：`ee946d5b158584f193dfe401ffb7860ed78b75795be3f41afdf3c7c1913d741c`。
- 范围：原 P02 `/p/two`，1 个父任务、320×480 与 640×480 两个隔离匿名子浏览器。原 HTML、publicGoal、publicInput、私有离线评分均逐字段一致。私有预期不进入模型 prompt。
- 固定模型：主 `deepseek/deepseek-v4.1-flash` / Wafer；Jev `typesafe/jev-1.13` / TypeSafe。最多 10 主 + 6 Jev 请求，新隔离原共享账户上限 **USD 0.62**；`10×0.060 + 6×0.003 = 0.618 ≤ 0.62`。不拆分额度、不借旧账户余款、不复用旧授权或 claim。
- 原额度：父共享 maxActions=6、maxModelCalls=16；每子 actions=3、modelCalls=3、reads=2。本次候选预采样每次使用其中 1 read，不增加额度。功能显式启用，权限仍是原 local-ui，businessWrites=none，默认检查保持。
- 时限：单主请求 60s、单 Jev 8s，单行及整批 180s，清理最多另 60s。无重试、fallback、追加恢复批次、vision、R0/R1 或额外真实探针。
- 任何身份、归属、权限、证据、持久化、请求上限、未知费用、超额、HTTP/传输/超时失败、时限或取消均走原停止链；已发未结算保留 unknown，不释放为可用额度。安全停止退出 2；无安全停止但未达原评分退出 3；未处理异常退出 1；满足原单行评分才退出 0。

需要另有用户对上述 manifest 的明确授权，再填写 `approval.example.json` 的批准者、可追溯来源及有效期，保存为新的授权文件。其余 hash、maxCostUsd、maxParents=1、10/6 请求上限、singleBatch=true、retries=0 等必须精确匹配。示例模板目前仍是 null，不能作为授权使用。本轮创建的只是一份新提案，旧 manifest 的已消费批准不适用。

授权后，由维护者在此隔离工作树使用 Node v24.21.0，以最小环境 `HOME`、必要 `PATH`、`DOTENV_CONFIG_PATH=/dev/null` 和获准在内存中注入的 `PARALLEL_POPUP_API_KEY` 运行。不要加载其他模型环境配置，不在命令、日志或归档中输出凭据。必须选择全新输出目录：

```sh
node plans/parallel-check-tasks/semantic-purpose-20261010/real-preparation/runtime.mjs --run \
  plans/parallel-check-tasks/semantic-purpose-20261010/real-preparation/manifest.json \
  <new-explicit-approval.json> \
  data/parallel-popup-real/approved-p02-semantic-purpose-01
```

执行前自动核对源码、Node、依赖、bundle、输入及评分，重新读取公开报价并核对冻结上界；任何不一致或价格超过边界均停止，不调用模型。一个批准只消费一个新 manifest claim；不得补样或利用剩余额度再跑一次。

验收保存：两次 ENTRY 的原始选择/完整概率/n/confidence 与版本化采纳原因、实际动作与新事实、TARGET 的纯关联选项、TARGET 之前的候选几何、原动作/item 归因收据（若成立）、unknown 原因（若不成立）、所有 wire/响应/账本费用、父 blocked/partial 及默认缺口、取消/关闭与持久化证据。真实模型仍可能选择 none 或低置信度而交接；如实保留该结果，不能以免费替代测试预判通过。
