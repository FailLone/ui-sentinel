# R0 F2/F1 受限整改交付

2026-10-08（Asia/Shanghai）。用户接受C11诊断通过、正式UI13/15未通过，授权先F2后F1。本轮不另作全面规划、不改原评分、不付费、不默认全量重跑。

## 候选与状态

当前实现提交：`e13c535009695ee70c3794868224ac3842090f79`（含首版`e30a9ef`）。范围：UI probe测量/原事项关联/持久校验，一次剩余义务引导，以及定向验证和文档。购物/导出业务代码路径、取消唯一生效点、已派发未知写入隔离保持不变。

自测结论：**受限F2/F1免费验证通过**。首版e30a9ef虽然自测通过，独立复核仍否决：probe入口重新按locator绑定导致身份替换窗口；probe引用截图缺少字节/类型校验。否决及复现完整保留在`data/r0-f12-independent-review/review.json`。当前提交在同一受限契约内修复两项，原复核者复查结论为**受限F1/F2候选复核通过**，见`plans/evidence/r0-f12-review.json`，与自测分开记录；免费脚本不证明真实模型稳定性，不宣告R0完成。

构建身份：dist `1829cce652b1d67ff3e7d9e8d63c09babfe127acd671c95bd407292011eccb7a`；src `76d57e0d9f48f96274adb921eb259c743327bf7fa33c01d4da2e3c1fe00846b4`；scripts `e6fb2bbec4624500b8005e8047a51a64b2018029d64a02bd8fe68c0b3592e55a`。本轮定向测试identity记录父HEAD e30a9ef加未提交文件树哈希，提交后逐树比对一致，见`data/r0-f12-delivery/review-fix-identity-audit.json`。不是提交后重跑声明。首版身份仍保留在原identity和raw-archive-audit中。

## 实际实现与契约对应

| 项目 | 实现与边界 | 定向证据 |
| --- | --- | --- |
| F2有效阴性 | `ui-probe.ts`复用原观察handle，locator仅交叉核对唯一连接身份，当前URL和身份前后校验；本次trial Timeout加前后完整可见启用、零命中采样，才是intercepted。其他异常不降级 | healthy/intercepted，缺失、歧义、无效ref、替换节点 |
| F2原事项 | 阴性receipt包含原run/action/item/ref/snapshot，原pending局部项变failed，已有规则发现保留。positive仅actionability，不把原行为效果标verified；返回effectTested=false | 原itemId一致、遮挡有发现且无真实点击；健康必须再点击并测量，正面probe不能抵扣 |
| F2历史 | `probe-history.ts`检查事件归属、绑定、阴性条件、scope关联，完成校验和历史读核对测量JSON与引用截图字节摘要、产物类型 | wrong-association、tampered-receipt、tampered-screenshot、wrong-screenshot-type均inconsistent；恢复原字节后重启历史一致 |
| F2真正错误/取消 | 真实click失败、浏览器关闭、节点替换仍错误；probe同步点取消仍cancelled，无accepted finish | real-click-error/closed/replaced/cancel，随后正常任务可完成 |
| F1触发 | 干净UI三轮无进展、只读恢复无新增、存在当前连接且已选pending项，动作预算可用、未到收尾保留区 | guide-complete/ignore/second-loop/cancel/budget/no-items |
| F1允许与结束 | 一次模型轮次列原item/ref；原权限/工具校验不变，不自动动作。提示不记证据、不重置streak；无真实新事实则原结束契约收尾；有真实新事实可继续但不补发 | 接受引导后完整完成；忽略则blocked；新事实后第二次循环仍不补发；预算和取消优先 |

与专项分析中的推荐方案一致。明确收敛：有效阴性仅覆盖现有矩形几何可证实的完全拦截；复杂裁切/变换、禁用、失效目标等不凭Timeout猜测阴性。使用既有三点DOM几何与独立Playwright trial交叉佐证，自动overlay规则的五点证据继续保留。UI probe首版只接受已观察的局部控件，链接目的页验证仍由真实导航负责，不能通过probe宣布导航成功。此边界写入工具政策与执行引擎文档。

## 免费验证与原始结果

以下首版证据在e30a9ef对应字节上执行并保留，其中未受复核修复影响的F1、生命周期及业务边界验证按影响范围复用，不冒称全部在e13c535重跑。以下在主工作区执行，Node v24.21.0、pnpm10.17.1；所有模型端点指向本地固定模型，远端key在验证子进程显式置空。没有真实模型调用或付费。

| 命令 | 结果 | 原始日志/证据 |
| --- | --- | --- |
| `pnpm build` | 类型检查及构建通过 | `data/r0-f12-delivery/logs/r0-f12-build-final.log` |
| `pnpm exec vitest run src/execution/ui-probe.test.ts src/execution/remaining-obligation-guidance.test.ts src/execution/inspection-host.test.ts src/execution/completion-integrity.test.ts src/inspection/completion.test.ts src/inspection/recovery-history.test.ts` | 6文件62通过 | `logs/r0-f12-targeted-final.log` |
| `pnpm exec vitest run src/execution/run-manager.test.ts src/execution/run-queue.test.ts src/execution/progress-detector.test.ts src/execution/tool-contract-repair.test.ts` | 4文件20通过 | `logs/r0-f12-lifecycle.log` |
| `pnpm exec vitest run src/execution/executor.test.ts -t 'export side-effect and cancellation boundaries\|quarantines a run after an uncertain completion commit'` | 5通过；70按名称未选择，不是全量通过声明 | `logs/r0-f12-business-boundary.log` |
| `pnpm exec tsx scripts/validation/r0-f12.ts` | **34/34**：16次API真实浏览器运行+2个证据破坏反例+16个重启历史比对 | `data/r0-f12/2026-10-07T16-25-24-988Z` |
| `pnpm exec tsx scripts/validation/r0-k123.ts` | **18/18**：初始化/动作拒绝、取消、截断、后续任务、错关联/篡改、重启；旧C10仍失败 | `data/r0-k123-browser/2026-10-07T16-25-24-873Z` |

表中后5个日志相对目录同为 `data/r0-f12-delivery/`。实际shell运行时上述`-t`参数内`|`是正则分隔符，无反斜杠；这里为Markdown表格转义。没有调用付费diagnostic/formal入口。

首轮30/30免费验证也保存在 `data/r0-f12/2026-10-07T16-22-37-303Z`，其中34/34是首版自测证据，不能抵消独立复核否决；当前F2以以下26/26及新构建绑定为主证据。中间补充了工具直接返回probeMeasurement/effectTested，以及真实click错误与预算反例；没有降低预期。自测归档核查读取新SQLite连接比较全部事件payload/refs/seq及终态，并逐下载产物核对哈希/字节数，见 `data/r0-f12-delivery/raw-archive-audit.json`。

可控取消/关闭/替换节点通过 `scripts/validation/support/ui-probe-hook.mjs` 在测试子进程的真实Playwright handle上建立同步点；不改变生产SQL/事件，也不凭随机延时碰撞。模型脚本的固定答案属于B类接线测试，不传入后续C类中性真实任务。不能用34/34替代15次真实稳定性。

### 独立否决后的定向复验（当前候选）

- `pnpm build`通过；上述六文件单测重新执行，**63/63通过**，新增原绑定在probe入口前被替换的反例。
- `pnpm exec tsx scripts/validation/r0-f12.ts --probe-only`：**26/26通过**，11次正式API/SDK/Chromium执行、4项证据反例、11项重启历史对照。新增可控入口替换窗口与截图字节/类型篡改。原始目录`data/r0-f12/2026-10-07T16-34-56-513Z`；日志`data/r0-f12-delivery/logs/r0-f12-review-fix-{build,api,targeted}.log`。
- 两次不同构建的数字不相加作单批通过率。F1代码未变，复用首版guide-complete/ignore/second-loop/cancel/budget/no-items及原独立审查；业务分支未变，复用首版5项定向业务测试及B18，不重复全量跑。
- 前次遗漏原因：节点替换测试只覆盖trial内部，漏掉原观察校验到helper重新绑定的间隙；产物测试只破坏receipt JSON，漏掉被引用截图。本次修复直接移除重绑和补足证据闭包，增加反例证明契约，未放宽判定或添加样本特例。

## 证据复用、兼容和限制

- 已接受的97d39ed取消顺序B30、动态恢复B10、连续性B19、URL42、业务32及原关键契约复核继续按原哈希/影响映射复用，不说成在本候选全部重跑。此次重新跑了受影响的K1–K3 B18及5项真实业务写入/隔离定向测试。
- 原97d39ed工作区及C11/正式13/15记录、费用账本、旧C10独立否决都未改写。外部`docs/product-roadmap.md`差异不动、不提交。
- 无数据库schema迁移；新增probe产物及事件，旧无此事件的历史报告保留原含义。首版e30a9ef的未封印probe记录在新读端不可当作有效阴性证明，保留原始自测报告与否决，不回填摘要。需要回退时回退本轮两项实现提交；已有新probe记录应使用支持该类型的读端复核，不用旧读端省略新校验制造通过。
- 健康引导只提供一次接线机会；真实模型是否采纳、是否可靠完成仍未知。复杂/暂态几何继续保守拒绝有效阴性，不承诺任意控件/网站覆盖。真实业务C与正式UI重复仍缺新的完整通过证据。
- 本轮费用0，既有账本余额不是新付费许可。不将原13条通过拼入未来批次。

## 后续门禁与维护交接

原复核Agent已复查e13c535，结论为本受限单元通过：原独立替换钩子现在得到execution-error/probe-target-changed，0 probe测量、0事项解决、无finish且proof=false；独立DB中替换截图字节或类型均失去可信证明，恢复原件则verified；两文件4项测试通过。F1未变，复用前次独立审查。原否决及新结论同时保留于`plans/evidence/r0-f12-review.json`引用的原始目录。

复核的旧单场景复现脚本保留了原34行总数断言，因此原始日志为`replaced true`而汇总`passed=false`/exit1；没有删除或改写该失败输出。复核者另以`initial-replacement-followup-verdict.json`逐项验证生产行为符合拒绝要求。这是单场景复现脚本的汇总限制，不把它宣称为整批测试通过。

当前可进入新真实批次的冻结准备，尚未授予执行许可。下一步固定同构建诊断→正式UI→业务阶段、次数、成本及对应授权，健康仍须完整完成、异常须有效发现，保持业务写入标准。未创建新的付费manifest/approval。完整本地原始归档`data/r0-f12-delivery-evidence.tar.gz`包含报告、事件、SQLite、截图、模型请求、请求记录、日志、首版失败与复核反例；归档摘要及证据索引见`plans/evidence/r0-f12-delivery.json`。原始目录和归档不进入Git，推送的是实现、脚本、交接和可核对索引。

给Roadmap维护者的建议：可记录“F2/F1已完成受限实现与免费自测，独立复核已在F1/F2受限契约内通过；原正式13/15仍未通过，K4/K5真实出口仍待验证”。由维护者核对后更新，不标R0完成、不自动进入R1。
