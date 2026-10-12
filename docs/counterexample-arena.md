# 长期反例靶场

面向开发回归的本地页面集合，复用浮层、图片保形和文字绘制三个场景族，共14个变体。它们是已知反例，不能作为未见盲测集。新增与回溯流程见[靶场维护](maintenance/arena-library-followup.md)。

## 三个场景族与私有预期

下表仅供操作者和维护者，不交给被测 Agent。ID 稳定，浏览器 URL 一律为 `/`；场景表、私有预期位于 `evaluation/private/counterexample-arena/catalog.ts`。

| ID | 来源与触发步骤 | 健康/缺陷对照、适用边界及私有预期 |
| --- | --- | --- |
| CA01 / CA02 | 复用 parallel-popup-real `/p/two`；More options → Details；分别 640×480 / 320×480 | 同一固定面板，宽视口完整可见 **pass**，窄视口外框越界 **fail**。这里只是“两步嵌套入口”，不是同时打开两个嵌套模态。未建立按钮功能完成结论。 |
| CA03 | 373abc8 fixed-button-text-change；点击 Open details | fixed 普通按钮改字后仍是按钮；**无浮层**，不是 UI pass；显式浮窗效果 **unverified**。按钮边框、背景、名称不能使它变成浮层。 |
| CA04 / CA05 | 373abc8 replace-hidden-original-target / native-dialog-appears；点击 Open details；640×480 | CA04 克隆替换隐藏面板后可见，几何 **pass**，身份替换使功能 **unverified**；CA05 原生 dialog 出现，几何 **pass**、命名效果 **verified**。页面公开相同的动作前功能要求，检查器不能仅凭结果字样声称原目标已验证。 |
| CA06 / CA07 | 原 image-shape fixture；打开页面；1280×768 | 同一 120×60 有透明边距的 PNG，在 240×240 框中 contain 留白 / cover 裁切均保形 **pass**。合法裁切、透明边距不能误报为拉伸；不评价裁切美观或源码圆形语义。 |
| CA08 / CA09 | 同一图片以 240×60、fill 显示；打开页面；1280×768 | CA08 有公开保形规格、精确资源合同，非均匀缩放 **fail**；CA09 没有保形规格，不提供合同，**unknown**。不能从 alt、比例异常或私有 ID 推导保形义务。 |
| CA10 / CA11 | control-layout healthy / clipped；打开页面；1280×768 | 黑白 Arial 单行原生按钮；CA10 两规则实测 **pass/pass**；CA11 高 12px、overflow:clip 的垂直墨迹损失，D001 **fail**、D002 **unknown**。不能将裁切替代为覆盖结论。 |
| CA12 | control-layout overlap；打开页面 | 兄弟按钮背景擦除首按钮部分文字，D001 **unknown**、D002 **fail**；兄弟 pointer-events:none，不能因鼠标仍命中首按钮就断言文字无遮挡。 |
| CA13 / CA14 | control-layout scroll / unknown；打开页面 | CA13 窄按钮可水平滚动，实际滚动到达已核验；CA14 navy 字色超出支持范围。两规则均 **unknown/unknown**，不误报，也不冒充健康 pass。健康对照 CA10、缺陷对照 CA11/12。 |

每个场景的确定性复位相同：页面无服务端可变业务状态、无存储、无定时任务；新建匿名浏览器 context 后访问同一 `/`，恢复初始状态。同文档 reload 也已逐例核验恢复初始 DOM。切换场景必须先结束本轮、关闭浏览器并停止旧服务，再以另一个 ID 启动；禁止活动检查期间切换。并发运行使用独立进程/端口/context，同一窄宽对照无共享可变状态。

## 公开与私有边界

- `evaluation/fixtures/counterexample-arena/pages.ts` 仅组装公开产品界面；原 fixture 的服务端 mode/原路径不会出现在响应里。图片合同中的规格来自公开产品说明，真值从不补写到产品说明。
- `server.ts` 仅绑定 `127.0.0.1`，只提供 `/`、`/emblem.png`、favicon；拒绝查询选场景、未知路径、写请求、控制路径及源码路径，无目录浏览、source map 或公共答案 API。CSP 禁止外部资源和网络连接。
- 沿用 `evaluation/private/url-scan/fixture.ts` 的**进程内私有控制**：选择在启动时完成，此后不可变，没有 HTTP reset/控制口，因此不新建 token 协议。与 checkout/export 的可变业务不同，这里不共享需要受 token 保护的持久状态；不开放热重置。
- `--list`、私有 catalog、验证结果和 data 只给操作者，不作为 Agent 输入或静态资源。Agent 只拿 entryUrl、视口及正常任务目标；正式执行器使用这些 loopback 页面时仍须由部署端配置精确可信 origin，不更改产品网络权限。
- 验证入口调用现有只读采集器和规则工厂，不创建模型客户端，不载入历史评分答案作为页面内容。校验过程里的截图/字形参考属于私有证据。

## 启动、选择与免费验证

在克隆后的仓库根目录执行，先完成[环境准备](../README.md#最短启动)：

```sh
pnpm install --frozen-lockfile
DOTENV_CONFIG_PATH=/dev/null node --import tsx scripts/validation/counterexample-arena/serve.ts --list
DOTENV_CONFIG_PATH=/dev/null node --import tsx scripts/validation/counterexample-arena/serve.ts --case CA02 --port 4190
# 浏览器访问 http://127.0.0.1:4190/，视口 320×480；Ctrl-C 停止。
# --port 0 由系统选空闲端口，实际地址与视口只打印到操作者终端。

DOTENV_CONFIG_PATH=/dev/null node --import tsx scripts/validation/counterexample-arena/validate.ts
DOTENV_CONFIG_PATH=/dev/null pnpm typecheck
DOTENV_CONFIG_PATH=/dev/null pnpm exec vitest run \
  src/execution/popup/geometry.test.ts src/inspection/popup-effect.test.ts \
  src/execution/layout-facts.test.ts
```

`validate.ts` 用项目现有 esbuild 编译一个隔离 runner，避免 tsx 的浏览器回调闭包辅助函数问题，不改共享构建配置。真实 Chromium 按各例规定视口访问 HTTP 页面；先独立核实 DOM/几何/资源字节或滚动状态，再调用生产 `popupCollector` / `evaluatePopupEffect`、`readImagePaintFacts` / D004、`readLayoutFacts` / `measureLayoutPixels` / D001/D002。没有固定模型，也没有真实模型请求。

每次独立写 `data/counterexample-arena/<timestamp>/`：summary、源码与 bundle SHA256 清单、每例完整采集/规则输出、截图、图像响应字节、字形参考图。失败保留失败截图和 summary 并非零退出，不覆盖旧结果。仅作为 fixture 与检查器接线验证：**不证明 Agent 自主选择入口/规格/合同，不证明正式执行器完成门、持久报告或网络策略通过**。D004 合同仍由验证宿主根据公开规格显式绑定；不能宣传为模型自动识别图片意图。

## 其他长期页族

资料检查使用[产品资料示例](../evaluation/fixtures/product-sources/product-spec.md)及同目录页面。健康、效果不符和前置不足共享正常规格，私有真值位于 `evaluation/private/product-sources/`。资料验证、复用和历史基线的启动入口见[靶场维护](maintenance/arena-library-followup.md#如何归属)。这些页族不并入上方14个变体的数量。

原始回归证据不随仓库分发；历史结果和取得限制见[归档索引](archive/README.md)。从 clone 运行上述验证会生成本次新证据，不恢复历史实测结果。
