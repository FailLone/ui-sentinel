# 图片候选绑定材料：独立实验入口

2026-10-08 第二轮；实验材料版本 `image-bindings-1`。检查器仍为 `image-shape-distortion` **0.1.0，默认关闭**；未修改它的绘制范围、四态语义或默认开关。未连接 R1、未修改 R0 分支、采样、执行契约、完成门或评分器。本轮只新增实验层，复用第一轮接口，无共用接口变更。

## 人工输入发生了什么变化

| 内容 | 第一轮手工 ImageShapeContract | 本轮候选材料 |
| --- | --- | --- |
| 合同 ID、页面完整 URL、当前视口 | 手填 | 自动生成 ID，采集实际页面/视口 |
| 目标 selector 与唯一性 | 手填并自行核对 | 自动提供现有 ID 或当前结构路径、匹配数、当前节点身份；重复 ID 明确标为歧义，不选第一个 |
| 当前资源 URL、SHA-256 | 手工确定 | 复用 currentSrc 和浏览器已取得的静态 PNG/JPEG 字节；未取得则标缺失，不额外 fetch |
| 截图、snapshot、源字节、观察时间 | 手工整理关联 | 自动保存 artifacts、候选观察 ID、证据关联及五分钟过期时间 |
| 选择哪个图片 | 人工定位 | 仍由人选择具体 candidateId；同名图片分别列出，不凭 alt/名称选择 |
| intent、依据位置、依据正文、confirmedBy | 人工提供 | **仍须明确提供**；自动材料全部留 null，不能从 img、alt、文件名或比例疑点补出义务 |

`facts-ready` 只表示自动字段和本次证据可供审阅；不是保形义务、规则 pass、审批通过或启用。所有候选均列出 `missingFields`，其中包括四个语义字段；`facts-incomplete` 另列事实缺口与原因，不能靠手填机器事实消除。`hints.alt` 仅用于人工辨认，不参与适用性判定。

## 实验入口

在独立规则工作区、Node 24 下运行，输出目录必须是新目录：

```sh
pnpm exec tsx scripts/experiments/image-bindings.ts \
  --url https://example.org/page \
  --out data/image-binding-review-001 \
  --interactive
```

站点确有依赖时可重复提供 `--resource-origin https://cdn.example.org`；沿用现有网络策略。受信任的本地夹具仍由操作者的 `URL_SCAN_TRUSTED_ORIGINS` 环境配置指定，页面或候选材料不能授权来源。入口只允许 HTTP(S)，单页面、无模型、无点击/填写/滚动操作，不提供绕过边界的下载方式。

自动写入：

- `candidates-1.json`：完整候选，程序事实位于 `measured`，待确认项位于 `pending`，含 `missingFields/issues`。
- `review-template.json`：观察 ID 已填，candidateId 和语义内容为 null。不会选第一张图，也不会自动填写确认人。
- 独立 `experiment.db`；屏幕、snapshot、原资源及候选/审阅凭据沿用当前工作区 `data/artifacts/<runId>/`。控制台打印其位置。不会使用默认或 R0 数据库。

从候选里选择目标，把模板复制为 `review.json`，仅补：

```json
{
  "candidateId": "复制明确选定的候选 ID",
  "observationId": "保留模板的观察 ID",
  "intent": "preserve",
  "basis": {
    "reference": "实际适用的设计要求位置及版本",
    "statement": "该资源在当前场景应保留形状的明确要求",
    "confirmedBy": "实际作出本次确认的人"
  }
}
```

模板文字不能冒充真实依据；上例不是已批准合同。`intent` 也可为明确授权的 `intentional-distortion`。不允许在 review 中覆盖资源、SHA、selector 等机器事实；多余字段拒绝消费。

交互命令：

```text
check data/image-binding-review-001/review.json
observe
quit
```

`check` 输出 `check-N.json` 和已有 `RuleResult`，并保存审阅/绑定凭据、`rule:evaluated` 及有证据的 `source=rule` 发现，可经现有 `buildReport` 读取。`observe` 重新采集并使所有先前候选失效，生成新的观察 ID 和模板；不能把旧 review 的 ID 搬到新对象。`quit` 关闭实验，不能复活其中的确认。实验 owner 以 cancelled 结束并显式记录 `acceptanceClaim:false`，不生成 R0 完成证明。

不加 `--interactive` 只导出本次材料然后关闭会话；该文件可用于复核，但不能在后续新会话中直接作为活绑定。API 用户可组合 [createImageBindingExperiment](../../src/experiments/image-bindings.ts)，由已有宿主在导航前安装正常网络边界；也可使用 [openImageBindingExperiment](../../src/experiments/image-binding-host.ts) 的同款独立只读宿主。

## 怎样防止误绑定和旧确认复用

1. 主文档 light DOM 的 native img 自动枚举，最多 32 个；记录总数和省略数。现有采集器仍负责加载/解码、绘制条件和资源字节，不新增 SVG、动画、shadow/iframe 绘制能力。
2. 为每个发现保留实际 ElementHandle。现有 ID 不唯一时保留歧义，不从重复对象中取第一个；没有 ID 时提供当前结构路径，但**不能仅凭路径相同认为对象相同**。
3. 候选绑定至当前 run、独立 observationId、document/node 身份、资源 URL/hash、视口、绘制事实和 DOM 变更 epoch。导出材料与内部事实分离；编辑导出文件不会重写程序事实。
4. 消费前验证候选属于当前会话/最新批次、未过期，证据文件仍归属该 run 且内容摘要未变；然后通过相同观察器重新采集，核对原节点和全部事实。页面、视口、布局/DOM epoch、资源或节点变化、丢失、歧义，均 unknown，不生成检查合同。
5. 同一 URL 返回不同字节时，沿用现有资源收集器的保守拒绝，不复用旧 SHA。该会话中若已经无法证明资源身份，需要新浏览器实验重新采集，而不是修改旧确认。
6. 只有当前机器事实与明确提供的依据都有效，才临时组装 `ImageShapeContract`，消费同一新观察调用现有检查器。不会注册 enabled 规则；不导出可跳过会话校验的“自动已批准合同”。结果中留存合同只是历史依据，不能作为未来会话的有效绑定。
7. 网络干预沿用既有 EvidenceIntegrity，存在拒绝/关页等干预时不能生成有效绑定。关闭会话后调用 check 仅返回 unknown，不再往已关闭 run 添加证据或评估事件。

这是一种保守的快照绑定：即使无关 DOM 变化也可能要求重新观察。它不声称实现跨刷新、跨 run 的长期语义目标身份，也不保证持续动效页面可以完成绑定。

## 接口边界和剩余限制

本轮 **没有修改任何既有共享 TypeScript 文件、RunSpec、PageSnapshot、Rule、执行器、网络策略或规则采集接口**。新增模块仅组合第一轮已有的 `observePage(..., imageSelectors)`、资源监听、Artifact 存储、完整性检查和 Rule.evaluate/缓存。既有缓存策略与检查器 revision 不变。以后若正式接入常规 Agent 工具，需要一个独立候选导出/消费入口、宿主 run/观察身份及完整性读取句柄；当前不在 R0/R1 接口里添加这些内容，也不双线重构。

- 自动化解决的是填写和证据绑定成本，**没有识别图片应保形的设计义务**。人为提供的依据仍是调用方声明，不是本系统完成独立审批的证明。
- 支持范围仍受 [第一轮绘制能力](image-shape-candidate.md) 约束：静态 PNG/JPEG、默认 object-position、已支持的 object-fit/二维变换等。未加载、缺响应、复杂绘制与超额对象保留缺口；不通过额外 fetch 或滚动强制取得图片。
- 本入口固定使用正常默认视口，页面资源依赖需显式声明；尚无自动多断点、登录、导航探索、审批后台、跨会话确认恢复。
- 资源监听必须在正常导航前安装；晚安装且未取得响应时保留 `resourceSha256` 缺失，不补抓。五分钟、重新观察、页面/DOM变化和关闭会话都会使旧材料失效。
- 默认启用条件仍不具备；规则和实验入口都不会自动加入 R0/R1 执行。

## 免费验证

[新增浏览器/命令行场景](../../src/experiments/image-bindings.test.ts) 使用已有 [合成 PNG 夹具](../../evaluation/fixtures/image-shape.ts)，不是原 Jira 图片。验证自动事实与留空依据、同名/歧义定位、真实有效绑定、节点替换、URL/同 URL 字节变化、证据过期/被改/丢失、视口/布局/文档变化、截断计数、网络拒绝与独立 CLI 全链路。资源请求计数断言没有为了哈希再抓一次图片。

```sh
pnpm exec vitest run src/experiments/image-bindings.test.ts src/execution/image-paint.test.ts
pnpm typecheck
pnpm exec biome format src/experiments scripts/experiments
```

2026-10-08 实际结果：新增场景 **9/9**，复用第一轮绘制测试 **31/31**，合计 **40/40** 通过；类型检查、4 个新增 TypeScript 文件的 Biome 格式检查和 `git diff --check` 通过。未调用模型，未运行无关全量验收。

本地额外保留了实际生成的合成输出 `data/experiments/image-bindings-round2/candidates.json` 与 `manifest.json`（未纳入 Git）；单张静态 PNG 的机器字段均已自动取得，缺项恰为 intent 和 basis 的三个字段，图片只请求一次。会话已关闭，输出是历史样本，不能作为活绑定；确认人仍为 null，没有生成语义判错或原 Jira 复现声明。
