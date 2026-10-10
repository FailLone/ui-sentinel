# 图片候选公网实验：DNS 合入后的独立复测

2026-10-09（Asia/Shanghai）。**组合分支可以构建并完成真实图片候选采集，原主文档 fake-IP 障碍已解除；尚不具备自动语义绑定实验条件。** 第二次观察共枚举 58 张 img，26 个候选取得全部合同机器字段，但完整绘制支持和 `facts-ready` 均为 0。没有执行语义检查，也没有用网络成功率或候选数量推算规则准确率。

本报告补充而不覆写 [2026-10-08 系统 DNS 0/3 记录](image-binding-public-validation.md)。DNS 使用说明见 [network-dns-compat](../network-dns-compat.md)，原成果见 [交接](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/network-dns-compat-handoff.md)；本轮[证据索引](evidence/image-bindings-public-doh-20261009.json)独立保存身份、原始材料摘要、逐项缺口、网络拒绝及计数。

## 集成与执行身份

| 项目 | 身份 / 结果 |
| --- | --- |
| 工作区 / 分支 | `/Users/xietian/.codex/worktrees/rule-image-proportion/ui-sentinel`；`codex/rule-image-proportion`，开始时干净 |
| 规则原 HEAD | `36247ffad7d364a77e5910d62fb8dd632f067c0e` |
| DNS 实现 | `6566d568f5cd1bbe9b6afaef1b12a4b90463288a` |
| DNS 交接 / 固定交付 | `3725f770e3ba39587fc0eb9c95d763370a788171` / `b0174b148923cf801db6cc596fbd288f30511bf4` |
| 普通 merge、组合构建及实验 HEAD | `487dba2df1bcee7a0947d5b4dc4db0e433f19d64`，`--no-ff` 保留双方历史，无冲突 |
| 依赖 / 构建 | Node 24.21.0；pnpm 10.17.1；按合并后的 lockfile 独立安装；一次 `pnpm build`（含 typecheck）通过 |
| 补充测试 | 0；无冲突/接线修改，未重跑 DNS 62 项、图片 40/57 项或 R0 全量 |

原 `node_modules` 是指向主工作区的链接，本轮只在规则工作区解除该链接并独立安装，未修改其目标目录。构建日志、服务端产物和相关源码的 SHA-256 在索引。实际通过 `node --import tsx` 调用同一 HEAD 的 `openImageBindingExperiment`；不是复用 DNS 观察脚本或其截图。实验后只有文档/证据索引变化，未改任何图片规则代码。

仅在三个实验子进程注入已授权配置：`URL_SCAN_DNS_MODE=doh`、5000 ms、`https://dns.alidns.com/dns-query`、bootstrap `223.5.5.5`。精确 DNS 域名为 commons.wikimedia.org、upload.wikimedia.org、meta.wikimedia.org、developer.mozilla.org、mdn.github.io、interactive-examples.mdn.mozilla.net、github.com、github.githubassets.com、avatars.githubusercontent.com、user-images.githubusercontent.com、raw.githubusercontent.com、camo.githubusercontent.com。没有写入产品默认或系统/VPN设置；DNS 查询许可未扩大资源权限，`trustedOrigins=[]`。

## 固定样本、协议与类别核实

清单在此次导航前再次固定，完整 URL、理由和来源权限保存在 protocol 与索引。每页一次导航、两次 observe、两次之间固定等待 5 秒，默认 1280×768。没有业务点击、填写、登录、滚动、模型调用或额外获取图片；没有失败重试、换页或第三次观察。

| 固定页面 | 预选类别 | 本轮实际证据及限度 |
| --- | --- | --- |
| [Commons PNG](https://commons.wikimedia.org/wiki/File:PNG_transparency_demonstration_1.png) | 简单静态图片 | 确认静态 PNG 主图，字节摘要 `c4e870d3…b696`，自然尺寸 800×600；截图显示骰子图。全图部分在视口外，不能因此宣称绘制判定已支持。 |
| [MDN Responsive images](https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images) | 响应式/懒加载 | 正文确有响应式图片说明，5 张 img 中 3 张未完成加载；现有材料未保存真实 img 的 loading/srcset/sizes，不能把教程文字或未加载现象当作响应式/懒加载行为已验证。未改视口或滚动。该类别验证仍不完整。 |
| [GitHub CPython](https://github.com/python/cpython) | 异步 DOM 内容 | 记录到 `_sidebar`、`branch-and-tag-count`、`overview-files/main` 等异步读取，截图为真实仓库；两次已记录的正文与180项元素摘要相同，不能据此声称观察窗口内出现了网站引起的 DOM 更新。全局 epoch 变化另见归因限制。 |

Commons 反而在两次间新增两个 img，故至少在本轮固定清单中确实观察到 DOM 图片集合变化；没有将它替换为第三项或增加访问。三张第二次截图已本地核对。

## 逐页统计

表内 `第一次 → 第二次`。**字段齐全不等于机器事实已就绪**：合同机器字段指 id、页面、视口、selector、当前资源 URL、SHA 六项非空；`facts-ready` 还要求加载、支持绘制、稳定目标和证据完整性等全部通过。

| 页面 | DOM img 总数 | 枚举 / 省略 | 加载并解码 | 绘制事实记录 | 字节核实的支持类型 | 六项机器字段齐全 | 完整绘制支持 / facts-ready | 语义检查 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Commons | 26 → 28 | 26/0 → 28/0 | 4 → 4 | 26 → 28 | PNG 1 → 1 | 1 → 1 | 0/0 → 0/0 | 未执行 |
| MDN | 5 → 5 | 5/0 → 5/0 | 2 → 2 | 5 → 5 | PNG 3 → 3 | 3 → 3 | 0/0 → 0/0 | 未执行 |
| GitHub | 25 → 25 | 25/0 → 25/0 | 25 → 25 | 25 → 25 | PNG 7 + JPEG 15，两次相同 | 22 → 22 | 0/0 → 0/0 | 未执行 |

- 所有统计仅覆盖主文档 light DOM；每批上限 32，本轮没有省略。六次共 114 条候选记录，按同页 documentId/nodeId 去重是 58 个目标，不能把两次记录算成 114 张独立图片。
- 加载成功使用 `complete && decoded && naturalWidth>0 && naturalHeight>0`。`complete=true` 也可能是破图，不能直接作成功数量。
- 支持类型按已保存字节识别静态 PNG/JPEG，计的是目标数，**不是全部绘制条件均支持**。第二批共 26 个目标对应 24 个不同资源 SHA。MDN 同一 PNG 被两个 img 使用，其中一个 `complete=false`，已有资源 SHA 仍不证明这个元素加载完成；26 个中只有 25 个同时加载并解码。
- 可导出的候选数和绘制事实记录数均为 58；若“可测量候选”指可被现有检查器可靠测量/消费，则为 **0**。所有已枚举图片 selector 匹配数为 1；未出现目标歧义。规则未执行，未形成 pass/fail/unknown 规则结果。

## 事实缺口及正常范围限制

下表为候选 `issues` 的逐项出现次数；一张图可有多个原因，列内不能相加当作图片数。资源没有 SHA 时，只能记录现有采集器的合并原因，不能从 URL 扩展名猜定真实格式或丢失环节。

| 原因 | Commons（1→2） | MDN（1→2） | GitHub（1→2） |
| --- | --- | --- | --- |
| large-document-visibility-unmeasured | 26→28 | 5→5 | 25→25 |
| evidence-intervened | 26→28 | 5→5 | 25→25 |
| unstable-target-evidence | 26→28 | 0→0 | 25→25 |
| supported-resource-bytes-unavailable | 25→27 | 2→2 | 3→3 |
| image-not-loaded | 22→24 | 3→3 | 0→0 |
| outside-viewport | 17→19 | 4→4 | 23→23 |
| partial-viewport | 1→1 | 1→1 | 0→0 |
| ancestor-clipping | 17→17 | 0→0 | 23→23 |
| visible-content-not-confirmed | 17→19 | 5→5 | 23→23 |
| opacity | 6→6 | 0→0 | 0→0 |
| paint-effect | 0→0 | 0→0 | 4→4 |
| subpixel-or-empty-display | 0→2 | 0→0 | 0→0 |

当前 DOM 元素超过 600 时所有 img 都记录可见性未测。本轮三页全部触发，**即使去掉网络干预或语义字段要求，也没有完整绘制支持候选**。GitHub 视口内的 python/lazerg 两张已解码 PNG 只有“大文档可见性未测、目标不稳定、证据被干预”三项；这比继续手填意图更早阻断消费。

第二批资源 URL 缺失分别为 4/2/0，SHA 缺失为 27/2/3。Commons 15 个缩略图请求明确被来源策略拒绝；但其余缺字节不能一概归为拒绝。例如一个 URL 以 `.svg.png` 结尾的图解码成功却没有可用资源证据，当前入口没有逐响应格式/拒收原因，不能直接断言它是 PNG、WebP 或采集器错误。GitHub 三个 badge 同样只有“字节不可用”的可靠结论，不把 alt 当作支持类型证明。

视口外、未加载、非支持格式、复杂绘制、截图覆盖不全均是正常范围限制或信息不足，不是网页缺陷。MDN 正文还明确讨论不同布局使用不同裁剪，不能将“资源尺寸不同”或“图片元素比例不同”直接升级成非等比拉伸语义缺陷。

## 两次观察与绑定失效：实际观察和推断分开

| 项目 | Commons | MDN | GitHub |
| --- | --- | --- | --- |
| 同一 document/node 身份保留 | 26 | 5 | 25 |
| 第二次新出现 / 第一次消失 | 2 / 0 | 0 / 0 | 0 / 0 |
| 保留目标的 selector、资源 URL、已核实 SHA、记录绘制/加载字段变化 | 0 | 0 | 0 |
| 仅全局 epoch 不同的保留目标 | 26（6→10） | 0（0→0） | 25（2→4） |
| 新 observe 按现有会话机制替换的旧候选 | 26 | 5 | 25 |
| 实际消费绑定核验 | 未执行 | 未执行 | 未执行 |

对比使用 documentId/nodeId，不按 selector 选第一个。比较剔除新证据文件 ID、候选 ID、观察时间和全局 epoch 等批次字段，再单列 epoch。没有观察到已核实资源变化不等于缺 SHA 的图片资源一直不变。没有主动等待五分钟；过期拒绝次数未测。旧候选被新批替换和会话关闭是实际执行的生命周期事实，但没有调用 check 验证其拒绝返回。

**无法将 epoch 变化精确分成目标自身、无关网站 DOM 和采集器自身变更。** 本轮有一项具体混淆来源：`observePage` 在两次绘制读取之间调用默认 `page.screenshot`；安装的 Playwright 1.63.0 `coreBundle.js` 21583–21597 行默认将 input/textarea/contenteditable 的 `caret-color` 临时设为 transparent 后恢复，21730 行由 `options.caret !== 'initial'` 启用。现有观察器监听整个 document 的属性变化，截图动作可能自己增加 epoch。Commons/GitHub 保存的元素摘要都含 input；它们两次均 `stable=false`，而两批图片目标字段未变。这与采集自扰机制一致，但没有 MutationRecord 溯源，不能宣称全部不稳定都由截图引起。

因此也不能将 GitHub 的 epoch 2→4 当作异步内容 DOM 更新的证明；实际可证明的是异步网络读取、目标字段稳定、全局 epoch 变化。Commons 新增 2 个 img 是独立的 DOM 集合变化证据，其余图片绘制字段没有同步改变。

本轮未主动注入网站业务 DOM 或执行交互，但**发现现有截图依赖会临时写入样式，不能宣称底层采集完全没有 DOM 写入**。遵守本轮冻结边界，发现后只记录，未改截图参数、失效策略或再观察。

## 网络、耗时与证据体积

原网络障碍已在组合代码中实际解除：三页主文档已检查 / 实际连接地址依次为 `103.102.166.224`、`151.101.89.91`、`20.205.243.166`。本轮 319 个已完成响应均逐条满足 connectedAddress=selectedAddress，且地址在本次已检查集合内。无 DNS、目标连接或 TLS 失败；这不是 HTTP 全成功、图片全加载或规则通过的声明。

| 页面 | 完成响应 / 地址匹配 | 保留策略拒绝 | 收口取消 | 实际原因 |
| --- | --- | --- | --- | --- |
| Commons | 53 / 53 | 16 | 0 | thumb.wikimedia.org 图片15；auth.wikimedia.org 脚本1，均来源拒绝 |
| MDN | 71 / 71 | 5 | 0 | incoming.telemetry.mozilla.org POST beacon 4；同源 `/pong/get` POST XHR 1 |
| GitHub | 195 / 195 | 4 | 0 | collector.github.com POST beacon 3；api.github.com POST beacon 1 |

没有加入 thumb/auth/api/遥测域名、没有放开 POST。所有候选的完整性均被既有全局策略标为 intervened，不能自行把遥测拒绝忽略后称可消费。这些拒绝不是图片规则失败。与 DNS 单次短观察的取消数量不同，是本轮实际时间窗结果，未借用旧统计。

| 页面 | 第一次开始—结束（北京时间） | 第二次开始—结束 | 实际间隔 | 宿主打开 / observe 1 / observe 2 / 总计 | artifacts / 事件 JSON / 数据库 |
| --- | --- | --- | --- | --- | --- |
| Commons | 00:32:04.914—05.138 | 00:32:10.141—10.367 | 5003 ms | 4551 / 224 / 227 / 10030 ms | 1,849,892 / 74,498 / 147,456 B |
| MDN | 00:32:20.126—20.285 | 00:32:25.288—25.455 | 5003 ms | 3873 / 159 / 167 / 9223 ms | 1,850,961 / 73,185 / 135,168 B |
| GitHub | 00:33:47.054—47.320 | 00:33:52.321—52.635 | 5001 ms | 7492 / 266 / 314 / 13098 ms | 2,003,058 / 220,980 / 294,912 B |

总计包括打开、等待、观察、写出和关闭；artifacts 包括两次截图、snapshot、候选批和 base64 资源证据，按实际保存文件求和，包含同资源在不同观察的重复存储。三页调用/关闭均无异常，6 次观察完成；证据 artifacts 总体积 5,703,911 B，数据库/事件另计。不是完整网页或所有图片的下载体积。

## 人工依据、接口与下一步建议

三页的候选 `pending.intent` 与 `basis.reference/statement/confirmedBy` 全部为 null。还需选择目标、确定保形或故意变形意图、提供能绑定该资源/页面/视口的依据以及真实声明者。

- Commons 的公开正文能提供作者、来源、尺寸和许可，取得资源身份材料容易；这些没有明确建立所有显示场景的保形义务。
- MDN 的公开教程可解释响应式缩放与艺术裁剪，但示例讲解不能直接绑定到页面中的每个截图/插图；没有采到足以确认这些具体目标必须保形的要求。
- GitHub 仓库和头像能帮助识别用途，当前页面没有取得这些具体资源在当前场景的明确保形声明；品牌/设计规范需独立确认，本轮未另访。

现有 `check` 必须先有完整语义声明才核验绑定；缺失时不会做目标身份和新资源校验。本轮没有制造确认人或占位依据，没有调用 check，因此 **全部“未执行语义检查”**。观察差异分析不是消费验证，也没有创建另一套绑定接口。

**不建议现在开展自动语义绑定实验：首要实际障碍是机器证据尚不能可靠就绪，且无语义声明时无法单独核验绑定。** 即使语义模型给出意图，58/58 候选仍被大文档可见性与全局网络干预阻塞，另有 53/58 在第二批被标不稳定。

一个最小优先建议：下一轮先让实验截图保留光标初始状态（显式 `caret:'initial'`），排除已识别的采集器自身样式写入；保留现有目标、资源、全局 epoch 和证据完整性校验，不能直接忽略 epoch。当前公共 `observePage` 未提供截图选项，若需要接线，最小接口需求仅是让实验调用显式选择该参数、保持其他调用默认行为；不要同步重构 R0/R1。本轮未实现此改动。此一步本身**仍不足以使候选可消费**：大文档可见性、全局干预范围及独立绑定诊断缺口仍需依据独立评审处理，不能通过放宽条件制造成功。

## 留存与停止点

本轮原始目录：`data/experiments/image-bindings-public-20261009-487dba2/`；实际图片 artifacts 沿用 `data/artifacts/<runId>/`。runId、每个文件路径/大小/SHA-256、批次/观察时刻和拒绝详情均在 Git 证据索引。DNS 的 13 份交接材料复制到本轮 `dns-handoff/`，逐份核对原索引摘要和复制后摘要，未移动/删除 `/private/tmp` 原件。

**截图、候选原始 JSON、资源字节、数据库、构建日志及 DNS 大文件副本均未随 Git 提交**；本机可访问不等于其他机器已取得。随 Git 的是本报告和可核对的证据索引。旧失败报告/索引完整保留。

只完成已授权的 DNS→规则分支合并与本轮结果提交；不合并 main/R0/R1，不推送，不修改 product-roadmap，不改绘制/绑定/语义或默认开关。规则仍默认关闭。本轮到此停止。
