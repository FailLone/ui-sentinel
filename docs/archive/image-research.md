# 图片采集历史研究

这些研究解释图片实验的边界，不是当前公网可靠性承诺。当前使用见[图片候选](../rule-library/image-binding-experiment.md)和[可见性测量](../rule-library/image-visibility-bounded.md)。

- 系统 DNS 下的公开页面访问失败不能归为 UI 缺陷。后续 DoH 三页观察得到58个目标、0个 facts-ready；不因后续本地修复改写该结果。[系统DNS记录](../rule-library/evidence/image-bindings-public-20261008.json)、[DoH记录](../rule-library/evidence/image-bindings-public-doh-20261009.json)、[当前公网索引](../rule-library/evidence/image-public-current-20261009.json)。
- 截图隐藏 caret 会临时修改编辑控件 style，触发观察 epoch。独立本地对照中，默认截图产生6条属性变化、epoch从0到2；仅改为 `caret:initial` 后为0条且epoch不变。图片实验显式采用该选项，默认观察行为不变；不能推断历史公网每次变化都由截图引起。[因果对照](../rule-library/evidence/image-caret-control-20261009.json)。
- 普通节点超过600曾导致图片可见性全未测；共享有界几何遍历解决有限静态文档范围。完整遍历不代表无遮挡、支持全部绘制或 rule pass。[有界遍历证据](../rule-library/evidence/image-visibility-bounded-20261009.json)。
- 自动绑定材料只减少页面、资源和定位事实的手填；保形语义依据仍需独立提供，事实就绪不等于缺陷。诊断不能将外观比例当作义务。[绑定诊断证据](../rule-library/evidence/image-binding-diagnosis-20261009.json)。

原始数据库、图片、请求和日志不随 Git 分发。按索引中的批次/文件摘要向原材料保管者索取，当前没有统一取得渠道。旧全文保留在重整前提交，见[历史索引](README.md)。
