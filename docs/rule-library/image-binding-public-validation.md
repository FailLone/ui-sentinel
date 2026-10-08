# 图片候选入口：公开页面可用性验证

2026-10-08；基于独立规则分支 `codex/rule-image-proportion` 的 `330c5ba`。本轮仅记录真实访问结果，不修改规则、绘制算法、绑定策略、共享接口或 R0/R1。**建议先解决实验环境的公网地址解析障碍，尚无证据支持开展自动语义绑定实验。**

## 访问前固定的样本与协议

| 页面 | 选择理由与计划类别 | 访问后类别核实 |
| --- | --- | --- |
| [Commons PNG 文件说明页](https://commons.wikimedia.org/wiki/File:PNG_transparency_demonstration_1.png) | 简单静态图片；预期含 PNG 主图及公开来源信息 | 导航失败，未核实 |
| [MDN Responsive images](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images) | 响应式或懒加载图片；预期教程包含相应示例或插图 | 导航失败，未核实，不能将教程主题当作实际图片属性 |
| [GitHub CPython 首页](https://github.com/python/cpython) | 异步 DOM 更新；预期仓库信息由客户端异步加载，含头像 | 导航失败，未观察到异步更新 |

第三项在任何访问前从 Hacker News 更正为 GitHub，随后固定清单，不因结果替换。访问前协议保存于 `data/experiments/image-bindings-public-20261008/protocol.json`，其内容、实际事件和失败后的 DNS 诊断一并保存在[持久证据](evidence/image-bindings-public-20261008.json)中。

直接调用文档公开的现有 `openImageBindingExperiment` 宿主。仅增加未纳入产品的本地计时/序列化记录脚本，未增加接口。固定默认视口 1280×768、每页单次导航，成功后最多两次 observe，间隔 5 秒；任一步失败即停止该页，不重试。三页各使用独立数据库。`trustedOrigins=[]`；资源源预先限定为 Commons 的 upload/meta.wikimedia.org、MDN 的 mdn.github.io/interactive-examples.mdn.mozilla.net、GitHub 的 github.githubassets.com/avatars.githubusercontent.com/user-images.githubusercontent.com/raw.githubusercontent.com/camo.githubusercontent.com（均 HTTPS），同源权限沿用宿主策略。

没有点击、填写、滚动、网站注入修改、额外获取图片、付费模型调用或测试重跑。观察器的内部节点/epoch 跟踪沿用现有实现，没有为本轮增添探针。主文档未加载，实际未进入观察阶段。

## 逐页统计

“未测”不等于 0：没有生成候选，无法推断网站图片总量、支持比例或缺口数量。枚举与支持数原计划只覆盖主文档 light DOM，最多 32 张，省略部分不作支持推断。

| 页面 | 导航尝试 / 完成观察 | 总图片 / 枚举 / 省略 | 支持范围内 / 机器事实齐全 | 图片事实缺口原因及数量 | 入口失败耗时 | 证据 artifacts / 事件导出 |
| --- | --- | --- | --- | --- | --- | --- |
| Commons | 1 / 0 | 未测 / 未测 / 未测 | 未测 / 未测 | 未进入采集，数量未测；主文档拒绝 1 次 | 224 ms | 0 B / 1,134 B |
| MDN | 1 / 0 | 未测 / 未测 / 未测 | 未测 / 未测 | 未进入采集，数量未测；主文档拒绝 1 次 | 211 ms | 0 B / 1,132 B |
| GitHub | 1 / 0 | 未测 / 未测 / 未测 | 未测 / 未测 | 未进入采集，数量未测；主文档拒绝 1 次 | 233 ms | 0 B / 1,091 B |

耗时由宿主调用前至失败清理完成的单调时钟测量，不是图片采集耗时；实际采集耗时未测。每页数据库各 73,728 B，另计，不重复算作 screenshot/snapshot/资源证据。三个 run 均 cancelled，`acceptanceClaim:false`；没有 screenshot、snapshot、资源字节、候选批次、规则评估或发现。模型调用和动作数均为 0。没有把访问失败记成图片规则 fail。

实际访问时间为北京时间 22:21:03—22:21:16：

- Commons：`run-1c50db1b-e636-41a1-8cc8-48954faa702c`
- MDN：`run-a2ab879c-5db1-4fd0-ad21-ec8b018d6589`
- GitHub：`run-1b699dcd-3e72-47ab-a1ab-8f221db691e6`

每页唯一的 `network:decision` 均为主文档 GET、`allow:false`、`reasonCode:private-address`；Playwright 返回 `page.goto: net::ERR_BLOCKED_BY_CLIENT`。这是本地网络边界拒绝，不是网站 HTTP 403 或网站不存在，也不是 CDN 配置缺失。

## 失效归因与消费限制

三页均没有候选，故采集到消费期间的目标变化、资源替换、无关 DOM 变化、目标歧义及证据过期数量均**未测**；不能报告“0 次失效”或“有效绑定”。

代码核对显示：现有 `check` 先要求完整 intent、basis.reference、basis.statement、basis.confirmedBy。缺失时返回 `missing-or-invalid-explicit-basis`，不会验证活绑定。因此本轮不调用 check、不填写占位确认；三页全部标为 **未执行语义检查**。入口目前不能在缺少语义声明时独立验证绑定。

另外，现有 `paintIdentity` 包含全局 mutationEpoch；即使目标自身绘制事实不变，无关 DOM 更新也可能造成 `observation-facts-changed`。入口没有分别归因的消费结果。本轮未采到双快照，不能声称这个问题在选中页面上实际出现。重新 observe 会使上一批材料整体失效，也不能将两批事实对比冒充第一次候选的消费验证。

## 人工还要提供什么

即使自动字段完备，仍需选择具体 candidateId，提供 intent（preserve 或 intentional-distortion）、适用于该资源/页面/视口的依据位置和正文，以及真实声明者。自动取得的 img、alt、文件名、自然尺寸、SHA 或比例差异均不能代替保形义务。

| 页面 | 公开资料可能帮助什么 | 本轮取得可靠保形依据的情况 |
| --- | --- | --- |
| Commons | 文件说明可能帮助确认来源、尺寸、许可 | 未取得页面内容；这些资料本身也不等于该页面绘制必须保形的要求，取得难易未验证 |
| MDN | 教程可能给出示例的预期绘制方式 | 未取得页面内容；需对应到当前具体示例资源、DOM 和视口，不能套用一般教程说明，取得难易未验证 |
| GitHub | 仓库资料或品牌规范可能解释部分素材用途 | 未取得页面内容；头像与每一张图的义务不能由仓库名推断，取得难易未验证 |

没有可靠依据或声明者被填写，也没有冒称人工审批。

## 主要障碍与最小改进建议

**首要障碍是当前实验进程的 DNS 结果与既有公网地址边界不兼容，3/3 个固定页面在首个文档请求即被拒绝。** 失败后仅做本地 `node:dns/promises.lookup` 诊断，没有 HTTP 请求或浏览器重试：三个主机分别解析为 `198.18.228.47`、`198.18.228.52`、`198.18.1.109`。这些结果属于代码明确拒绝的 198.18/19 地址段，与代理 fake-IP 环境相符；未核对具体代理产品，且日志未保留请求当时的解析地址，因此不将事后地址冒充请求时证据。

最小改进是准备一个系统解析能返回真实公网地址、且这些地址可由当前固定地址传输正常连接的实验运行环境，例如对实验进程采用兼容的真实 IP/DNS 模式。保留现有私网拒绝；不把公共域名加入本地夹具信任例外，不修改 R0 网络接口，不另行抓图。本轮只记录建议，没有修改 DNS/代理配置、放宽策略或再访问页面。

恢复访问之后，缺少“无需语义声明的绑定有效性核验”仍是已知接口限制，但尚不能根据本轮数据判断它与 DOM 变化会造成多少实际损耗。该需求留待另轮决策，本轮不实现。

本轮仅完成既定清单的一次性访问实验并记录阻塞结果，**未完成图片类别、自动采集覆盖率和实时绑定可用性的验证**。规则继续默认关闭，不具备据此启用或进入自动语义绑定实验的条件；未合并、未推送。到此停止。
