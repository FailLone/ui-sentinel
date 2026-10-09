# 图片实验截图自扰：本地因果对照与最小修复

2026-10-09（Asia/Shanghai）。**已通过确定性本地单因素对照证实：默认截图隐藏光标的样式写入会推进全局 DOM epoch，使未变化的图片被标为不稳定。** 图片实验现显式使用 `caret:'initial'`，移除这项自扰。此结论仅针对本地机制，**不是三页公网复验，也不改变上轮 0 facts-ready 结论**。

基线 `f33934307fb31d3680ce255fe49e51c0959b91c0`；实现提交 `46cc7c035b87f5b69469f66563b86d37f71f72cb`。继续使用独立分支 `codex/rule-image-proportion`，开始时工作区干净。保留 [DNS 合入与三页采集](image-binding-public-doh-validation.md)、[旧系统 DNS 失败](image-binding-public-validation.md)及所有原始材料。没有合入 main/R0/R1、修改其他工作区或维护者 Roadmap。

## 修复前先验证因果

复用 `evaluation/fixtures/image-shape.ts` 的静态 PNG 与 HTML，小型本地 HTTP 页面只增加 input、textarea、contenteditable 三个普通编辑控件。经已有 `launchBrowser({uiScan:true})`、本地夹具授权的网络边界、被动图片资源收集器和 `observePage` 访问。没有网站脚本、定时更新或外网请求。

在修改生产代码前，用两个独立页面对照；唯一变量为 screenshot 的 caret 选项。因当时 observePage 尚无该参数，对照脚本仅包装 Page.screenshot 向原方法补入 `caret:'initial'`，不替换观察器、不暂停/重置 epoch、不改 DOM。每次先读取原图片事实，再安装只记录的 MutationObserver，执行已有观察路径，最后读取图片事实与完整 MutationRecord。原始脚本、结果及摘要见[本轮证据索引](evidence/image-caret-control-20261009.json)。

| 修复前对照 | MutationRecord | epoch 前→后 | 图片 document/node 身份与绘制事实 | observePage stable |
| --- | --- | --- | --- | --- |
| 默认截图 | 6 条属性变更 | 0→2 | 不变（比较时仅剔除 epoch） | false |
| 仅补 caret:initial | 0 条 | 0→0 | 不变 | true |

6 条变更全部是 `input`、`textarea`、`editable` 的 `style`，每个目标各两条。记录到先设置 `caret-color: transparent !important`，再恢复原色；没有 img 目标变更。每页图片仅请求一次，两页共两次。PNG、snapshot 和资源字节均由现有证据路径产生。

这是对上一轮源码推断的因果验证；不能回溯证明此前 Commons/GitHub 的每一次 epoch 变化都由截图引起。公网页面仍可能存在自身变化，历史记录不重写。

## 最小实现范围

- `src/execution/browser.ts`：`observePage` 新增第五个可选参数，仅接受 caret 选项。省略时保持 Playwright 原默认行为；全页/视口、缩放、证据保存与采集顺序不变。
- `src/experiments/image-bindings.ts`：候选 observe 和 check 内的重新观察两个调用点显式传 `{caret:'initial'}`。两处都必须接入，否则初次采集稳定，消费时仍会被截图自己失效。
- 无其他生产调用点变化，R0 调用仍采用原默认。未修改 MutationObserver、全局 epoch 比较、目标/资源/证据归属与摘要、期限、网络干预、规则绘制算法或保形意图来源；规则继续默认关闭。

修复移除的是截图主动隐藏光标的样式写入；不冻结真实光标、页面动画或输入状态，不声称所有截图实现都绝无副作用。保留初始光标意味着真实聚焦控件的光标可能出现在截图中，这是保留现场的预期行为。

## 实际定向检查

[现有测试文件](../../src/experiments/image-bindings.test.ts)新增 5 个最小场景，复用同一服务器、图片、网络边界和合成合同。只筛选这些场景及 3 个受影响的既有防护场景；**8 passed，6 skipped，3.07 秒**。未运行完整图片套件、DNS 62 项、R0 或公网观察。

| 场景 | 实际结果 |
| --- | --- |
| 省略新参数的默认对照 | 仍为 6 条 style 记录、epoch 0→2、stable=false，确认其他调用默认行为未变 |
| 显式 initial 对照 | 0 条记录、epoch 0→0、stable=true |
| 图片实验静态 observe→check | facts-ready；epoch 0→0，0 条记录；既有合成保形合同得到 pass |
| 图片真实变化 | 明确改变 `#mark` 宽度240→260；记录1条 style，epoch 0→1；check 为 unknown / observation-facts-changed |
| 无关页面真实变化 | 只改 `#editable` 的 title；记录1条 title，epoch 0→1；图片身份、资源及绘制字段不变，仍按原策略 unknown / observation-facts-changed |
| 复用：资源 URL / 同 URL 字节变化 | 拒绝旧确认；不复用旧 SHA |
| 复用：过期、被替换、证据被改/丢失 | 原有失效处理通过 |
| 复用：独立宿主拒绝写请求 | 原有网络干预仍阻止有效绑定，写请求未到达服务器 |

静态场景的 pass 只使用已有合成夹具作者为该圆形标记写出的保形要求，不是公网图片依据、人工审批或规则准确率。候选导出中的 confirmedBy 仍为 null；测试消费时显式使用合成合同，未新增保形来源或占位审批。

静态 observe 与消费复核各保存一张截图和一份资源证据，测试核对 PNG 文件头、资源 bytes 与原合成 PNG 完全相同、SHA-256 一致；结果引用均能在现有 report artifacts 中找到且 available。两次观察只发生一次浏览器图片请求，没有补抓。原始截图与 MutationRecord 另存本轮本地材料。

执行命令（未重新运行未选中的场景）：

```sh
IMAGE_CARET_EVIDENCE_DIR="$PWD/data/experiments/image-caret-20261009-f339343/directed" \
URL_SCAN_DNS_MODE=system pnpm exec vitest run src/experiments/image-bindings.test.ts \
  -t 'caret|refuses changed resource URLs|identifies expired|uses the independent host'
pnpm typecheck
```

类型检查通过；三个修改文件的 Biome 格式处理与 `git diff --check` 通过。Node 24.21.0、Playwright 1.63.0。没有构建/重装依赖、真实模型调用或付费调用。

## 剩余门槛与最小后续顺序

依据上一轮既有资料，第二批 58 个目标仍有如下历史结论，**本轮没有更新其数量或预测修复后事实就绪数**：58/58 大文档可见性未测、58/58 证据受网络干预、53/58 当时被标不稳定；26 个目标仅合同机器字段齐全。仍不具备据此默认启用规则或开展自动语义绑定实验的条件。

建议后续按以下顺序分别立项，不在本轮实施：

1. 先解决大文档中的目标可见性证明能力；最小范围是已有 PNG/JPEG、当前视口内目标的有界测量，无法证明时继续 unknown，不简单删除600节点限制制造支持。
2. 再评审网络干预能否按目标证据依赖区分影响。必须保留来源拒绝与审计，不把遥测拒绝一律忽略，也不扩大白名单。本轮无法证明这些干预对每个目标均无影响。
3. 在机器事实有可消费样本后，再提供不要求语义声明的只读绑定诊断；依然验证目标、资源、证据与期限，返回绑定事实而非规则 pass/fail。当前接口缺口完整保留，不填虚假声明绕过。

只有上述基础得到验证后，才讨论具体目标的公开保形依据与自动语义绑定。无关 DOM 变化仍按当前全局 epoch 策略失效，本次负例明确证明未放宽。

## 证据留存与停止点

本地材料目录 `data/experiments/image-caret-20261009-f339343/`：修复前 causal-before 脚本/JSON/独立数据库/日志，修复后5个新场景的 MutationRecord、候选/结果和截图/源字节副本，定向测试与 typecheck 日志。常规测试临时 artifacts 已照原约定清理，交接副本保留；索引逐项记录路径、大小、SHA-256 与关键对照结果。

随 Git 提交的是代码、定向测试、本报告和小型证据索引。大文件/原始完整记录位于被忽略的 data 目录，**未随 Git 交付，本机可访问不等于其他机器已取得**。旧公网实验与 DNS 来源没有覆盖、移动或删除。

只提交本规则分支，不推送、不合并其他分支；没有创建或消息其他 Agent。完成后停止，不自动启动上述后续开发。
