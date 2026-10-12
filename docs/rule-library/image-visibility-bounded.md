# 大文档图片可见性：共享、有界的完整几何遍历

2026-10-09（Asia/Shanghai）。**已实现可用的限定版本：普通节点总数超过600，不再直接使所有图片可见性未测。** 简单 HTML 文档中的视口内静态 PNG/JPEG，在完整遍历、绘制边界和其他证据条件均满足时，可取得可消费机器事实；不支持任意大文档或复杂绘制。


本轮仅用确定性本地合成页面；没有重访公网、调用模型或付费接口。[上轮三页58个目标、0 facts-ready](../archive/image-research.md)保持历史结果，不能据本轮本地 pass 推算公网准确率或就绪数量。证据见[小型索引](evidence/image-visibility-bounded-20261009.json)。

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


## 维护与验证

当前默认状态见[知识库首页](README.md)，异常与健康反例见[靶场](../counterexample-arena.md)。历史原始 JSON 保存在[证据目录](evidence/)，不将旧结果当作新构建重跑。
