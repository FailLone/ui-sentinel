# 第二批限定实现：D005 / R005

2026-10-09，分支 `codex/rule-image-proportion`，冻结起点 `35dccaf3657af503a93cad1d6819f4d019651552`，实现提交 `5fa18aa9ed7bedb90ec1a9b5982e0c3605b712fc`。本文件为本批统一交付；[任务锚点](https://github.com/FailLone/ui-sentinel/blob/25409ce/docs/rule-library/rules-batch2-current-task.md)记录最终身份。本轮没有扩大 D004、重访公网或连接 R0/R1。

**两项均已部分实现，默认关闭。** D005 的受支持原生文字子集能自动完成四态检查，不需要逐个手填语义合同；R005 自动提供缺图审查材料，始终不把建议计为已确认缺陷或健康结果。广义知识、原 Jira、完整视觉可读性与实体语义均未因此获得验证。

## 入口与输入

在独立规则工作区使用 Node 24（本轮 24.21.0）和现有 pnpm；替换 URL 为获准访问的页面，输出目录必须不存在：

```sh
pnpm exec tsx scripts/experiments/rules-batch2.ts \
  --url https://example.org/page \
  --out data/rules-batch2-review-001
```

本命令是使用说明，不代表本轮访问过示例地址。默认枚举主文档 light DOM 的前16个原生 button/a[href] 与前16个 img，保存总数和省略数；可重复指定 `--control-selector '#continue'` 或 `--image-selector '#portrait'` 精确选定目标。重复匹配不选第一个，返回 unknown。资源来源仍需通过现有 `--resource-origin https://cdn.example.org` 声明；仅操作者已信任的本地夹具配置精确 `URL_SCAN_TRUSTED_ORIGINS`。URL、策略和来源检查复用既有宿主边界，不新增网络豁免。

一次正常导航（DOMContentLoaded）后立即捕获并评价，不点击、填写、滚动或等待图片“直到成功”；未加载资源可以保持加载中。输出 `batch2.json`、独立 `experiment.db` 和关闭后的 `report.json`。DOM、截图、资源、receipt 与 review artifacts 仍用既有存储。宿主可能因导航超时/策略拒绝而直接失败，这不算规则 fail。无交互审批后台、持久候选导入或跨会话恢复入口。

程序调用方式：

```ts
const host = await openRulesBatch2Experiment({
  entryUrl,
  resourceOrigins: [],
  trustedOrigins: [],
})
try {
  const output = await host.capture() // 可传 { controls: ['#continue'], images: ['#portrait'] }
} finally {
  await host.close()
}
```

宿主见 [rules-batch2-host.ts](../../src/experiments/rules-batch2-host.ts)。部署操作者设置权限，页面和候选内容无权授权来源。关闭 run 使用 cancelled 和 `acceptanceClaim:false`，不制造验收完成证明。

## D005：原生控件文字消失

运行时 ID **`control-text-disappearance` 0.1.0**，注册为默认关闭 builtin。独立入口以本次受信任机器收据创建实例并立即调用既有 Rule/cache；普通执行器目前没有这套实验事实适配器，单独启用空实例只会得到缺事实 unknown，不能默认启用。

| 输入 / 判断 | 自动事实与结论 |
| --- | --- |
| 对象作用依据 | 原生、启用的 button 或带 href 的 a，只有直接文字内容，公开文字是该控件的文字名称。无需人工声明每个普通控件“文字应可见”；不推断它在某业务任务中的优先级。 |
| 唯一与稳定 | selector 匹配数、私有弱引用节点身份、documentId、全局 DOM epoch；截图前后比对完整本批事实。节点被替换、相关或无关 DOM 更新均保守 unknown。 |
| 合成事实 | 解析已计算 RGB/RGBA 前景、文字填充色、目标至根元素的背景层；要求根背景不透明，逐层 source-over 合成透明背景/前景。根画布色不明确不猜白色。 |
| 文字与遮挡 | 单行 Range 范围须在视口和目标内容区域内；检查祖先、所有有界扫描元素的矩形交集及指针命中。pointer-events:none 不免除遮挡。保留字体、样式和不支持原因。 |
| 截图复核 | 复用实际截图，在隔离且拒绝网络的页面中解码该截图，统计文字矩形内背景像素、前景像素及其他像素。没有重绘业务网页或下载源图，也没有视觉模型。 |
| fail | 只有上述支持和证据门全部成立、合成后的文字颜色与背景相同（浮点误差界1e-6），且文字矩形内所有实测像素均为背景色，才报告“该原生控件唯一文字名称无可区分绘制”。不是仅 CSS 同色。 |
| pass | 有限健康见证：支持条件成立，不透明黑字白底或白字黑底，截图确实同时有文字实色像素与背景像素。只证明本窄范围没有文字消失，不声明整体可读性或合规。 |
| not-applicable | 已确认禁用/inert、未呈现、合法模态背景。网络干预、失效等更早的证据问题优先 unknown。 |
| unknown | 其他颜色（包括近白）、缺截图/事实、非唯一/失效目标、复杂绘制、范围外及证据被干预。unknown 不是健康通过。 |

文字和背景必须处于非常有限的平面绘制场景：单行、横排、至少12 CSS px，原生 appearance 已明确 none、无圆角、无复杂字体/动画、无描边/阴影/文字修饰、无变换/滤镜/混合/遮罩/背景图。12px 和1e-6是本实现的支持及计算边界，不是 WCAG 阈值。自定义字体、嵌套图标/文字、aria/title/label 替代命名、伪元素表达、可能逃逸的外部阴影、foreign/SVG 或 shadow/custom 内容等保留 unknown；同页其他元素的阴影也可能使本对象未知。不会为了提高覆盖率把“其他地方看似无关的绘制”静默忽略。

最多扫描1024个元素、64层祖先；超额拒绝。每个文字矩形最多读100,000个截图像素；没有采到像素不判 fail/pass。省略的对象不由已枚举对象结果代表。图片、图表、canvas/SVG、任意文字段落、多主题比较、一般低对比、文字意义正确性均未实现。未引入外部标准或新开源检查依赖，因此没有标准版本/许可新增项，也不作 WCAG 合规声明。

## R005：缺图替代表达审查材料

非 Rule 审查入口 **`image-fallback-review` 0.1.0**，`enabled:false`、`kind:review-material`。不要求 D004 的保形确认，不推断需要头像，不把缺图/空槽/特定占位缺失当成 fail。

自动复用现有 img 加载/自然尺寸、资源采集、imagePaint 和截图事实；补充导航前安装的被动请求记录（最多256条，无新请求），取得 URL、HTTP状态、请求失败/完成，以及 DOM 的 src/srcset/currentSrc/loading。URL对应多次请求时关联不唯一，明确 unknown；字节只在既有采集器已取得时引用，不靠扩展名猜 SHA。

| 状态 | 条件与审查处理 |
| --- | --- |
| loaded | complete 且自然宽高为正；本缺图审查不适用，不是视觉健康 pass。即使图片绘制本身复杂，也不能把“已加载”说成已证明正确显示。 |
| source-absent | src/srcset/currentSrc 均无有效值；提供 review-needed 材料，识别用途仍未知。 |
| http-failed | 元素已 complete、没有自然尺寸，当前资源唯一关联的真实响应状态 ≥400；提供 review-needed。 |
| request-failed / load-or-decode-failed | 保存请求错误，或浏览器 complete/currentSrc/零自然尺寸所证明的加载或解码失败；未获得根因时不把它改称服务器故障。 |
| loading | complete=false；unknown，不套超时阈值或认定缺图缺陷。 |
| lazy-no-request-observed | 视口外 lazy、尚未 complete，导航前被动账本中没有相应请求；unknown。这是“未观察到请求”，不是实现已证明浏览器内部触发原因。 |
| 明确不适用 | 已加载，或 alt为空且明确 role=presentation/none 的公开声明；不从 alt单独推出装饰性。 |

自动保存直接父容器的布局、最多8个相邻节点的公开文字和最多8个兄弟 img 的属性/尺寸。figure 子节点与普通父节点关系分别记录，但关联置信仅 `structural-only`；文字只经 DOM 布局/样式筛选，未证明可读/无遮挡。alt、邻近名字、替代图片和截图都只是可复核材料，**实体身份和等效性始终 unknown**，也不猜默认照片是不是另一个人。没有 native img 的“未提供头像”实体无法自动枚举，当前是具体能力缺口。

review 输出分别包含 `resourceState`、`measurement=observed/incomplete`、`disposition=review-needed/unknown/not-applicable`、关联限制和建议。它不使用规则四态，不把 review-needed 记成 fail；所有输出明确 `ruleEvaluated:false`、`confirmedDefects:0`、`healthyPasses:0`。已有区域有清楚文字可能已足够，通用占位、纯装饰省略都是合理选项；是否充分仍须审阅实际用途和身份依据，不强制一种 fallback。

## 复用、报告及失效边界

- 复用 `launchBrowser`、现有 pinned 网络会话/策略、`observePage(..., caret:'initial')`、图片资源/绘制采集、EvidenceIntegrity、artifact、Rule/cache、事件/发现和 `buildReport`。
- 新增事实只在实验层：有界原生文字绘制事实与截图像素证据、图片被动请求状态、直接父区域材料。本轮未改 shared Rule/RuleResult/PageSnapshot、执行器、采样或完成门；没有必须双分支重构的共享接口。未来接入普通扫描需要显式宿主事实适配，本轮不设计新平台。
- D005 结果通过已有 `rule:evaluated` 进入报告，只有受支持 fail 才提交 `source=rule` 发现。R005 保存为 `image-fallback-review` artifact 和 `review:recorded` event，标准报告的 artifacts/events 可读取；没有新增专用 UI 卡片、缺陷行或规则评估计数。
- 每次 capture 新观察后立即消费，没有导入旧候选的入口。收据绑定 run/page/viewport/screenshot，五分钟过期、上下文不一致均 unknown；证据归属和内容摘要保存以供审查，历史 JSON 不是可恢复的活会话。
- 全局网络干预不豁免，最后评价时仍读取完整性；R005 可以保存当前资源状态，但审查 disposition 变为 unknown。目标之外请求被拒也不自动解释为无影响。状态/证据问题分开记录，不以合成失败代替正常网站状态。

## 本地验证与机器证据

最终运行：**8/8通过，3.27秒**；最终 `pnpm typecheck` 退出0；8个改动源文件格式检查与 `git diff --check` 通过。无模型、无公网、无无关全量。最终代码对应上述实现提交。

| 场景 | 实际结果 |
| --- | --- |
| 原生名称与透明前景 | 白字白底、透明文字均 fail；普通黑字白底按钮与改名链接均 pass；禁用白字为 not-applicable；近白文字 unknown；报告有真实 D005 发现。 |
| 描边/阴影/渐变/伪元素 | 均 unknown，无发现；同色 CSS 没有覆盖替代表达。 |
| 透明背景/覆盖/歧义/过期 | 透明按钮背景正确露出黑色父背景，黑字消失 fail；pointer-events:none 覆盖、图标子元素、重复 ID unknown；复用收据验证过期及跨 run 拒绝。 |
| 404/缺源/已加载/坏字节/装饰 | HTTP404、src缺失、HTTP200坏图片只产生 review-needed；已加载/明确 presentation 不适用；保留文字和兄弟图关联但等效未知。图片真实请求3，无补抓。 |
| 加载中与懒加载 | 一个挂起本地响应为 loading，远离视口的 lazy 无请求为 deferred unknown；只有1次图片请求，没有强制滚动加载。 |
| 网络干预 | 目标图片和另一 POST 被策略拒绝；D005 unknown、R005 unknown，无发现、无业务写入。 |
| 截图期间节点替换 | 测试在真实截图调用前克隆替换两个目标，前后身份/epoch不一致；两项 unknown，无旧事实放行。这是明确注入的合成变更。 |
| CLI 完整链路 | 一次导航/捕获、无语义合同文件；输出 D005 fail、R005独立材料和普通报告；取消式关闭，无验收声明。 |

两个代表截图已本地查看，与消失文字/可见健康文字、缺图区域及相邻材料相符。所有场景是合成的，不宣称复现 Jira 054/333 或 R005 的原附件。

保留失败历史：首次定向4失败/2通过，发现截图解码字符串函数未调用；第二次3失败/3通过，发现伪元素默认背景误判和“健康链接”实际换行。修复实现后将阴影反例分离为独立范围场景，保留外部阴影拒绝；没有放宽它来取得成功。七项通过后补节点替换，最后对收紧的伪元素/绘制保护完整执行八项均通过。初始 TypeScript 类型错误也已修复。失败日志未覆盖。

[机器证据索引](evidence/rules-batch2-20261009.json)含源码 SHA、逐场景结果、原始收据、报告、日志及最终52个本地文件（586,991 B）的摘要。[真实 CLI 样本](evidence/rules-batch2-cli-sample-20261009.json)随 Git；其会话已关闭。截图、数据库、资源与大收据仅保留于本机 `data/experiments/rules-batch2-20261009-35dccaf/final-guards/`，不随 Git 分发。之前失败/中间输出保留在同级目录，不能混作最终证据。

复现本批定向验证（本说明不会自动执行）：

```sh
URL_SCAN_DNS_MODE=system pnpm exec vitest run src/experiments/rules-batch2.test.ts
pnpm typecheck
```

## 剩余限制与启用结论

D005 首批覆盖的是精确消失及非常有限的健康见证，真实站点的圆角、伪元素、webfont、普通多色低对比等经常超出范围。R005 还不能识别无 img 的业务实体，也不能判定替代照片/文字是否等效。网络干预和 DOM 不稳定继续造成 unknown；本轮没有公网可用率证据。

因此两项均**不具备默认启用条件**。下一步是否拓展应另行决定，本轮到代码/文档本地提交为止，不推送、不合并 main/R0/R1、不改 product-roadmap、不自动开始下一轮。

## 后续产品接入

本文件保留第二批实验历史。D005/R005 后续已在独立候选中接入普通 ui-scan 并默认参与，用户无需此实验CLI；算法边界不变。最新入口、默认范围、验证与提交见 [普通网址扫描接入](rules-scan-integration.md)。
