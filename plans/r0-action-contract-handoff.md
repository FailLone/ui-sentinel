# R0 动作派发前参数校验：受限修复交付

2026-10-08，Asia/Shanghai。用户接受 e13c535 UI诊断5/6与最终未通过，授权仅处理动作专属参数的派发前校验和有界修正。本轮候选 **`adc6b540b7c25c06cbcad7d3e8b657d480bec474`**，免费定向验证通过，**付费请求0，R0仍未正式通过**。未启动真实模型重跑或R1。

## 原反例和修复

原 run `run-ce606f5b-af3a-4cac-ae86-e2c4edcac56e` 在已有有效排序发现之后，发出 `page_act {type:"navigate",ref:"e25",role:"link",name:"About this catalog",url:null}`。原动作字段全局 optional，缺参进入 action:executing 后才抛错，形成 execution-error、未完成导航与无合法结束证明。

现在该请求在 SDK 的 actionInput 校验阶段拒绝，明确列出缺少 url 以及 navigate 不接受的目标字段；没有浏览器操作、动作计账、派发事件或原事项解决。输出进入已有 `validationErrors` 工具修正通道，执行器不提供推测 URL，也不代换动作类型。

`src/execution/action-input.ts` 是统一字段契约；`tool-inputs.ts` 保持既有导出。`performAction` 还在 guard 之后、任何观察/定位/写权限解锁/计账之前复核内部调用。嵌套调查的 act 步骤在整个程序的 SDK 校验阶段复用同一契约，避免先取证再拒绝无效动作。取消 guard、派发后 catch 和未知写入隔离保留。

## 各类动作的字段与组合

| 动作 | 必填 | 允许 / 拒绝 |
| --- | --- | --- |
| click | 目标 | 可带 verify；拒绝 value、url、scrollY |
| probe | 目标 | 拒绝 verify、value、url、scrollY；测量不等于点击效果 |
| fill | 目标、明确 value | `""` 明确清空；可带 verify；拒绝 url、scrollY |
| navigate | 明确的绝对 HTTP(S) url | 拒绝所有目标字段、verify、value、scrollY；不从 ref/标签推断目的地址 |
| scroll | 明确 scrollY，范围 -1000–1000 | 拒绝目标字段、verify、value、url；不再默认500 |

目标为 role+name、selector、visualDescription 三选一；UI 还可单用观察所得 ref。ref 可与一个定位方法交叉核对；nth 只与 role+name 一起使用。空白目标、不完整 role/name、互斥定位方法和未知字段拒绝。业务 ref-only 缺少可执行定位方法，派发前返回验证错误。可选 null 只归为“字段未提供”，不补默认值；value/URL 字节不被替换或自动规范化。

UI 局部动作仍须原公开后置测量；已选链接仍须真实 click。动态目标身份、导航范围与写入权限等执行时政策没有被这张参数表替代，字段合法也不证明动作成功。

## 有界修正及停止

复用原 `createToolContractRepair`：三轮无真实进展、原只读恢复无新增时，全运行最多一次工具修正提示，允许一个模型轮次。多条错误不增发机会，不重置原任务或权限，输入错误不记作事实。该修正轮次仍无新事实时，不再叠加F1的剩余义务引导，按原完整性门保留未完成事项并结束。

真实 SDK 反例中：重复 navigate缺参4次，仅一次修正，5次模型轮次（包括选择范围），0动作；最终诚实blocked/partial，原局部及导航仍pending。取消优先；真正click执行失败仍execution-error，无accepted finish。未知业务写入仍隔离且禁止重放。

## 免费定向证据

Node v24.21.0、pnpm10.17.1；复用现有锁文件和环境，无重新安装。构建通过。以下测试只使用固定本地模型/真实浏览器或现有mock，没有付费调用。

| 检查 | 结果 | 日志 / 原始证据 |
| --- | --- | --- |
| `pnpm build` | 类型检查及构建通过 | `data/r0-action-contract-delivery/logs/build-final.log` |
| 6文件：action-input、tool-contract-repair、tool-guidance、remaining-obligation-guidance、progress-detector、ui-probe | 50/50 | `logs/targeted-authorized.log` |
| investigation/ui-bindings | 7/7，含3项嵌套非法组合反例 | `logs/nested-action.log` |
| 原 executor 业务取消/副作用与不确定提交隔离5项 | 5/5；70项未选择 | `logs/business-boundary-authorized.log` |
| `pnpm exec tsx scripts/validation/r0-action-contract.ts` | **8/8** 正式API/SDK/Chromium接线场景 | `data/r0-action-contract/2026-10-07T18-13-29-654Z` |
| 原始自审计 | 8行SQLite、完整事件、终态、所有产物字节/类型/归属一致 | `data/r0-action-contract-delivery/raw-audit.json` |

表中 logs 相对根目录均为 `data/r0-action-contract-delivery/`。50与7是两组定向文件，共57项；不把8行自审计再计作另一批浏览器通过率，不宣称全量测试。

八个API场景全部保留：

- matrix-correct：原navigate/null、click/probe无目标、fill缺value、scroll缺scrollY、冲突定位方法共6条拒绝。拒绝窗口内 goto/evaluate/screenshot/locator/getByRole/wheel计数全部为0；原选中局部与导航在第一次真正动作前仍pending。显式click修正后，两次真实动作完整完成。
- repair-click：3次原缺参、一次修正提示后显式click；局部检查与已选链接正常完成，2动作。
- repair-url：局部先验证，未选链接的缺参navigate在一次修正后用明确URL执行真正navigate，保存navigation:committed并完整结束；没有偷换成click。
- repeat-error：4次拒绝、一轮修正、0动作、无额外F1提示，诚实blocked，未完成范围保留。
- selected-link：提供合法URL直接navigate仍被原政策拒绝，没有navigate派发；随后实际click才验证原已选导航并完整结束。
- execute-error：修正后有效click的trial真实成功，测试hook关闭浏览器context；后续原生locator.click报Target closed。生产事件仍action:failed → execution:stopped/ui-action-execution-error → execution-error，0 accepted finish。hook只制造浏览器同步故障，不改生产SQL/事件。
- cancel-repair：修正轮次同步取消，0动作、0 accepted finish，终态cancelled。
- after-normal：前述错误/取消之后后续正常任务仍完整完成。

自审计由当前Agent独立读取原始SQLite和产物完成，不称为另一个Agent盲审。测试脚本中的明确动作与答案只证明接线、契约和故障边界；**不能证明真实模型会选对修正，也不能替代完整真实R0验收**。

## 候选与身份

测试在父HEAD `290079d0870f5b13c0250b31ab05356f7bba0eee` 的未提交源码树执行；提交后逐树核对与候选adc6b54一致，不冒称提交后重跑。映射见 `data/r0-action-contract-delivery/identity-audit.json`。

- dist：`1a26f780a560a7876e1633f9045e9cd92bf3acad031279881891e9d514276770`。
- src：`d0767424eca3de0552d2c852dcd0230ba14f59f793d2a547e155a474d4b26e03`。
- scripts：`856a58c449b1193598ee37c8c6adcc0115d65023ae40091839fdfd744cfaca97`。

完整本地原始包的位置、SHA-256与字节数见 [机器索引](evidence/r0-action-contract-delivery.json)。包包含最终结果、数据库、截图、模型请求、钩子同步点、日志、原始自审计和中间失败；不包含 `.env` 或凭据，不随Git推送。换机复核须同时取得原始包。

保留中间失败而不改写：首轮浏览器脚本错误地要求ref-only点击的target文案含Information；实际target是原绑定CSS，生产已经completed。已改为核对两次真实click和原导航事项verified；原失败目录 `data/r0-action-contract/2026-10-07T18-05-49-354Z` 与日志仍在。`18-08-29-094Z` 是此前通过的八行，其中真正执行错误使用遮挡trial失败；最终八行增加trial成功后浏览器关闭的真实click错误，旧批次不与最终分数拼接。最初类型检查及沙箱EPERM日志也保留，最终构建/测试另有明确成功日志。

## 复用、费用及后续边界

沿用 e13c535 已接受的F1/F2归属、证据封印、K1–K3取消/错误/历史契约及旧有效回归映射；这些模块没有被全面重审或全量重跑。新修改涉及共享动作入口与工具修正调度，已以上述参数、原probe/F1定向单元、5项业务隔离及8项API轨迹补核受影响范围。原e30a9ef否决、97d39ed正式13/15失败、e13c535诊断5/6失败均保留。

本轮新付费 **US$0**。原共享账本仍733条settled、已知US$1.91502588，unknown/held/lease均0；余额US$18.08497412，含历史另一账本的R0总已知US$1.95225048。没有新建付费manifest/approval或恢复已结束批次。

没有schema迁移，旧报告与证明保持原含义。无效输入不再消耗动作预算或生成动作状态；原依赖“省略value/scrollY自动默认”及带互斥/忽略字段的调用现在须显式修正。这是本次收敛的兼容边界，不扩大网址、网络或业务写权限。

本轮只交付受限修复和免费证据。下一步应先复核该候选及参数/修正边界；真实模型稳定性和K4/K5完整出口仍需另行授权的完整新批次。不给Roadmap标R0完成，不自动进入R1。维护者的主工作区Roadmap修改未纳入本轮提交。
