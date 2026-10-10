# 修复后三场景批次：新授权冻结

用户于维护者会话 `01a1116d-7621-7962-b4fe-5f904b5fbf13` 在 2026-10-10 明确“好的，开始”，维护者转达并明确新增 USD 1.86 上限。授权本次已验证修复后的 P01/P02/P03 连续执行和收尾，无需逐行再次确认。不是复用旧许可。

冻结源码 `7dc39a7d15872892b66871cf2b67391d0c09733f`，含实现 `87a2816deb8885e42c3785731846a0a6f9791372`。新 manifest SHA-256 `bf261f6cbe41d28c65ad9f3c8dc4272ec3db698d2d641985b04c2cb77a365fda`；新 bundle SHA-256 `0d9a8c710e0843a2df07c9f1576dec2f42dcf3051974834093d1b61e674e2b72`，路径 `data/parallel-popup-prepared/batch-02/runtime.mjs`。

[机器清单](manifest.json)与[新旧差异](manifest-diff.json)：16 份新增/变更源码恰好属于已交付修复；策略、场景、公开输入、私有评分数据、Node、依赖与费用公式完全一致。新变化仅修复源码、冻结身份/构建路径与新报价。原脚本构建输出路径固定，构建时保全并恢复旧 bundle 原字节，新包独立存放并重新计算最终清单哈希；没有改执行代码。旧 manifest、授权 claim 和账本不变。

3 父任务、每父最多 2 子任务；全批最多 30 主模型 + 18 Jev；每行 10 主 + 6 Jev、6 动作、16 总模型请求、180 秒。主模型 `deepseek/deepseek-v4.1-flash` / Wafer，60 秒；Jev `typesafe/jev-1.13` / TypeSafe，原 8 秒。全批派发 600 秒、收尾 60 秒。一个新的原账户共用余额，30×0.060 + 18×0.003 = USD 1.854 <= 1.86。

公开输入与原场景不变，未添加正确入口/私有答案。正常语义失败或诚实未知按原逐行评分记录；unknown 费用、越权、证据/费用身份失配及其他原硬停止条件仍立即停止。禁 fallback、付费重试、补样、换供应商继续或失败后改代码续跑。P03 不强迫选择/操作。

新的真实授权记录绑定上述最终 manifest，24 小时有效，仅一次 claim。通过原启动报价门后使用新输出 `data/parallel-popup-real/approved-batch-02/`。原 USD 0.0028128 已知、USD 0.066 unknown 计提，以及单次成功 USD 0.000040614 与本批分别列账，不读取修改旧账户。

未重跑已有免费矩阵或单次真实探针。收费运行命令由安全启动器注入凭据：

```sh
DOTENV_CONFIG_PATH=/dev/null node data/parallel-popup-prepared/batch-02/runtime.mjs --run \
  plans/parallel-check-tasks/real-preparation-02/manifest.json \
  data/parallel-popup-prepared/batch-02/approval.json \
  data/parallel-popup-real/approved-batch-02
```

最终无论成功或失败，保留原报告、错误、未运行行、费用及全部原证据，封存停止；不自动进入下一批，不合并或推送 main。
