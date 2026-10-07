# R0 最终候选验收清单

2026-10-07。目标是完成 `r0-url-scan-plan.md` 的必需出口；不能只凭测试总数宣告完成。生产执行器/提示/规则沿用 `f0ae8a5`，继续验收只补测试、fixture、费用冻结及回执。最终 commit、编译内容 hash 和命令结果写入 `data/r0-acceptance/2026-10-07/` 的冻结清单与交付索引。

## 已核对的 A/B 证据映射

下表中的测试已纳入候选验证命令；最终结果以本目录原始日志及验收回执为准。旧日志只在编译内容和配置相同且不受变更影响时复用，记录来源，不把多个构建的模型运行拼成一批。

| 需求 | 确定性/浏览器反例 | 正式接线/独立证据 |
| --- | --- | --- |
| U01 无适配器正常站点 | `ui-executor.test.ts` 禁止创建 business runtime | URL preflight 健康目录和静态 info；真实排序/服务计数/独立重放 |
| U02 正常异常对照 | 私有 fixture 两种布局各五样本独立重放；正常 modal/inert/disabled/视口外真实 DOM；overlay 反例 | 六行固定替身 campaign；必须区分接线通过和能力行失败；C 待授权 |
| U03 完整入口 | URL/导航 schema，真实重定向保留重复 query/hash | URL preflight 的服务访问日志、spec/报告 |
| U04 交互及导航 | 实际后置数字排序、错目标/过期引用；导航边/深度/hash/pushState | preflight 真实排序及 info 导航，持久范围投影 |
| U05 资源和动态数据 | session/closeout 的资源与 fetch 授权隔离及到达计数 | fixture 实际 GET 数据更新 DOM；独立浏览器确认正确顺序 |
| U06 重定向及越界 | session 逐跳重定向、未知目的地零到达；closeout 页面脚本派发前拒绝 | preflight 越界动作拒绝，无错误导航落地 |
| U07 写入与方法语义 | network-policy 方法/已声明 GET 写入、session POST 零到达；UI 动作边界 | boundary 样本的私有请求日志、无 POST 到达；不声称识别所有伪装 GET 写入 |
| U08 干预 | UI executor 干预后 covered 拒绝；证据提升回归 | 六行 runner 的拒绝对照必须 partial、无 supported 原站点误报 |
| U09 缺陷仍能完成 | completion/inspection-host failed 是完成测量，UI proof 与终态一致 | 固定替身 overlay 异常可产生规则发现并 completed；真实自主能力留 C |
| U10 保留未验证 | scope/host/finish 对 pending、lost target、unsupported、空 update 的反例 | illegal-finish、navigate-out 真实 API 报告，不能清空 gap 获得 covered |
| U11 结束事实 | completed proof 必須关联 scope/spec/终态；模型自称/工具成功不够 | preflight 非法结束拒绝，持久报告不变为完成 |
| U12 取消与预算 | UI executor、网络并发限额、chunked、解压、持续流及 AbortSignal | 扩展 URL preflight：活动与排队取消、迟到无 accepted finish、模型预算终态 |
| U13 重启 | 存储/队列 reconciliation、UI interrupted 不重放 | 扩展 preflight 真正 SIGKILL/重启服务，活动及 queued 均 interrupted；健康终态/证据恢复；持久化六轮回归 |
| U14 历史 | run-kind、legacy-analysis、report-ui 与原业务契约测试 | 原报告语义不追改；URL 历史实际恢复与工作台再打开 |
| U15 购物/导出 | 全量既有写入/重试/恢复/证据测试；C0–C5/E0–E4 fixture 真值检查 | 业务 32 项、persistence、investigation、blocker-review、visual-focus、programs 免费预检；真实 5+45 仍未执行 |
| U16 证据与终态 | completion-integrity、报告篡改/重算 hash/缺 artifact、原跨 run 与错 hypothesis 回归 | 完成报告重启后与前序事件相同；campaign 新 SQLite 连接核对；artifact 可移植索引 |
| U17 各工具入口 | 同一 executeAction、program act、取消/写入守卫和原子程序回归 | programs 与 atomic investigation 实际 SDK/Chromium 预检；UI 不开放业务 Journey |
| U18 答案隔离 | fixture 公开资源/private control 不可访问；scorer 泄漏反例 | 留存全部模型输入；固定替身脚本不是生产提示；C 中性目标，不传样本 ID/私有真值 |
| U19 实际地址 | 地址分类/混合解析；真实已审核 socket；TLS Host/SNI 正常/错域/不受信任；worker/popup 出站拒绝 | 本地受控 socket/浏览器日志；不以此宣称验证了全部公网部署 |
| U20 正式闭环 | UI 请求/报告状态与原 API/事件测试 | 表单真实创建、报告截图、重启后历史打开、SSE Last-Event-ID 与轮询 after 逐条一致 |

## 本次补充验证的原因

原 URL 预检仅注释“历史恢复”，没有重启或重新打开；现增加真实生命周期测试，28 条扩展为 42 条。补充 TLS/解压/取消与实际健康控件，补充缺 artifact 和自洽伪造 proof 的历史读端反例，均保持原产品预期。

费用冻结先前取模型目录最低价，与固定 Alibaba 提供方不一致。现在读取指定 endpoint、canonical slug 和完整报价，按最高阶梯/时段及缓存写入费保守预留；实际费用仍由既有网关/账本记录，未知或超额停止。测试替身不连接提供方，不能产生 C 证据。

`holdout-grid-1` 在 f0ae8a5 的生产提示冻结之后建立，改变布局，不在生产代码增加 selector/case 特判。独立验证 fixture 真值并不意味着模型已经通过。如果未来据该布局改提示/策略，必须将其降为已见回归集并另备保留集。

## 真实验收门槛与待授权批次

首轮仅申请 UI 诊断六次和一次 smoke，共享累计硬上限 US$2。固定 DeepSeek V4.1 Flash、Qwen3.7 Plus，提供方均 Alibaba；确切模型 ID、报价及哈希由 freeze 输出。每轮最多 300 秒、20 动作、30 主模型调用，网关每轮最多 60 请求（含视觉/重试），输出最多 4096 token。对公网只查询免费模型/价格元数据；未获明确付费授权不得发送 chat/completions。

| 行 | 正常用户目标/入口 | 私有验收预期 |
| --- | --- | --- |
| healthy-catalog | 目录 UI 通用检查，带 path/query | 真正排序并有界导航，完成且无误报 |
| overlay-healthy | 同一中性目录目标，公开控件 | 实际操作健康控件，独立正常重放，无误报 |
| overlay-defect | 与健康对照相同入口/目标 | 独立确认前景控件遮挡，有依据的发现且完整结束 |
| dom-healthy | 同一中性目录目标，公开排序要求 | 实际正常排序，不能以 unknown 替代通过 |
| dom-investigation-defect | 与健康对照相同入口/目标 | 自主 DOM 调查证明排序不符公开要求，独立重放 |
| boundary-diagnostic | 同一中性检查目标 | 写请求被拒、零写入，保留 partial/干预，不能误报原站点 |

上表及私有预期只给验收者；被测模型仅获得中性目标和公开页面。诊断全部达到预定结果后才能进入正式；未知、漏检、误报、费用未知和未跑都保留并阻止整批通过。

后续正式 UI 15 次（9 健康实际通过、6 异常独立有效发现）和业务诊断 5 次/正式 45 次仍按原计划。尚未授权；不能在六行诊断通过后自动扩展花费。每阶段所需 smoke 也纳入同一累计账本。所有必需出口满足且独立报告完整，才向维护 Agent 建议 R0 完成；Roadmap 不由本轮自动更新。

## 授权及首次 C 诊断结果（2026-10-07）

上文“待授权”是批次前状态。用户随后授权 6 次诊断 + 1 smoke / US$2。冻结批次 `r0-ui-diagnostic-8adc93a-01` 的 smoke 成功，第一条健康样本超时未通过，费用回执 unknown 按规则停止，另外五条未运行。只读费用核对后总额 US$0.0372246；原停止记录保留。详细依据、免费整改、评分器待改项及新保留样本要求见 `r0-diagnostic-2026-10-07.md`。C 出口仍未满足，未授权下一批或正式验收。
