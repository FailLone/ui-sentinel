# 浏览器 Agent 循环对照实验

日期：2026-09-22。状态：实验脚本已实现，真实模型记录与结论见 [实验结果](./browser-loop-experiment-results.md)。

## 问题

判断超时是否来自自有循环/上下文与工具协议，先测可结束的操作任务，再决定是否进入质量发现对照。不得把购买完成率当作 UI 缺陷发现能力。

## 固定配置

- 当前执行器：当前工作树构建，通过正式 API 运行，保持系统提示词及规则。历史实验基于 d1b6f67；各批次独立记录版本，不混合统计。
- Stagehand：3.7.3，本地 DOM Agent，禁用云端 API 和持久缓存。v4 API 与 v3 不同，本次不混入迁移。
- 主模型：OpenRouter `deepseek/deepseek-v4.1-flash`，reasoning effort=low。
- 视觉：OpenRouter `qwen/qwen3.7-plus`，Midscene family=qwen3，reasoning disabled。
- 两者共同采用 300 秒、30 次实际模型请求、单次输出上限 4096 tokens；失败请求也计数。主模型和视觉请求共享预算。
- 请求强制使用指定型号，不自动切换模型；保存实际供应商、usage、费用（若供应商提供）和延迟。
- 1280×720 视口；独立临时端口、数据库和浏览器；每轮重置 C0，私有控制和答案不进入模型输入。

## 步骤

1. 真实 DeepSeek 工具调用与 Qwen 坐标命中冒烟，不通过则不开始对照。
2. 每个执行器先跑一次 C0 购买任务，检查接入是否有效。失败接入记录保留，不冒充 Agent 能力失败。
3. 接入有效后，各重复 3 次，交替运行顺序；保存全部成功、失败和超时记录。
4. 独立核对：恰好一笔 paid 订单、最终页面显示同一订单 ID 和成功反馈、Agent 自己完成退出。仅后端成功而 Agent 超时不算通过。
5. 对失败轨迹分析操作、观察、结果记忆及结束决策。若需要修改实验协议或模型配置，创建新批次清单，不混合统计。
6. 确认操作能力后，另定质量探索实验；本阶段不声称 C0–C5 或 M5 已验收。

## 公共任务

通过可见商店界面购买恰好一个商品，验证最终支付结果和可见订单 ID，然后停止。不要重复购买或强行触发其他支付结果。诚实报告阻断和未验证条件，只使用应用内正常交互。

## 历史因果对照：current-history（已结束）

预试验发现历史只保留 page_act 与 URL，丢掉动作参数。当时使用隔离 bundle 保留最近六步的真实参数、选定结果字段、ID 与证据，比较 current、stagehand、current-history 各三次。该临时变体已由正式修复替代，源码字符串替换脚本及入口已移除。历史变换和源码哈希仍随原批次保存在本地证据目录，结果见实验报告。

## 测量与局限

统一本机网关记录实际请求、耗时、token、费用、错误及输入输出。密钥仅在网关进程持有，子进程使用本机临时 token。请求和响应只用于模拟靶场，忽略目录 data/ 保存，不提交。

这是两个执行栈的对照，不是单一压缩变量实验：当前执行器仍带原检查提示词和自动规则；Stagehand 有自身提示词、内部工具与完成语义。Stagehand 的步骤与当前 page_act 计数不同，记录原始交互和请求数，不能直接把框架步骤相互等同。

Stagehand 主循环使用 DeepSeek；视觉定位通过 Qwen 自定义工具提供，关闭内置 screenshot 工具，避免把视觉职责悄悄交给 DeepSeek。普通 DOM 任务可能不调用视觉工具，因此另有真实视觉冒烟；不能声称零视觉调用的购买任务验证了视觉回退效果。

无论结果如何，不直接将 Stagehand 接入产品运行，也不覆盖现有规则、证据和评估器。

## 运行

在本机 .env 设置 OPENROUTER_API_KEY；不要提交密钥。

```sh
pnpm build
pnpm exec tsx scripts/experiments/browser-loop.ts --smoke-only
pnpm exec tsx scripts/experiments/browser-loop.ts --repeats 1
pnpm exec tsx scripts/experiments/browser-loop.ts --repeats 3 --arms current,stagehand
```

模型列表、版本、任务和局限保存在每批 manifest.json；原始账本、运行报告及汇总在 data/experiments/<时间>/。缺凭据明确失败，不 mock。最终研究结论在 plans/ 中另写文档，引用原始记录。

参考：[OpenRouter 模型列表](https://openrouter.ai/api/v1/models)、[Stagehand v3 Agent](https://docs.stagehand.dev/v3/basics/agent)、[Midscene 模型配置](https://midscenejs.com/model-common-config)。

## 固定供应商补充对照

历史自动路由批次出现传输错误，因此另起批次固定 DeepInfra FP8 与 Alibaba，对当时执行器及 current-history 各运行一次，结果保留在实验报告中。当前仍可固定供应商复验正式实现：

```sh
EXPERIMENT_AGENT_PROVIDER=deepinfra/fp8 EXPERIMENT_VISION_PROVIDER=alibaba pnpm experiment:browser --repeats 1 --arms current
```

额外配置只影响实验网关，不改变生产模型接入。网关在本批对非流式响应完整读取成功后再转发，避免上游断流被包装为空的 HTTP 200；仍不进行网关重试，失败请求保留并计入预算。

### 正式修复后的复验

执行层修复后，`current` 指当前工作树构建的正式实现，不再代表原始缺陷版本。使用 `pnpm build` 后运行 `pnpm experiment:browser -- --arms current --repeats 3`，与历史记录分批保存，不覆盖旧数据。旧 `current-history` 入口已退役，历史批次和其变换内容保存在各自 manifest/原始记录中。
