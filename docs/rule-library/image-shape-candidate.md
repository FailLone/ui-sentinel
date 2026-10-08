# UIK-D004 限定 builtin：合同绑定的静态栅格内容变形

2026-10-08；运行时 `image-shape-distortion` **0.1.0**，默认关闭，未批准默认启用。该实现仅覆盖 UIK-D004 的一个子集，不表示整条广义知识、原 Jira 028 或二维码可用性已验证。

## 已建立的适用依据

“它是 img”“alt 包含 logo”“元素框与自然比例不同”均不能建立保形义务。首版由调用方在代码配置中提供 `ImageShapeContract`：页面完整 URL、唯一 CSS 定位、当前资源 URL、原始字节 SHA-256、精确视口、保形/授权变形意图，以及依据文档位置、依据正文和确认者。定位使用真实网站已有结构或属性，不要求网站添加任何测试属性。名称或位置改变不改变合同；匹配到多个节点、节点消失、资源变体变化都不选第一个继续。

依据是调用方明确提供的设计事实，不能由模型从名称补写；`confirmedBy` 是声明来源，不是本系统执行过审批的证明。原图本身是否正确、是否包含需保形的有效图形、该设计是否适用，仍须调用方审查。报告保留完整合同供复核，不把运行时几何测量当作语义判断。

当前可通过已有 `registerRule` 入口在独立实验宿主中注册配置后的规则。工厂始终返回 `enabled: false`，空合同执行只返回 unknown；公共产品 UI/学习规则批准接口尚不支持该合同的录入和审核。示例（文件/尺寸/摘要必须来自真实要求，不能复制占位值）：

```ts
import { registerRule } from '../../src/rules/engine.ts'
import { createImageShapeDistortionRule } from '../../src/rules/builtin/image-shape-distortion.ts'

const candidate = createImageShapeDistortionRule([reviewedContract])
// 仅在明确授权的独立候选实验中启用；不写进 registerBuiltinRules 的默认值。
registerRule({ ...candidate, enabled: true })
// 继续使用正常执行器；规则本身只读取 snapshot，不导航、不点击、不写页面。
```

自动语义保形绑定尚未交付。这是一个明确能力缺口，不以默认所有图片保形替代。

## 测量与判定

- 主文档内唯一原生 `HTMLImageElement`，资源已 complete、decode 成功且 naturalWidth/naturalHeight 有效。使用浏览器当前 `currentSrc`，不拿 src 候选列表或 HTML width/height 当作源比例。
- 资源仅支持已获得原始字节的静态 PNG/JPEG。HTTP 图片读取本次浏览器已发生的响应；data URL 支持 base64 PNG/JPEG。不发额外 fetch，不绕过网络执行边界。按文件签名检查格式、排除 APNG；每页最多 32 个响应 URL，每份最多 4 MiB。缺响应（含无法关联的重定向/缓存响应）/未完成/字节过大/不同字节复用 URL 均不猜测。
- 用计算样式取得 **未变换的 content box**，正确扣除 border-box 的 padding/border。依据 object-fit 的 fill、contain、cover、none、scale-down 计算实际内容尺寸。元素 AABB 只用于视口和证据定位，不用于推导原图缩放。
- 合成图片及其祖先的二维 CSS transform 矩阵，再合成内容缩放，计算奇异值之比；旋转、镜像、剪切、非等比缩放及抵消缩放都在此模型内。object-position 首版仅支持默认居中。
- 透明边距不是内容形状边界：不会拿透明画布比例与截图中非透明区域宽高相比。已知栅格内所有有效像素共享同一个仿射变换，因此本实现只判断该变换是否保形；不声称提取了 alpha 有效边界，也不证明裁切后的语义完整性。
- 同一观察截图前后读取事实、节点身份与 DOM 变更计数；即使变更后恢复原值也返回 unknown。保留截图、snapshot、源字节 artifact、资源 hash、合同、content box、object-fit、矩阵、奇异值比及明确原因。它是当前稳定采样的测量，不是持续时间线证明。
- 比例 ≤1.001 为数值范围内保形 pass；比例 ≥1.02 才 fail；中间区域 unknown。这是本候选的保守工程分辨区间，**不是**规范允许任意图片变形 2% 的规定。退化矩阵、零尺寸、微小显示无法可靠测量。
- 多个合同分别报告四态；聚合优先 fail，其次 unknown，其次 pass，全部范围外才 not-applicable。fail 只声称相对于已引用原资源存在 CSS 内容变形，不声称源图错误、可见图形语义错误或二维码不可扫描。

算法依据：[CSS Images 3 的对象尺寸和 object-fit](https://www.w3.org/TR/css-images-3/#the-object-fit)、[CSS Transforms 1 的累积变换](https://www.w3.org/TR/css-transforms-1/#transform-rendering)。2026-10-08 核对；这些规范解释绘制数学，不提供保形设计意图。

## 正常例外与 unknown

| 情况 | 本候选结果/边界 |
| --- | --- |
| 宽/方形容器中的 contain 留白；cover 等比裁切；none/scale-down | 完成测量且保持形状时 pass；没有验证裁切完整性 |
| 精确资源合同确认授权艺术变形 | not-applicable；不能仅凭 alt、CSS 或异常外观推测授权 |
| 合同页面或视口之外、已确认不可见或完全视口外 | not-applicable；不等于健康 pass |
| 没有保形依据、丢失或歧义目标、资源变体/hash 不符、加载/解码失败 | unknown |
| SVG（包括 img 加载 SVG）、CSS background、canvas、iframe/shadow 内目标、GIF/WebP/APNG | 不在支持范围；已绑定而无法取得支持事实时 unknown；不扫描这些对象后宣称通过 |
| 3D/perspective、individual scale/rotate/translate、zoom、motion path | unknown；不能以轴对齐框比替代变换 |
| 动画、非居中 object-position、滤镜/遮罩/混合、祖先裁切、半透明、部分视口、内容中心命中无法确认、相交非祖先绘制层（含 pointer-events:none）、祖先生成内容或 DOM 超过 600 节点 | unknown；命中及矩形相交只用于保守排除，矩形相交不直接判为语义缺陷；不证明全图无遮挡 |
| 预先画坏的源图、二维码内部子标识、响应式资产不同构图、有效边界/艺术意图识别 | 未实现；需真实原资源、设计/语义证据及进一步方法 |

## 执行、缓存与报告

`registerBuiltinRules` 注册该候选但默认 enabled=false。执行器只为已启用且请求图像事实的规则启动资源收集，并按当前页面收集合同目标；原有元素列表、R0 采样/完成门/冻结候选/评分器均不改变。默认关闭测试还断言 snapshot 不新增 imagePaint、无 image-resource artifacts、无候选规则评估。

规则沿用 `Rule.evaluate`、四态、`runChecks` 的环境完整性检查、`rule:evaluated`、`submitFinding(source=rule)` 和 `buildReport`，不新增旁路执行器或直接动作。沿用缓存入口，但该候选声明 `routing.cache=never`；现有含 img 页面本来就不允许观察复用。即使调用方错误提供相同 factVersion，也不能复用旧图片结论。既有自动规则的缓存行为不变。

报告已有通用 evaluations/details 和 artifact API，测试从真实执行器产物生成报告并通过 artifact URL 读取截图、snapshot 和源资源，不伪造手工报告事件。源字节以 image-resource JSON 的 base64 保存，可核对 SHA；没有新增专用前端图像诊断界面。

## 免费验证入口

使用 Node 24.21.0、仓库现有依赖和 Playwright Chromium；全部合成夹具，无真实模型请求、无原 Jira 附件、无 R0 全量验收。

```sh
pnpm typecheck
pnpm exec vitest run src/execution/image-paint.test.ts src/execution/interaction-verification.test.ts src/rules/engine.test.ts src/rules/routing.test.ts
pnpm exec vitest run src/execution/executor.test.ts -t 'synthetic image candidate|preserves an original screenshot plus a DOM-based red annotation'
```

2026-10-08 实际结果：上述第一组 **51/51** 通过（图像 31、交互反例 6、规则引擎 10、路由/缓存 4）；执行器定向组 **6/6** 通过，74 个无关用例按名称过滤跳过。`pnpm typecheck`、13 个改动 TypeScript 文件的 Biome 格式检查和 `git diff --check` 均通过。执行器测试包含 5 个图像候选场景与 1 个既有 overlay 证据回归。未运行无关全量验收、未调用真实模型。

- [图像采集/判定浏览器测试](../../src/execution/image-paint.test.ts)：缺陷、健康、正常例外、信息不足、五类 object-fit、border/padding、透明边距、旋转/镜像/剪切/祖先及抵消变换、名称/位置变化、歧义/丢失/替换节点、加载与资源身份、HTTP 不重取、缓存与源字节证据。
- [执行器定向测试](../../src/execution/executor.test.ts)：候选四态、默认关闭、真实规则发现、报告和证据下载。模型入口是显式 stub，不调用付费模型。
- [D010 原有/新增反例](../../src/execution/interaction-verification.test.ts)、[规则引擎](../../src/rules/engine.test.ts)：详见 D010 能力映射；仅增加子树命中/穿透装饰/同名目标不混淆的实际缺口。

默认启用条件尚不具备：缺统一的人审合同录入/范围管理、真实站点外部验证、语义适用性识别及复杂绘制支持。保持候选及默认关闭，不自动合入 R0 或推送。
