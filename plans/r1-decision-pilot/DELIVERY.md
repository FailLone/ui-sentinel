# 免费准备交付记录

- 工作区：`ui-sentinel-r1-jev-closeout-20261007`；分支 `codex/r1-jev-closeout`。
- 开始基线：`979b08fce16797295629a4580efe6d18bfb51b59`；核对时干净，未覆盖后续他人改动。
- 本批实现及协议文档提交：`19bd35742442d340438b035938a9b4be13770fa2`。本文件另行文档提交；验证源码以此 SHA 为准。
- 入口、字段契约和固定评价规则：[README](README.md)。源码在 `scripts/r1-decision-pilot/`；原 runner 仅扩展小批配置/数据数量约束，没有改动 R0 执行器或浏览器。

## 实际证据

本地证据根目录：`artifacts/r1-decision-pilot/preparation-19bd357/`，全部以包内相对路径索引，绝对路径映射在 `commands.json` / `verification.json`。

| 证据 | 结果与界限 |
| --- | --- |
| `pilot-tests.log` | 新增14项通过，仅合成免费接线测试 |
| `unknown-stop.log` | 定向复用1项通过，跳过其余10项；独立 R1 队列24项只派发1次，费用 unknown 后停止，余23项未调用 |
| `typecheck.log` | 退出0；Node24.21.0 / pnpm10.17.1 |
| `waiting/status.json` | 真实状态0/8；真实 baseline / 请求清单均等待导出 |
| `synthetic/baseline.json` | 3个明确标注的合成状态；单候选直接选、缺信息交回、多候选准备请求 |
| `synthetic/evaluation/program-vs-history.json` | 仅开发标签；历史选择 unmapped，Jev not-run |
| `synthetic/request-list.json` | 1个合成请求、5道题、5296 bytes；有 wire 摘要，费用预留 null |
| `provider-dry-run/` | 旧适配器成功编译上述请求；问题上限/计费依据阻塞仍在；0次真实调用 |
| 三份 `*-integrity.log` | waiting / synthetic / provider-dry-run 分别1/8/4个叶文件校验通过 |

`SHA256SUMS` 覆盖26个证据文件；该索引自身 SHA-256：
`6afb1ab2738d3f704c0049d6b730aa367686793a81af46a1750df4ca091a8b24`。

两个准备 CLI 的 stdout 仅留于本次工具记录，命令、退出码及实际 JSON 产物已索引；其余验证保存原始日志。不把合成输出当成真实样本结果。证据在忽略目录中保留，未打包、未推送，完整复现命令和合成输入已提交。

## 缺项与本轮结论

1. 缺 R0 正式8状态、来源摘要/截断点及历史选择映射：尚不能交付真实程序基线、具体实际请求清单或判断增益；不重建浏览器轨迹。
2. 缺真实样本人工参照：需在任何 Jev 输出前冻结；未独立复核者标开发评价。
3. 缺每请求问题数支持范围与正常/失败/取消路径的有依据费用预留：verified 保持 false，quote 保持 null；用户授权本身不替代协议事实。
4. 未获任何真实调用授权。草案0–8次，总USD0.25；先首个状态兼容，再余项质量，合并复用旧六状态方案中的接线能力而非额外追加六次。

已有证据继续有效。本批只完成不依赖导出的免费工具准备；真实比较与最终付费请求包待材料，不声明真实协议、评分实验、探索闭环或R1完成。若纯程序已经足够，或Jev无额外收益，按固定停止规则结束；默认启用保持关闭。S4继续暂停，当前没有执行接入。
