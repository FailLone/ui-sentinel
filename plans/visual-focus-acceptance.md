# 主动视觉发现：完整验收计划

与 [开发任务书](next-development-plan.md)共同执行。状态：P1 最小子集已通过，见 [P1 交接](visual-focus-handoff.md)。`validate:visual-focus -- --preflight` 已实现；新视觉 diagnostic/formal 仍待 P3 实现，不能视为当前可用接口。本轮验收独立于归档业务契约阶段，旧45/45不能替代新结果。

## 1. 验收命令契约

| 命令 | 要证明的内容 |
| --- | --- |
| pnpm validate:visual-focus -- --preflight | 零付费；编译服务、真实React页面、Chromium、正式API及固定本地模型；确定性、安全、持久化检查 |
| pnpm validate:visual-focus -- --diagnostic | 真实smoke（含视觉结构化响应）及D0/H0/H1各一次；缺凭据明确失败 |
| pnpm validate:visual-focus -- --formal --diagnostic-source <dir> | 同构建D0/H0/H1/D1/D2/H2各三次，共18轮；保存全部计划行 |
| pnpm validate:business -- --diagnostic | 同一最终构建的旧业务真实诊断，显式关闭新视觉能力 |
| pnpm validate:business -- --formal --diagnostic-source <dir> --approved-source <dir> | 原A/B/C/D 45轮回归，原批准来源与原评分器保持不变 |

继续使用既有fixture、model gateway、build identity、artifact hash、durability audit支持模块；新runner不得复制另一套费用/完成/批准逻辑。CLI拒绝未知参数，主程序只分派到免费或付费入口，免费入口清空真实凭据。不要增加一个默认误触发付费的命令。

所有运行使用正式POST /api/runs创建任务并读取报告/证据。私有控制器仅由runner使用，不能成为Agent工具。缺少历史批准源时使用Git内的fixture导入并校验；不得重新批准原规则。

## 2. 私有六例矩阵

所有页面完成正常C0购物；搜索组件是本轮唯一注入的体验差异。相同通用任务文本，不给Agent输入框故障描述、位置、selector或case名。

| ID | 页面与真值 | 应有结果 |
| --- | --- | --- |
| D0 | 连续浅底/无内边框的宽搜索区域，实际原生input居中且明显较窄；正常input内可聚焦，视觉内部左右留白不转交焦点 | 至少一个符合完整探针证据的supported聚焦不一致，且购买成功 |
| H0 | 与D0视觉尽量相同；label/容器代理使整个合理输入区点击都聚焦原input | 不得产生该类supported；实际候选若被调查，应refuted；购买成功 |
| H1 | input有明确可见边界，旁边属于卡片的装饰留白和独立图标，不构成同一个输入区 | 不得把卡片留白认作缺陷；允许不提出候选或拒绝不合理绑定；购买成功 |
| D1 | holdout：改变文案、位置、宽度和配色，采用不同CSS结构制造同类视觉/可点击区不一致 | 自主发现且完整验证；不依赖固定文案/selector/坐标 |
| D2 | holdout：另一视口及布局，输入区包含真实label/装饰图标，明确排除图标后仍有可复现无效输入留白 | 自主发现与正确区域绑定；不得把图标区域失败当成主要证据 |
| H2 | holdout：与D1/D2相近外观，正确label代理或清楚的实际输入边界，含相邻正常按钮 | 无该类supported；不得点击相邻按钮或伪造健康结论 |

D0/H0/H1用于诊断调试；D1/D2/H2在冻结提示/schema/算法后才做付费验证。开发静态代码可看到fixture定义，**被测Agent绝不能看到**；不宣称这是训练隔离或统计意义上的完全盲测。主Agent review确认holdout不只是改一个case ID。

每例使用固定viewport/fixture revision并记录。D2采用窄视口，但候选和目标仍必须完整处于当前视口；本轮不测试跨屏坐标。字体、动画和加载稳定性由fixture显式控制，不以任意sleep代替ready协议。

私有真值维护感知区域/排除区域、原生目标身份及期望focus行为，用于独立复验；不能直接写入公开JSON或data-test属性。评分以真实截图、浏览器记录及私有fixture定义交叉验证，不能因为Agent输出supported就判正确。

## 3. 免费必过项（G0–G3）

### G0：兼容与构建

- format:check、typecheck、完整测试和build通过，报告实际测试数。
- 开关默认关闭；旧run/报告兼容，已有C0–C5、导出fixture和业务契约不变。
- 新能力不依赖未提交本地文件；原批准fixture导入/哈希检查仍通过。

### G1：候选/坐标/身份

- screenshotRef不属于run、任意路径、过期document/viewport/scroll、越界/NaN/负尺寸输出拒绝。
- CSS像素、DPR=1/2、缩放图像的坐标映射通过真实页面检查；不能仅测换算公式。
- 不支持的iframe/shadow/旋转/只读/禁用input和歧义多目标明确unknown。
- 页面在Qwen请求中途改变/取消，迟到候选不进入新状态；最多一次重采集。
- text input页面普通观察缓存仍不可复用；新探针一致性校验不得放开旧缓存。

### G2：真实行为和安全

- D0真实点击反例及H0容器/label代理正例；hit非input但focus正确仍通过。
- 目标已聚焦时点击无效留白：必须先建立未聚焦基线，不能产生假refuted。
- 正向控制失败、找不到安全中性区域、不足两个有效边缘点：unknown。
- 单次失败必须独立重置后复测；重复同一假设不会重复点击/重复finding。
- 采样中节点替换、layout/scroll/value变化、目标被覆盖：unknown；不按旧坐标继续。
- 恰好不足action预算时不执行半套采样；每个点击（含重置）计数，最多8次；tool/run取消后无迟到操作。
- 只读调查触发写入/弹窗/跨域拦截，记录intervened，不形成supported/refuted；finally恢复原策略。
- 普通点击不能使用force、脚本聚焦/失焦、模拟事件或改样式；以真实浏览器动作记录验证。

### G3：证据、评分器、展示和持久化

- 只有typed focus receipt才能提升本类发现；改标题、旧findings_submit、引用他run证据或普通snapshot都不能绕过。
- 模型描述与被测目标错误绑定、私有真值不符、过短窗口、已聚焦假阳性、无基线/无复测/坐标外溢等伪造record必须被评分器拒绝。
- 原图hash不变；标注点与CSS坐标映射一致，失败点不得被全框“遮挡”结论替代。真实截图目视复核D0/H0/H1各一份。
- Web通过实际报告API展示原图/派生图/逐点结果/未知原因；刷新后不丢，缺文件显示缺失而非空白成功。
- 停服后新DB连接比对事件、hypothesis、finding、artifact和完整历史，文件逐个校验byte/hash。模拟丢中段、复用seq必须失败。
- 视觉模型异常/未知usage计入预算和记录；不把固定模型预检写成真实模型发现成功。

P1只要求其中与最小闭环相关的明确子集，逐项标记，不把部分G项当全部通过。P3结束必须全部通过，才允许真实诊断。

## 4. 真实模型诊断（G4）

沿用固定DeepSeek agent、Qwen vision、Alibaba提供方和现有有限Jev配置。视觉定位与主动扫描都纳入Qwen用量，原始截图确实作为图像发送；smoke须验证模型可返回schema有效的视觉候选，不能只测文字问答或定位。

统一目标示例：“检查本次购物流程的界面与交互体验，完成一次正常购买；记录有证据的问题和未验证范围。”新能力开启，但不能在目标里点名搜索框、留白、聚焦或故障答案。可以向Agent说明通用focus_probe工具何时适用，这是能力说明而非case提示。

D0/H0/H1各一次。D0须自主提出相关候选并调查；H0必须完成实际探针并refuted，H1不能误报。每例均正常购买成功、显式finish、假设状态和覆盖报告一致。smoke加三例全部通过才能进入G5；失败先读证据定位，不直接堆完整矩阵。

必须保留Qwen候选原始响应、发送图像hash、DeepSeek语义绑定依据、工具/动作/模型时间及调用数。不要记录或展示额外的内部推理全文作为产品“解释”；可核对的工具选择、候选依据和证据足够。

## 5. 正式18轮与原业务回归（G5）

### 新能力18轮

六例各3次，单一clean commit、相同完整build hash、固定模型及提供方，无case之间学习/修改提示/注入新规则。每run独立浏览器和业务状态，私有reset验证成功后才开始下一轮。

通过要求：

- D0/D1/D2共9次均有至少一个对应真实问题的supported finding及完整证据；未发现记漏检，不能记“无问题”。
- H0/H1/H2共9次该类supported为0；H0三次均必须由真实视觉候选触发完整探针并refuted，不能用“没查所以没误报”过关。H1/H2允许没有合理候选，记录有限观察范围，不宣称穷尽所有问题。unknown不是证明健康，健康样本必须无未解决的相关假设/视觉覆盖缺口并正常结束。
- 18次正常购买均符合原C0真值、写入预算、归属与显式finish；视觉warning不能抹掉真实成功，未测量疑点不能冒充已完成。
- 每轮视觉调用≤2、候选≤2、每候选探针≤1（复用不重新点击）、探针每次≤8普通点击，总动作≤40、共享模型调用≤30、总时限≤300秒。
- 每个supported必须来自真实Qwen候选+真实DeepSeek选择+真实Playwright测量；不得由私有fixture直接灌入候选/工具参数，不得预加载等价规则。
- 所有18行、图像、测量、真假结果、费用和未运行原因完整保存；停服审计与所有artifact hash通过。

### 旧能力回归45轮

在相同最终构建显式关闭视觉扫描，运行既有业务诊断与完整A/B/C/D矩阵，共45轮，原score、原批准来源不变。manifest必须明确新开关为0，避免调用者env污染旧基线。新18轮开关为1也必须记录。

这是本轮最终候选的一次兼容性验收，不要求每个开发阶段跑45轮。任何影响提示、工具、执行/证据/完成或模型参数的修改都需重新冻结并重跑新18轮和受影响的旧45轮；仅文档更正可复用构建hash一致的结果。不得拼接不同版本样本凑数。

### 费用与失败处理

新旧runner共用明确campaign台账：包含新smoke/诊断/18轮和旧诊断/45轮，已知费用与未知预留均计入；不能每个子runner重新获得完整预算。遵循用户当前费用授权，另以VALIDATION_MAX_COST_USD设置技术性保护，默认整个新campaign $2。到限先核算并记录，不能记通过；既有授权范围内可显式提高技术上限，不伪造新的用户批准。

正常质量失败保留并继续可安全完成的预定样本，整批失败。失去隔离、未知副作用、持久化不一致、取消或费用保护触发立即停止，其余行not-run；不能自动reconcile或reset后续跑。提供方异常与产品失败分别分类，但都不能从通过率分母中删除。

两次相同机制的诊断失败后，dev应提交具体机制、最小复现与修复候选给主Agent review，先完成不受阻工作；不无限付费重跑碰运气。用户授权持续完成不意味着可降低门槛。

## 6. 保存协议与最终判定（G6）

目录 `data/visual-focus-validation/<timestamp>/`，至少包括：

```text
manifest.json             base/head、完整build/protocol hash、模型/provider、flags、预算
protocol.json             私有case矩阵版本、viewport、公开任务文本hash
runs.jsonl                全18行（诊断为3行），含not-run与失败原因
<case>/<repeat>/record.json
artifact-index.json       原图/派生图/候选/测量的来源、byte、SHA-256
requests.jsonl / ledger.jsonl   脱敏请求计量与已知/未知费用
scoreboard.json            每项独立断言、漏检/误报及分组门槛
persistence-audit.json     停服数据库比对及缺失文件检查
campaign-summary.json     新旧批次引用、合计费用，不重复计算诊断
```

最终accepted要求G0–G5全部通过、主Agent完成代码/证据review、G6交接可复现。归档所有失败；主Agent负责必要更正与main合并，dev不能自行宣布主Agent已认可。

报告耗时给出全部18轮分布、视觉/Agent/工具分项及campaign墙钟；失败也计入统计。没有“必须更快”的门槛，也不得把训练案例上的成功表述为任意网站召回率。
