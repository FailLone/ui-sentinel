# 真实并行弹窗批次：已停止并封存，完整目标未验证

2026-10-10（Asia/Shanghai），仅执行已授权的一批。P01 的真实主 Agent 成功委派两个独立子检查；两笔 Jev 入口请求真实并行派发，随后 **Jev HTTP 错误**触发全批停止。没有有效 Jev 选择、点击或弹窗测量，P02/P03 未运行。没有自动重试、补样、换供应商或修改收费运行代码后续跑。

这次失败不是因父报告 partial 被判失败：直接停止原因是 `jev-http-error`，两子弹窗目标也没有测量证据。真实父委派能力在此单行得到观察；Jev 语义准确性、原动作至测量的真实模型闭环和提速仍未验证。

## 授权与冻结身份

- 人类批准：维护者会话用户于 2026-10-10 直接回复“授权”，由维护者转达，绑定本次范围；[批准原件](evidence/approval.json)记录于 **11:49:03.962**，24 小时有效至 2026-10-11 11:49:03.962。
- 批准交付 `9cd8480339b4a75ec58ffcc74481e3bb3c15f54a`，冻结运行源码 `c8f59a24bbb8465107ed35f24837206bf32f4e59`。
- [机器清单原件](evidence/manifest.json) SHA-256 `26110502dfc06faadf0bf3d9f54302ba02c2cf54181f41775a001367ff213056`；构建 SHA-256 `e8792a14f7fa967cbb0bde1a75ba03915d896c19665d8f379911741d393aeca3`。
- 启动前和封存前均核对 718 项源码与构建；没有重建或改动冻结源码。真实模式使用既有私有配置中的凭据，未打印或归档密钥。
- [启动公开报价核对](evidence/quotes-at-launch.json)：11:49:05 分别确认 Wafer / TypeSafe，报价和身份符合冻结上界。
- 新账户 ID `19b67843-f204-4501-8d96-fd6cfefc4e70`，批准限额 USD 1.86。[单次消费声明](evidence/single-use-claim.json)已经消费，不能自动重复本批。旧费用账户、旧 unknown 未改动；未推送或合入 main。

## 逐行结果

| 行 | 真实父委派 | Jev 入口/目标/补证 | 实际动作与测量 | 子目标 | 父范围 |
|---|---|---|---|---|---|
| P01：原生弹窗宽窄视口 | 成功。主模型先调用 `page_inspect`，随后同次响应产生两个 `check_task_submit`，均被原产品工具接收 | 两子各派发 1 个 entry 请求；有效选择 0、target 请求 0、recovery 请求 0、补充读取 0 | 动作 0；测量 0 | 两子均 unknown，未验证预期的窄 fail/宽 pass | 父 cancelled、coverage=partial，保留默认义务和完整目标的未完成范围 |
| P02：两步自定义浮层 | 未启动 | 未调用 | 未操作 | 未验证，不冒充失败样本或成功 | 全批停止后不再入队 |
| P03：无浮层的诚实交接 | 未启动 | 未调用 | 未操作 | 未验证，不要求模型必须犯错 | 全批停止后不再入队 |

P01 父 run：`run-60c6c8bc-eeca-4e67-bab8-845b368babee`。窄子：`check-d7beeffe-8807-4a0e-9bc6-68dad3a4d030`；宽子：`check-a47dde7c-2a78-4b3c-803f-64d0563c64ee`。两子原 run 均以 blocked/`popup-account-stopped` 收尾，父委派投影为 cancelled；两个层次的原状态均保留，不相互改写。

实际入口请求来自各自当前页面的公开候选。没有有效回答，因此不能判断 Jev 会选择哪个入口，也不能把接口错误解释成“选错按钮”。[原请求及主模型响应](evidence/requests.jsonl)、[主模型完整网关响应记录](evidence/responses.jsonl)、子原请求附件均已保留。

## 实际费用与逐笔对账

**已知费用 USD 0.0028128；3 笔费用未知，保留 USD 0.066；held=0。实际总费用仍未知。** 原账本的保守占用为 `0.0028128 + 0.066 = USD 0.0688128`，不是把未知费用断言为已花费金额，也不是把失败请求按零计费。账户限额未超，未对 unknown 自动对账、清零或重发。

| 原请求 ID | 通道与归属 | 原账本状态 | 已知费用 USD | 未知保留 USD |
|---|---|---|---:|---:|
| `6a4619612495039604678496` | 父主模型第 1 次，Wafer | settled | 0.00137178 | 0 |
| `33f7cfc7a6e10d1b3c350e5c` | 父主模型第 2 次，Wafer | settled | 0.00144102 | 0 |
| `ace3716351457d9185dacc96` | 父主模型第 3 次，被全批停止取消 | unknown | 未知 | 0.060 |
| `57fb44d8-42e4-4103-a342-ff37eb938b0f` | 宽子 Jev，TypeSafe | unknown | 未知 | 0.003 |
| `816a1f91-2217-4bd1-937c-e68da2089aa0` | 窄子 Jev，TypeSafe | unknown | 未知 | 0.003 |

实际 **3 次主请求 + 2 次 Jev 请求 = 5 次**；父原 usage.modelCalls=5，父 `model:request-started`=3，两子各 usage.modelCalls=1，两条 `popup:provider` 与子费用 requestId/owner 一一相符。[费用与事件核对](evidence/P01-fee-proof.json) matched=true；[原账户表导出](evidence/original-ledger-export.json)保留 dispatched、unknown、停止事件和账户身份。收尾后独占账户锁行数为 0；unknown 的保守占用没有释放。

## 停止与收尾时间线

以下均为北京时间：

- 11:49:05.997：普通 API 父 run 开始，主单次期限 60 秒、自动重试 0。
- 11:49:23.880 / .888：真实父模型的两次委派工具进入原执行器。
- 11:49:25.228 / .246：宽/窄子 Jev 请求分别经过同一个原账本 dispatch，确实同时在途；父第 3 次主请求也已在途。
- 11:49:25.452：`jev-http-error` 写入原 [stop.json](evidence/stop.json)，全批停止并取消在途请求。没有此时间之后的模型派发。
- 11:49:25.468 / .492 / .505：两笔子请求和父在途请求分别保留 unknown。
- 11:49:25.548 / .555：原子浏览器关闭事件均为 closed=true；随后子 run 提交终态。
- 11:49:25.566：父 run 最后提交 cancelled，原耗时 19,574 ms。

这只能证明两个真实请求同时在途和停止传播，不能用于有效任务提速结论。

## 原件、可读性与诊断限制

所有原输出、原 DB、新账户、29 份原附件、授权与许可声明均随本目录归档；[artifact-index.json](evidence/artifact-index.json)按 artifact ID 映射归档文件，原 localhost 服务已结束。原始本机目录也保留在 `data/parallel-popup-real/approved-batch-01/`，没有覆盖或删除失败原件。[封存摘要](summary.json)与 [SHA-256 清单](archive-manifest.json)可用于复核。

原报告：[父报告](evidence/P01-parent.json)、[窄子报告](evidence/P01-check-d7beeffe-8807-4a0e-9bc6-68dad3a4d030.json)、[宽子报告](evidence/P01-check-a47dde7c-2a78-4b3c-803f-64d0563c64ee.json)。另用数据库副本离线重建历史报告，并运行原 completion/child-artifact 检查；[离线核对](evidence/offline-final/integrity-audit.json)无事件或子证据问题，原数据库字节未变。没有为了读取报告重启服务或发模型请求。

必须保留的限制：

1. 冻结 Jev 包装层遇到非 2xx 就触发停止，没有保存该 HTTP 状态码、错误正文和最先失败的请求身份。能确认 HTTP 错误类别，不能从现有记录确定具体状态码、根因，或哪笔 Jev 请求首先报错。没有编造缺失响应，也没有追加收费诊断。
2. 原报告仅将 completed/blocked 视作可标 verified 的终态，所以 cancelled 父报告仍为 `not-final`，离线读取也如此；不是报告读取竞态的推断。父完成事件已提交，原 completionIssues/childArtifactIssues 均为空。冻结评分器因该字段保留 safetyStop=true；它不是首次触发本批停止的原因。两份原子 run 报告的 persistence 为 verified。
3. 冻结启动器在封存已停止批次后返回进程退出码 0；**批次成败须读 `result.batch.stopped` 与逐行评分，不能把退出码当验收通过**。本次明确记为停止、完整目标未验证。

本批已经结束。没有将未运行行算通过，没有因为子执行的资源/记录校验通过就宣称弹窗目标或整站通过；没有继续执行剩余额度或自动进入下一批。
