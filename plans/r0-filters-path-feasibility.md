# Filters 检查路径可行性：取证可行，完整效果路径尚未确立

依据健康 overlay 原第11请求，run `run-2f9f51f3-a7f7-4f22-8f4d-6325de29c0ad`，状态截止事件seq209。只读原公开输入、工具定义、截止前回执和截图；另只取原第11次模型输出的工具名称/参数定位选择，没有采用其后的页面结果。未读产品源码、私有评分答案，未执行工具、浏览器或模型，新增费用0。A/B批次保持关闭。

**结论：目前可以列出具体、合规的取证前缀；公开材料不足以确立一条完整、可核销原Filters事项的效果检查路径。** 缺的主要是公开效果关联，以及“未知效果的先行探索动作不结清原事项”的接口/许可保证。不是按钮找不到或被遮挡；也不是已经证明运行时绝无其他通路。

## 当时已知与缺失

| 层次 | 事实及来源 | 不能据此推出 |
| --- | --- | --- |
| 第11输入明确携带 | s8/e47，button“Filters”，visible/enabled=true；最新9.0摘要有CSS `html > body:nth-of-type(1) > span:nth-of-type(1) > button:nth-of-type(1)`，5/5自命中、0遮挡 | 抽样正常不等于真实点击成功，更不等于功能效果成功 |
| 已选义务 | `item-4db05551-3b79-40c5-98bb-195f1bd301a5` pending；seq188以same-connected-node将原s1事项续接到s8/e47；About链接也待办 | localSampling.remaining=0是选样容量，不是已完成；不能先离开此页豁免Filters |
| 效果与规则状态 | Sort/Apply已有测量；Filters在截止前没有action/verification，recoverableInteractions=[]。已交付适用规则只有自动hit testing，catalog另两项被判不适用 | 无checkRef可恢复；不能自造Filter规则、事件或把无误报当完整检查 |
| 原9.0可检索 | seq209原element_details回执含 `id=filters,type=button`，该原回执未给出aria-controls、aria-expanded、title等效果关联；这些属性没有出现在最新摘要 | 保存过原属性不等于本次模型显式收到；按钮id不是结果区id，type=button也不是完整副作用证明 |
| 原4.0可检索 | seq103曾读到section，CSS `html > body:nth-of-type(1) > section:nth-of-type(1)`，text“Available products”，exists=true/displayed=false；第11历史窗口只含5–8，4.0已在窗口外 | 这是旧的候选反馈区域，不是当前状态，也没有证实它受Filters控制；不能要求点击后它必然显示 |
| 原8.0可检索 | seq203的body *首12/21节点，nextOffset=12；原A摘要省略了查询及游标，修复B恢复这些字段 | 后9节点的具体内容/当前状态不可倒推；恢复游标没有恢复效果语义 |

截止前截图只显示普通“Filters”按钮，没有展开箭头、关联区域说明或预告结果。当前缺：Filters公开承诺的具体效果、对应结果区域/语义、可据此设立的测量预期；真实操作后的变化和原事项验证关联当然也尚不存在。原冻结余量17动作、20模型调用、70.253秒，只是当时预算，不保证下面多轮路线能在真实时限内完成。

## 现有公开读取能取得什么

| 具体工具/参数 | 参数依据 | 可取得与限制 |
| --- | --- | --- |
| `tool_result_read({resultRef:"9.0",offset:0})`，后续跟本工具返回的nextOffset | 最新回执明确提供9.0 | 取回完整按钮属性/命中；原记录已经表明无ARIA效果关联。游标是JSON字符位置，不是DOM项号 |
| `page_inspect({selector:"section, form, fieldset, [role], [aria-live], [aria-controls], [aria-expanded]",offset:0})` | Filters待办；工具公开支持非交互反馈、CSS、角色、文字与几何。这里用通用反馈类型，不猜测试id | 找当前候选结果区、可见性、文字和结构；分页只跟此次返回的DOM nextOffset。属性选择器可检索匹配节点，但该工具不返回任意属性值，也不证明因果/需求 |
| `history_read({start:4,count:1})`，必要时读返回的原`4.0`引用 | 当前窗口start=5，4是最近一条窗口外历史；归档确认其回执存在 | 恢复早先隐藏section线索；不当成实时读数。不是盲猜未来选择器 |
| 修复B可提 `page_inspect({selector:"body *",offset:12})`；原A需先取8.0恢复查询/游标 | 原8.0实际args/nextOffset | 读取剩余DOM，避免重复首12项；本分析未执行，不预填其返回内容 |
| `rules_search({query:"Filters",offset:0})`，仅用真实返回ruleId调用rule_details | 公开按钮名及启用规则查询接口 | 可能找到已批准、确实适用的声明；当前无该查询回执，不能宣称存在或不存在对应规则。规则若不适用不能补成要求 |

读取工具可以发现或恢复候选事实，**不能保证制造出页面没有声明的效果关联**。`element_details({refs:["e47"]})`也是合法读取，但9.0刚做过该查询且当前已知缺的是完整原回执，应先取原引用而非重复采样；再次调用不能凭空创造ARIA关系。`probe`只测试可操作性，正常结果不能代替功能效果。

## 动作、动态结果与结束门

已知动作目标可写成 `page_act({type:"click",ref:"e47",role:"button",name:"Filters",verify:…})`。但verify必须检验公开宣传的效果；当前不能诚实填写“Filters应使Available products section可见”的basis。不能改用按钮获得焦点、body继续存在等无关不变量完成原事项。

如果公开读取确立了结果槽P及其预期，例如页面自己明确声明某控制会展开P，则接口能够表达：已知控制目标click → `binding:"post-action"`的P → `bind_results` → `measure(after)` → 对P的`displayed`等公开预期作比较。节点重建和真实pass/fail未知不妨碍这个流程；它不要求提前知道实际测量结果。page_act.verify的visible/expanded-equals也可表达适当的简单效果，失败可按真实证据保留，不要求必须通过。

**完全未确定的反馈不能靠post-action绑定自动变成已知。** 原investigation_run在调用前就要求targets、selectors、非空assertions；steps只有act/wait/bind_results/measure，没有“act后page_inspect，再按新返回值动态声明targets”的步骤。bind_results只读已声明选择器的当前节点，不替Agent发现任意结果区域或推导需求。

最低1条assertion本身并不排除仅检查前置条件的程序，act也没有page_act.verify字段。故不能仅凭schema说“任何探索点击都不可能”。但schema合法不等于当前UI政策授权，更不等于Filters验证：**仅前置条件的探索程序能否保证原事项保持pending、之后再关联真实效果，当前公开定义和该前缀回执没有给出足够保证。** 本案没有Filters调查程序/原事项关联回执作为通路证明，不能把这一不确定分支写成现成完整路径，也不能拿占位断言绕过原完成门。

这区分了两种“未知”：实际结果值未知但公开预期/结果槽已知，没有循环；若连效果关联和结果槽语义都需首次点击才获知，而普通点击又要求先有postcondition，且不计完成的探索接口未获确认，就有局部循环/衔接不清。这里缺的是这层保证，不是要求模型预知真实结果。

## 当前最短有依据的前缀及阻断位置

1. **已知事实/原事项**：保留上述itemId，目标用已有e47/role+name；不重新选择或删除义务。
2. **仍需读取**：从9.0取完整属性（如有新片段只跟返回字符游标），再用上表定向page_inspect查当前反馈结构。已存9.0没有效果关联；第二步尚未执行，不能假定能补足。旧4.0或修复后的DOM offset12是合理替代取证路线，不必全部执行。
3. **操作门**：若新公开事实确立了效果关联，再填有据的verify或调查程序并正常非强制点击；**目前到这里不能声称已形成有效调用**。若关联仍缺，不以Available products的邻近位置、焦点或页面存在充数。
4. **验证/关联门**：有真实操作后，读执行器保存的测量和`verification.itemId`，确认仍指向原Filters事项；unverified须保留。仅当实际回执提供checkRef时才可interaction_verify，并保持原动作/预期，不能新造checkRef或事后偷换条件。investigation_run公开输入无itemId/checkRef字段，不意味着实现绝无自动关联，但目前没有本案证据保证它完成原事项。
5. **当前结论**：上述是可核对的取证前缀＋明确未闭合的操作/关联门，**不是验证通过**。没有关联证据时Filters仍pending；exploration_update不能手工标verified，真实阻断不能忽略，导航义务也保留。

原第11次选择`page_inspect({selector:"body *",offset:0})`偏离的是最短取证路线：没有取被省略的8.0/完整9.0，也没有定位反馈结构。原A没收到nextOffset=12，不能说它“明知12却不用”，更不能据此断言它本应立即点击Filters。影子A4的定向结构读取、B的原回执检索均是合理替代；也不能假定任一选择已获得足够效果依据。前面的介面缺口与模型取证偏离可同时存在。

**唯一后续建议**：一个免费的确定性接口反例，只核对“已选、可定位、效果尚未知的控件，是否能有据地作一次证据收集性操作，并保证未取得效果测量前原事项保持pending，之后能关联真实测量”。不加入占位后置条件，不改完成门，不调用真实模型；若既有接口不能表达或会提前核销，先确认这一具体契约衔接，而不再补记忆或重跑付费探索。本轮不执行该验证。

来源摘录与摘要：`plans/evidence/r0-filters-path-analysis.json`；本地公开证据摘录 `data/r0-filters-path-analysis-20261008/`。产品、R1、Roadmap、原失败和已关闭A/B批次未改，交付后停止。
