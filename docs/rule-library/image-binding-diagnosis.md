# 无语义声明的只读绑定诊断

**已能在不提供保形声明的情况下诊断当前候选绑定。** `diagnose` 返回分维度机器事实、原始证据和拒绝原因，不产生合同、审批、RuleResult 或新的 facts-ready 状态。普通 `check` 仍要求真实语义声明并重新执行原有机器门。D004 运行时仍为 `image-shape-distortion` 0.1.0、默认关闭；无新绘制能力或普通扫描接线。

## 使用现有实验入口

在仓库根目录使用支持的 Node；将 URL 替换为获准观察的页面，输出目录须尚不存在。下面是操作说明，不表示本轮又访问了该示例地址。

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


## 维护与验证

当前默认状态见[知识库首页](README.md)，异常与健康反例见[靶场](../counterexample-arena.md)。历史原始 JSON 保存在[证据目录](evidence)，不将旧结果当作新构建重跑。
