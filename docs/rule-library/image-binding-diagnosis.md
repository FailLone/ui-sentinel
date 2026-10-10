# 无语义声明的只读绑定诊断：本轮交付

2026-10-09，独立分支 `codex/rule-image-proportion`。基线 `ea23bfc2a1debccace4b03b1c055e02d0e4a6ede`；实现提交 `36e008f54d32d8f5ee1e185e4d7c6daabc57d478`。本文件是本轮唯一交付说明；[任务锚点](https://github.com/FailLone/ui-sentinel/blob/25409ce/docs/rule-library/image-diagnosis-current-task.md)仅记录范围与完成状态。

**已能在不提供保形声明的情况下诊断当前候选绑定。** `diagnose` 返回分维度机器事实、原始证据和拒绝原因，不产生合同、审批、RuleResult 或新的 facts-ready 状态。普通 `check` 仍要求真实语义声明并重新执行原有机器门。D004 运行时仍为 `image-shape-distortion` 0.1.0、默认关闭；无新绘制能力或 R0/R1 接线。

## 使用现有实验入口

在本规则工作区使用 Node 24；将 URL 替换为获准观察的页面，输出目录须尚不存在。下面是操作说明，不表示本轮又访问了该示例地址。

```sh
pnpm exec tsx scripts/experiments/image-bindings.ts \
  --url https://example.org/page \
  --out data/image-diagnosis-review-001 \
  --interactive
```

正常导航先生成 `candidates-1.json`。从该文件明确选择所需 `candidateId`，在同一个仍开放的 CLI 会话输入下列命令（替换尖括号内容）：

```text
diagnose <从当前候选文件选择的candidateId>
quit
```

没有自动选择第一张图片，也不需要 review 文件或占位确认人。第一条诊断通常输出 `diagnosis-2.json`，控制台显示机器绑定状态和原因。CLI 使用当前批次的 observationId；API 则显式传入两个身份：

```ts
const diagnosis = await host.diagnose({
  candidateId: selectedCandidate.candidateId,
  observationId: selectedCandidate.observationId,
})
```

`host` 是既有 `openImageBindingExperiment` 的开放会话。依赖来源仍按现有 `--resource-origin` 和部署策略配置；本地可信夹具才使用精确 `URL_SCAN_TRUSTED_ORIGINS`。诊断不另发获取图片的请求，不导航、点击、填写或滚动。它会进行一次新的页面观察、截图和本地证据写入，因此未来实验的观察次数预算必须计入诊断；“只读”指网站业务和 DOM，不代表没有本地文件/事件写入。

[真实 CLI 输出样本](evidence/image-binding-diagnosis-cli-sample-20261009.json)逐字复制自已关闭的本地合成场景。样本 ID 已失效，不能拿来诊断其他会话。可直接离线查看它：

```sh
python3 -m json.tool docs/rule-library/evidence/image-binding-diagnosis-cli-sample-20261009.json
```

## 各维度如何解释

每节分别返回 `available / unavailable / unknown`、原因、事实及 evidenceRefs。这些是诊断状态，不是规则四态，也不是放行许可。

| 维度 | 程序事实及解释边界 |
| --- | --- |
| identity | 读取前后是否仍为原 ElementHandle、唯一匹配数、旧/新 documentId 与 nodeId。路径相同、资源相同的替换节点仍不是原目标；不选歧义目标中的第一个。 |
| resource | 当前 currentSrc、加载/解码状态、已有资源证据与 SHA，以及是否匹配旧资源。当前资源 available 可以同时伴随旧绑定失效；不从扩展名、alt 或文件名猜格式/义务。 |
| paint | 保存原有采集器的旧/新绘制、可见性、变换、epoch 和限制。available 表示机器测量可用，不表示图片健康；`unmodifiedPageEstablished` 另列全局完整性判断。 |
| evidence | 原候选证据的预期/实测摘要、新观察证据引用、原到期时间。文件校验成功不抹去网络干预；过期、丢失或篡改仍阻塞原绑定。 |
| network | 保存全局 EvidenceIntegrity 和已有事件的 id、seq、时间与完整 payload；记录本次读取截止序号，不是无限期网络完成证明。 |
| semantics | 本诊断请求未提供 intent、basis.reference、statement、confirmedBy；明确 unknown、approval=false，不自动补确认人，不复用以前的确认，也不声称站外一定不存在依据。 |
| machineBinding | 汇总原候选状态、有效期、文件、原节点、页面/视口、资源、绘制/epoch 与网络门。available 只表示这次读取满足机器门；之后普通消费还必须重新核验。 |

network 只把 `destination=image` 且 URL 或 redirectFrom 与当前资源地址精确相等的事件列为直接相关请求；当前地址缺失时注明使用原候选地址。其余拒绝分列，**对目标的影响保留 unknown**，包括看起来像遥测的请求。直接 URL 关联也不等于已证明视觉影响；没有建立请求因果图或“无关请求豁免”。所有全局干预继续阻塞普通消费。无已记录干预只表示当前完整性记录为空，不承诺页面从未受任何外部影响。宿主仅等待已有事件落库，不重试请求。

`consumption.actualInputGateReasons` 记录不提供语义声明时普通输入门会拒绝的原因，通常为 `missing-or-invalid-explicit-basis`；`machineGateReasons` 单列本次诊断发现的机器原因。`checkInvoked=false`、`ruleEvaluated=false`、`canConsumeNow=false`，并不冒称已实际调用 checker。闭合会话为 `session-closed`，不再追加诊断 artifact/事件。

## 保持原消费边界

实现把既有机器校验提取为共享 `validateBinding`。普通 check 继续采用原先的提前拒绝路径；仅 diagnose 可以在原候选已有缺口时补读独立的当前事实，以便解释阻塞。只有原 check 的“明确输入 + 无机器拒绝 + 新观察”路径才能组装合同并调用已有 Rule/cache。规则、绘制采集算法、网络策略、全局 epoch、五分钟期限与默认开关均未改。

诊断生成新的 `diagnosticObservationId` 作为收据身份，**不生成新 candidate，不改变原 observationId，不替换会话 entries，不把旧确认转移给当前新对象**。身份/资源发生变化时同时保留新旧事实和拒绝原因。只有显式 `observe` 才生成新批并使旧候选失效；关会话后不能恢复绑定。诊断不是证据修复或延期入口。

仍不能仅凭全局 epoch 精确区分目标自身变化和无关 DOM 变化；保留新旧局部事实与全局 epoch 供审查，但不据此豁免失效。诊断观察失败时返回未知与实际错误，不猜测有效。

## 已有六场景及实际验证

全部是本地真实 Chromium 和合成 PNG/页面，复用现有图片夹具，不是缺失附件的 Jira 复现。本次收尾只读已有材料，未再启动浏览器、测试或模型。

| 场景 | 保存的实际结果 |
| --- | --- |
| 正常候选，无语义声明 | identity/resource/paint/evidence/machineBinding available；semantics unknown；不能消费。图片请求1、业务写入0，input/textarea/contenteditable 的采集 MutationRecord 为空；无 rule:evaluated 或发现。 |
| 节点被克隆替换、随后关会话 | 原目标 unavailable，当前资源仍 available；新旧 nodeId 不同，拒绝 `target-lost-or-ambiguous` 和 `observation-facts-changed`。原普通 check 仍拒绝；关闭后诊断不写事件或 artifact。 |
| 目标图片请求被拒 | resource unavailable、SHA 无值；一条精确目标 URL 拒绝及全局干预；paint unknown、machineBinding unavailable。没有补抓图片或编造 SHA。 |
| 图片正常，但另一个 POST 被拒 | resource available；两次诊断保留同一个其他拒绝事件 id，直接资源拒绝0、其他拒绝1、影响 unknown。图片请求1、业务写入0；普通 check 仍被全局干预阻塞。该 POST 来自本地夹具脚本，不是诊断触发。 |
| 合同消费及证据失效 | 诊断不影响既有合成保形合同：圆形拉伸夹具的普通 check 仍 fail。随后人为改证据、推进夹具时钟、显式新 observe，分别记录 evidence-changed、evidence-expired、unknown-or-superseded-candidate；未转移旧确认。 |
| CLI 无 review 文件 | 实际子进程执行选定 ID 的 diagnose，再 quit；生成 diagnosis-2.json，machineBinding available，未执行规则，原 observationId 保留；图片请求1、业务写入0。 |

已有定向日志：`directed-1.log` 为 **6 passed / 14 skipped**，3.77秒。最后增加非空 documentId/nodeId 身份保护后，`identity-final.log` 对正常/替换两个场景复验为 **2 passed / 18 skipped**，1.22秒；不是另外两个新场景。`typecheck-final.log` 为最终类型检查无诊断输出；归档文本没有单独编码退出状态。收尾仅更正一条 API 注释，没有功能改动，静态 `git diff --check` 无问题。

六场景原始收据早于最后的身份保护；最终提交包含该保护，两项受影响场景已有复验。未保存首轮执行瞬间完整源码快照，因此不能把本次源码摘要冒充首轮源码现场快照。未重跑旧34项、光标验证、DNS测试、全量验收或公网三页。

[证据与源码身份索引](evidence/image-binding-diagnosis-20261009.json)保存基线、实现提交、四个源码摘要、场景摘要、原始事件关联及83个本地文件的大小/SHA（共519,184 B）。收据引用的61份 artifact 副本已静态逐份核对摘要；证据篡改场景故意保存被改后的文件，其摘要不表示该文件仍是有效 PNG。索引和真实 CLI JSON 样本随 Git，截图、资源、数据库、详细收据与日志仅在本机 `data/experiments/image-diagnosis-20261009-ea23bfc/`，未随 Git 上传。临时路径已清理时应使用索引列出的保留副本。

## 剩余障碍与停止点

本轮已解决“没有语义声明就完全看不到绑定核验”的可观察性缺口；没有据此证明公网可消费率或默认启用条件。

1. **网络影响仍没有因果证据。** 直接图片与其他拒绝现在可分列，但后者影响仍未知；全局干预继续阻塞。此前公网数据只作问题背景，不能当作本实现的公网实测，也不能擅自把遥测从完整性门排除。
2. **动态页面仍受当前快照和绘制范围约束。** 全局 DOM epoch、五分钟期限、节点/资源变化继续使绑定失效；复杂绘制、SVG/动画及超预算仍不能可靠支持。新旧事实可读不等于已经完成变化归因或跨时绑定。
3. **真实保形义务仍须有适用依据。** 没有把 img/alt/文件名升级为语义依据；公开来源、尺寸和许可也不能自动推出场景义务。自动语义绑定尚未验证，不能默认启用。

当前不应为了增加 builtin 数量优先扩展其他强语义依赖项：[D003](rules/UIK-D003.md)仍须证明“当前必要且允许的操作”和滚动路径，[D006](rules/UIK-D006.md)仍须绑定同一请求/对象的可信过程与终态；D004 广义知识同样未完全实现。这里仅记录依赖，不启动新规则开发。

本轮无未完成的诊断实现要求；上述是明确保留的能力边界。只在独立规则分支本地提交，不推送、不合并 main/R0/R1，不改 product-roadmap，不默认启用。完成后停止。
