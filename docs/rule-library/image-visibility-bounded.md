# 大文档图片可见性：共享、有界的完整几何遍历

2026-10-09（Asia/Shanghai）。**已实现可用的限定版本：普通节点总数超过600，不再直接使所有图片可见性未测。** 简单 HTML 文档中的视口内静态 PNG/JPEG，在完整遍历、绘制边界和其他证据条件均满足时，可取得可消费机器事实；不支持任意大文档或复杂绘制。

基线 `c12b5b32a9eae0fe5b884cb9905921c72ef48038`；实现提交 **`abb27ddf435cca8090b2e44511a035ff53bb0b11`**。工作区仍为 `codex/rule-image-proportion`。保留 DNS 合并历史和 [caret 修复](image-caret-control.md)，没有其他分支合入。运行时 `image-shape-distortion` 仍为0.1.0、默认关闭；本轮是采集器能力变化，不改语义义务或比例算法。

本轮仅用确定性本地合成页面；没有重访公网、调用模型或付费接口。[上轮三页58个目标、0 facts-ready](image-binding-public-doh-validation.md)保持历史结果，不能据本轮本地 pass 推算公网准确率或就绪数量。证据见[小型索引](evidence/image-visibility-bounded-20261009.json)。

## 旧行为与新算法

修改前在现有 `observePage(...,{caret:'initial'})` 路径观察一个1207元素文档：图片已解码、原资源可核实、目标稳定、无复杂效果，唯一 unsupported 为 `large-document-visibility-unmeasured`。该结果在改代码前保存，复用已有 PNG/HTML 合成夹具，没有建立新执行器或大型靶场。

旧实现对每个 img 重复 `querySelectorAll('*')`，超过600直接未测。新实现 `bounded-layers-1`：

1. 先解析并并发等待本批目标解码，取得目标矩形；沿用原节点身份、当前资源和 epoch 机制。
2. 用一次共享 TreeWalker 完整遍历当前主文档元素，每个访问元素在此扫描中读取一次 border-box 矩形。只保留与至少一个目标矩形相交的可见层，不依据 pointer-events 过滤，也不按DOM前段抽样。
3. 对每个目标排除它自身和祖先，再检查保留层。任何非祖先相交层仍为 `overlapping-paint-surface`，即便它可能画在图片后面，也不猜测遮挡顺序。中心命中只保留为额外拒绝条件，不能替代矩形完整扫描。
4. 每256个元素让出执行；扫描结束刷新 mutation 回调。扫描期间任何 DOM 变化均记录 `visibility-dom-changed`，不重启到稳定、不重置 epoch、不忽略无关更新。目标矩形变化或节点断开另记 `visibility-target-changed`。
5. 原有加载、object-fit、二维变换、祖先裁切/透明/效果、部分视口、生成内容、证据/资源校验等继续适用。before/after 两次观察比较和全局网络 intervened 保持。

`visibilityScan` 新增6个固定诊断字段：version、complete、visited、rectangleReads、candidates、intersectionChecks。**complete 只表示共享层遍历完整且没有全局未测原因，不等于目标无遮挡、绘制全部支持或规则 pass。** 例如扫描完整但存在相交层，目标仍拒绝。

诊断计数在同一批各目标中重复引用，不能相加当作重复遍历。候选批可能观察两个目标，消费时只观察一个；因此消费身份比较只排除新加的扫描工作量诊断，原有资源 SHA、node/document、epoch、绘制事实、stable、unsupported 等继续精确核对。没有忽略任何原有绑定字段或放宽全局失效策略。

## 绘制范围与有界保证

除原有边界外，发现无法由普通元素框界定的潜在绘制时保守未测：包括生成伪元素（也含空 content 盒）、影子树/自定义元素、SVG等非HTML命名空间、iframe/object/embed、阴影/滤镜/outline/list marker、非目标祖先层的可见溢出、运行中动画等。不能因宿主在视口外或零尺寸，就忽略其可能伸入目标的内容。

目标祖先继续由原有裁切/变换/效果检查处理；已测子元素形成的溢出不被额外当成未知前景层，避免破坏原先支持的祖先/图片缩放相抵消。此处沿用现有普通 border-box 绘制模型，**不是逐像素完整合成证明**；复杂绘制明确拒绝，不对被拒页面作无遮挡结论。

| 范围 | 上界 / 超限行为 |
| --- | --- |
| 一次事实调用目标数 | 最多32；输入超过32时只返回前32个，全部带 `visibility-target-budget-exceeded`，未返回目标缺测，不能作为成功截断 |
| selector | 最多1000字符；过长返回短拒绝记录 `visibility-selector-budget-exceeded`，不执行该选择器 |
| 共享元素遍历 | 最多4096个矩形测量；最多多探测1个后继以判断是否还有未遍历元素，超限 `visibility-node-budget-exceeded` |
| 相交层缓存 | 最多256层；遇到第257层即 `visibility-candidate-budget-exceeded`，不使用前256层证明无遮挡 |
| 目标矩形相交比较 | 共享扫描最多4096×32=131072次；逐目标相交层检查最多32×256=8192次 |
| 时间 | 单次共享扫描250ms合作式期限，逐元素检查并在最终回调后复查；超限 `visibility-time-budget-exceeded`。每256元素让出一次执行 |
| 祖先链 | 每目标最多128层；超过则 `image-ancestor-budget-exceeded`。32目标最多4096层检查；准备阶段建立祖先集合也受同一上界约束 |
| 返回体 | 最多32条事实，每条序列化JSON不超过70000个UTF-16单元；超额返回无资源身份的 `image-fact-output-budget-exceeded`，绝不把截短URL当作原资源。事实数组总计约224万单元以内（UTF-8上界约6.8MB，含结构余量）；不返回全节点列表 |

计数边界针对可见性扫描。目标定位的原生 querySelectorAll、样式/布局/getAnimations、一次原生调用中的工作、截图和已有资源证据保存不可能被JS期限强制中断；**250ms不是浏览器渲染器硬墙钟上限，也不保证整个 observe 在250ms内结束**。每次 observe 原有before/after各调用一次事实采集，因此最多两次共享扫描；每目标初始/最终矩形读取另计，不包含在共享 rectangleReads 内。资源采集4MiB/32 URL等原限制保持。返回体上限不意味着大输入、浏览器DOM或序列化临时内存同样有界。

## 实际定向结果

使用 `src/execution/image-visibility.test.ts` 的18个新场景，复用原 PNG/HTML 夹具和真实 Chromium 观察/图片实验路径；JPEG由既有同类canvas方式生成本地数据资源。不同规模固定，不循环压测，不择优报告时间。

| 固定页面 | 实际元素数 | 单次共享遍历/矩形读取 | 相交缓存 / 比较次数 | 一次observe或候选observe耗时 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 小文档 PNG | 107 | 107 / 107 | 4 / 105 | 22.79ms | 稳定，无unsupported |
| 大文档 PNG | 1207 | 1207 / 1207 | 4 / 1205 | 31.05ms | 稳定，无unsupported；旧实现同规模因600限制未测 |
| 大文档 PNG | 3007 | 3007 / 3007 | 4 / 3005 | 126.31ms | 稳定，无unsupported |
| 大文档 PNG+JPEG | 1208 | **共享1208 / 1208** | 5 / 2408 | 45.67ms | 两个facts-ready；只消费PNG合成合同得到pass |
| 4500 filler，遮盖在未遍历后段 | 超预算 | 4096 / 4096 | 4 / 4094 | 173.93ms | node-budget-exceeded；没有因未见后段遮盖而通过 |
| 300个相交层 | 途中终止 | 1460 / 1460 | 256 / 1458 | 46.57ms | candidate-budget-exceeded及相交层拒绝 |

时间为本次真实测量（含截图及保存），不作跨硬件性能承诺。表中“单次共享遍历”是一次事实读取得到的诊断，observe的两次读取均会扫描。旧基线同规模一次observe为33.46ms，但旧版跳过了可见性测量，不能将时间差当作性能胜负。

其余反例结果：

- 大文档早段普通遮盖、早段pointer-events:none遮盖、后段pointer-events:none遮盖均拒绝。遮盖只占图片角落，中心仍命中img，证明未靠中心命中放行。
- 零尺寸、视口外宿主的固定伪元素遮盖、影子树绘制拒绝；祖先裁切、3D变换、mask保留原有拒绝原因。
- 确定性时钟故障注入每次读数增加300ms：访问0节点，返回time-budget-exceeded。该例只验证期限分支，不将其33ms实际墙钟误报为真实超时。
- 在几何读取期间由夹具改变body属性：返回visibility-dom-changed、stable=false，合成规则结果unknown。真实变化没有被批次让出或新诊断字段隐藏。
- 超额目标、过长selector、超大事实返回、超过128祖先层均明确未测；超大源身份未以截短版本输出。

共 **34个不同定向场景最终通过**：新场景18、复用小文档边界11、caret回归5。没有运行DNS62、全量图片套件、R0/R1或公网三页。

```sh
pnpm exec vitest run src/execution/image-visibility.test.ts
pnpm exec vitest run src/execution/image-paint.test.ts \
  -t 'intrinsic ratio|contain letterboxing|cover cropping|ancestor unequal|ancestor cancels|3D transform|clipped ancestor|refuses covered|same-looking replaced|transient DOM|retains exact source'
pnpm exec vitest run src/execution/image-visibility.test.ts src/experiments/image-bindings.test.ts \
  -t 'caret|mutation during'
pnpm typecheck
```

实际过程保留失败：首次类型检查发现新测试缺少既有PageSnapshot类型断言，已修正；首次11项小文档回归有1项祖先缩放相抵消被新溢出守卫过度拒绝，收窄该新增守卫后11/11通过，没有改预期或旧变换算法。新增场景首次16项通过，补充输出/影子树/深度边界后18/18通过；最后强化变化原因记录并复核该场景与caret，共6/6通过。日志均在索引，没有通过无修改重跑碰运气。最终类型、四个源码/测试文件格式和diff检查通过。

caret控制中默认截图仍会产生原样式记录，图片实验initial路径无该自扰；真实目标/无关DOM变化继续失效。PNG/JPEG双目标消费只使用既有合成圆形标记的明确保形合同，自动候选确认字段仍留空，不构造公网语义依据或人工审批。

## 剩余障碍与交付

本轮只解决预算内简单文档的机器测量通路。复杂绘制可能比原矩形筛选更保守；例如只要存在未界定的伪元素、影子树或SVG层，本版本就可能使全批未测，不能声称能覆盖上轮三页。这是明确支持边界，后续不能直接删掉未知项换取就绪。

全局网络intervened、全局DOM变化失效、缺少无语义声明的独立绑定核验入口、保形依据仍全部保留。下一步应先明确具体目标证据与网络干预的关系，保持来源拒绝和审计；再考虑独立的只读绑定诊断。语义绑定实验仍需真实依据和可消费样本。**没有默认启用条件，本地合成pass不等于公网规则准确率。**

随Git交付本报告、测试、实现和[索引](evidence/image-visibility-bounded-20261009.json)。本地材料位于 `data/experiments/image-visibility-20261009-c12b5b3/`：修改前基线、最终18场景的完整收据与截图/资源副本、首次和最终日志。最终场景artifacts副本共329,937B；原始收据/日志等另计。索引保留路径、大小、SHA-256和关键事实，源码身份固定到实现提交。**原始JSON、PNG和数据库等大文件未随Git，本机可访问不等于其他机器已经取得。**

没有修改维护者Roadmap、R0采样/执行/完成门、网络权限或规则默认开关；没有创建/消息其他Agent。本轮仅提交当前分支，不推送、不合并其他分支，交付后停止。
