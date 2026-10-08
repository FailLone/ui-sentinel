# DNS 兼容能力交接

交付日期：2026-10-09（Asia/Shanghai）。代码、定向验证和操作资料已交付；**62 项确定性验证通过；系统模式公网观察 0/3 完成；随后按授权阿里 DoH 配置完成 3/3 真实页面观察**。不能将本次结果计入 R0 或图片规则验收。

## 提交与工作区

- 工作区：`/private/tmp/ui-sentinel-network-dns-compat`
- 分支：`codex/network-dns-compat`
- 基线：`2ac24efab18f7704f5c0b2b7bd74cf1f22ef94f8`。开始时主工作区 `3bfecce` 与规则分支 `36247ff` 的共同提交；相关网络代码与主工作区一致，避免引入后续不相关实验。没有合并 R0/R1/规则分支。
- 实现提交：`6566d568f5cd1bbe9b6afaef1b12a4b90463288a`，含配置、DoH、扫描链路接入、诊断、测试、固定公网验证脚本和使用文档。
- 本文与小型证据索引在随后的 `docs: record DNS compatibility validation and handoff` 提交。原文档提交为 `3725f77`；后续 DoH 结果在本分支 `docs: record authorized AliDNS public observations` 提交。用 `git log --oneline -3` 查交付提交，最终工作区 tracked/untracked 均干净；`data/` 和 `dist/` 为未提交的忽略项。
- 未合并、未推送。主工作区的 `docs/product-roadmap.md` 等已有改动未触碰。没有改 R0 门槛/费用/历史证据、R1 调度、图片规则及其启用状态、操作系统/VPN/路由/代理配置。

## 能力、配置与恢复

详见 [使用与安全契约](../docs/network-dns-compat.md)。默认 `URL_SCAN_DNS_MODE=system`，仍走系统 getaddrinfo；显式 `doh` 模式只向部署者指定的 HTTPS 解析服务发送精确域名清单中的查询。无自动模式切换、备用解析器、隐式重试或普通代理适配。

```sh
cd /private/tmp/ui-sentinel-network-dns-compat
# 使用受支持的 Node 22/24；本次为 Node 24.21.0、pnpm 10.17.1
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

按 `.env.example` 配置。DoH 的三个必填值：

```dotenv
URL_SCAN_DNS_MODE=doh
URL_SCAN_DNS_TIMEOUT_MS=5000
URL_SCAN_DOH_ENDPOINT=https://resolver.example/dns-query
URL_SCAN_DOH_BOOTSTRAP_ADDRESS=<部署者核验的单个IP>
URL_SCAN_DOH_ALLOWED_HOSTS=www.example.org,cdn.example.org
```

模板不能原样执行；必须由部署者提供实际可信服务，不能以任意公共供应商代填。新模式不默认启用，URL 扫描原有功能开关也不改变。bootstrap 只授权解析服务连接，TLS 保留 endpoint 域名；它不会放宽目标地址策略。API/网页/模型无法改变这些参数。

恢复：设置 `URL_SCAN_DNS_MODE=system`（或删除该变量），重启应用。无需改系统 DNS/VPN。系统模式不使用 DoH 端点、bootstrap 或域名清单。

不支持企业内网授权、专有合成地址通道、品牌 VPN 适配、域名分流、HTTP/SOCKS 通用代理、企业证书管理、resolver 认证或多解析协议。取得公网 IP 也不保证本机网络能直连，失败后不自动扩展代理/路由项目。

## 地址如何约束连接

创建预检及实际 CDP session 都读取同一部署解析配置。每一主文档、重定向和允许的资源请求：来源/方法检查 → 解析全部 A/AAAA → 原有全量地址检查 → 选定一个已检查地址 → Node request 的固定 lookup → CDP fulfill。Node 不自动跟随重定向，下一跳重新检查。任何受限地址使整组拒绝，不能挑选公网地址掩盖混合回答。

浏览器自发网络仍由拒绝代理/通道限制兜底；不存在让 Chromium 在检查后再自行解析的连接路径。原 Host、TLS SNI、证书身份验证保留，强制 TLS 验证。截图/DOM 证据不独立联网下载。成功记录的 `connectedAddress` 是 socket 远端地址，失败时仅有 `selectedAddress` 表示尝试值。

## 定向验证

最终成功日志分别保存；没有重跑全套 R0 或其他规则测试。

| 集合 | 最终结果 | 实际覆盖 |
| --- | --- | --- |
| resolver + API request + 既有 pinned TLS transport | 51/51 | DoH bootstrap、SNI/Host、A/AAAA、CNAME、受限/混合地址、服务不可用、超时、格式/问题/rcode/TC/MIME/超限/重定向拒绝、双族取消、无回退、TLS 错误；真实 Chromium 取本地夹具页面与资源拒绝；请求体不能注入配置。 |
| session-dns + boundary-dns + admission address | 9/9 | 公网地址精确传入固定传输、IPv6-only、重绑定后拒绝、连接/TLS/超时诊断、无 fulfill/重试、取消、网络错误持久化并阻止成功 settle、创建预检使用部署解析器及混合回答拒绝。 |
| 既有 system session 两条相关回归 | 2/2（另 9 条未选） | 默认系统模式的同源重定向与 query 保留；子资源重定向越界拒绝。 |
| `pnpm build` | 通过 | 全项目 TypeScript 检查及服务端/工作台/既有两个 arena 打包。 |

共 **62 个定向测试通过**。本地证据分别为 `targeted-authorized.log`、`integration-final.log`、`system-regression.log`、`build-authorized.log`。初次沙箱监听 EPERM 导致测试/tsx 打包无法执行，授权本机重跑后通过；新增测试的 beforeEach 曾误返回 mock 清理函数，修正后集成用例通过。这些初次失败不作为通过证据。固定地址真实 socket 测试使用已有显式本地 fixture 授权，公网地址准入到 transport 参数另以确定性接口测试证明；没有声称本地 fixture 等于真实公网连通性。

依赖审计未列新增 dns-packet 5.6.1 / ip-codec 2.0.5 问题；全项目仍有 4 moderate、9 high 既有依赖告警，未扩大范围升级。开源选型、版本、许可证、官方来源、未选 dns-query 的理由及维护事项见使用文档。

## 三页公网观察

执行时间：2026-10-09 00:15:16（北京时间）。每页单次尝试，没有失败换页或重试。Node v24.21.0，模式 **system**，实现构建 `6566d56`，tracked diff 为空。编译后的观察入口 SHA-256 为 `0f2f101ee3ac18bb0e730fa9c6bd685bcf97171e8acfabdbf27d2bb463c08723`；服务端构建 SHA-256 为 `adb44e737dfa540fd06cc4e93af2e4e16c31e168af5371619a001d5dd6fa02ba`。脚本使用与产品同源的 launchBrowser、session 和 transport，未启动模型执行器。

| 固定页面 | 请求当时 DNS 回答 | 地址/连接结果 | 真实观察 | 整页尝试耗时 / 请求决策耗时 |
| --- | --- | --- | --- | --- |
| https://commons.wikimedia.org/wiki/File:PNG_transparency_demonstration_1.png | 198.18.228.47 | `address / private-address`；未建立目标连接 | 未完成 | 189 ms / 13 ms |
| https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images | 198.18.228.52 | `address / private-address`；未建立目标连接 | 未完成 | 164 ms / 7 ms |
| https://github.com/python/cpython | 198.18.1.109 | `address / private-address`；未建立目标连接 | 未完成 | 150 ms / 6 ms |

198.18/19 为原策略拒绝的特殊/合成地址范围，不是已验证公网地址。此次直接记录请求时回答，非事后 DNS 推测。每页只有一次主文档拒绝；无重定向和子资源请求到达检查阶段，因此相关资源行为为**未观察**，不能写成“资源全部通过”。没有 screenshot/DOM snapshot、UI 发现或图片语义检查。

`trustedOrigins=[]`；资源 origin 与用户指定的前次实验一致：Commons upload/meta.wikimedia.org；MDN mdn.github.io/interactive-examples.mdn.mozilla.net；GitHub github.githubassets.com/avatars.githubusercontent.com/user-images.githubusercontent.com/raw.githubusercontent.com/camo.githubusercontent.com。均 HTTPS，无 dataOrigins 授权。未为“全绿”扩大范围。

## 已授权的 DoH 公网验证（独立于旧系统结果）

旧文档 `3725f77` 当时缺少解析服务配置，此限制现已解除。用户随后明确授权阿里公共 DNS `https://dns.alidns.com/dns-query`、bootstrap `223.5.5.5`，以及下列精确域名。配置仅通过本次命令的环境变量传入，未写入 `.env`、产品默认值或机器网络设置。

```sh
export URL_SCAN_DNS_MODE=doh
export URL_SCAN_DNS_TIMEOUT_MS=5000
export URL_SCAN_DOH_ENDPOINT=https://dns.alidns.com/dns-query
export URL_SCAN_DOH_BOOTSTRAP_ADDRESS=223.5.5.5
export URL_SCAN_DOH_ALLOWED_HOSTS=commons.wikimedia.org,upload.wikimedia.org,meta.wikimedia.org,developer.mozilla.org,mdn.github.io,interactive-examples.mdn.mozilla.net,github.com,github.githubassets.com,avatars.githubusercontent.com,user-images.githubusercontent.com,raw.githubusercontent.com,camo.githubusercontent.com
# 从已安装依赖的规则工作区执行，保留原实验的资源来源配置
node --import tsx scripts/validation/network-dns-public.ts
```

本次没有重跑命令中的源码入口，而是复用该入口在上轮生成的 **相同 SHA-256 编译产物** `data/network-dns-compat/public-observer.mjs`。执行时 HEAD 为 `3725f770e3ba39587fc0eb9c95d763370a788171`，tracked diff 为空；代码仍为 `6566d56`。先逐项核对上轮日志/产物哈希，以及 src/scripts/package/lock 无差异；观察入口、服务端 SHA-256 和 Node 版本与上文一致。没有安装、重建或重跑 62 项测试，也没有修改代码或补救性重试。

时间：**2026-10-09 00:22:22—00:22:36，北京时间**。三页各一次导航，均取得成功 HTTP 主文档响应、DOM 摘要和 1280×768 截图。表内耗时为整页尝试（含启动、1500 ms 有界观察、截图与关闭）/主文档网络决策。

| 页面 | A 回答 | AAAA 回答 | 选定 / 成功 socket 地址 | 观察与耗时 |
| --- | --- | --- | --- | --- |
| Commons 原固定页面 | 103.102.166.224 | 2001:df2:e500:ed1a::1 | 103.102.166.224 / 103.102.166.224 | DOM+截图完成；3093 / 604 ms |
| MDN 原固定页面 | 151.101.89.91 | 2a04:4e42:15::347 | 151.101.89.91 / 151.101.89.91 | DOM+截图完成；5215 / 1339 ms |
| GitHub CPython 原固定页面 | 20.205.243.166 | 无 AAAA 地址（该族响应有效） | 20.205.243.166 / 20.205.243.166 | DOM+截图完成；5250 / 1055 ms |

三页 A/AAAA 回答均通过既有地址策略。解析服务的 HTTPS bootstrap/SNI/证书校验成功，否则本实现不会返回可用地址；该结论来自固定传输成功，不伪称日志中有独立 resolver socket 明细。目标 HTTPS 连接成功，未发生解析、目标连接或 TLS 失败。全部完成响应 **289/289** 均满足 `connectedAddress == selectedAddress` 且属于当次检查的 `resolvedAddresses`。IPv6 回答经过地址检查，但实际选择 IPv4；没有据此声称真实 IPv6 连通性。

| 页面 | 完成响应（含主文档） | 策略拒绝 | 观察结束主动取消 | 具体原因 |
| --- | --- | --- | --- | --- |
| Commons | 48 | 16 | 2 | `thumb.wikimedia.org` 15 个图片请求及 `auth.wikimedia.org` 1 个脚本请求均 `resource-origin-denied`。后者是页面自动产生的脚本重定向，从同源 `Special:CentralAutoLogin/start` 转向 auth 域时被拒绝；没有执行登录操作或提供凭据。结束时取消 2 个同源脚本读取。 |
| MDN | 67 | 4 | 4 | `incoming.telemetry.mozilla.org` 3 次 POST beacon 为 `unsupported-channel`；同源 `/pong/get` POST XHR 为 `unsupported-data-method`。均在发送前拒绝。结束时取消 3 个脚本和 1 个图片读取。 |
| GitHub | 174 | 2 | 21 | `collector.github.com` 2 次 POST beacon 为 `unsupported-channel`。结束时取消 avatars 域 19 个图片、githubassets 域 1 个脚本及 1 个仍在解析的样式请求。 |

总计 338 条决策：289 完成响应、22 策略拒绝、27 `finalizationShutdown` 取消。取消由已有观察收口主动触发，不能归类为远端连接/TLS 失败。所有策略拒绝发生在解析前，没有向阿里 DNS 发送这些未授权来源的查询；没有扩大 origin 或 DNS 域名清单。除 Commons 上述脚本重定向外，没有记录到其他重定向。完整拒绝 URL、地址集合、阶段和耗时在原始 JSON，小型索引保留主要汇总和拒绝明细。

截图核对：Commons 显示文件标题与骰子主图；MDN 显示 Responsive images 教程；GitHub 显示 python/cpython 仓库。DOM 中分别记录 2415/1610/2723 个元素、26/5/25 个 img 元素，**这是观测时 DOM 数量，不是图片已加载数量、候选数或规则覆盖率**。没有运行语义检查、点击、滚动、登录或表单提交。三页真实观察通过不等于资源全部加载、扫描验收完成或网站无缺陷。

### 给规则 Agent 的明确结论

**可以用上述显式配置继续原公网实验。** 此次已证明本机在原有来源限制下能够取得这三页的真实观察，不再因系统 fake-IP 在主文档阶段阻塞。继续使用原资源白名单、匿名浏览器和固定传输，不必加私网 fixture 例外。Commons 被拒的缩略图、GitHub 尚未完成的头像等仍可能影响候选覆盖，必须在规则实验中逐项报告缺失/干预，不能将其判为页面或图片规则失败。

下一步最小动作是应用实现提交、设置这组进程级变量后恢复原实验协议；本 DNS 任务不代跑规则实验。若原协议需要更久的页面稳定观察，应由规则实验记录观察时点与取消状态，不能以无条件“全资源通过”替代。当前证据不要求代理/路由改造，也不保证所有企业 VPN、长期解析结果或公网 IPv6 可达。恢复系统模式的方法不变，恢复后本机已有 0/3 特殊地址拒绝证据仍成立。

## 免费与证据交付

没有模型调用、付费 API 调用、图片语义检查、登录、表单提交或业务写操作。执行的是确定性本地测试，以及固定页面的受限只读导航尝试。主文档未取得时不产生扫描成功声明，也没有 UI 缺陷或规则失败结论。

随 Git 提交的小型索引：[docs/evidence/network-dns-compat.json](../docs/evidence/network-dns-compat.json)，含旧系统三页网络记录、新 DoH 三页地址/拒绝/观察汇总、测试统计、构建标识、审计摘要和本地文件 SHA-256/大小。

**未随 Git 交付**：`/private/tmp/ui-sentinel-network-dns-compat/data/network-dns-compat/` 下测试/构建/审计日志、编译观察入口和 JSON 原始结果；`dist/` 构建输出也未提交。新增 DoH 原始 JSON 284,653 B；截图 Commons 257,046 B、MDN 256,919 B、GitHub 168,587 B，均位于 `public-doh/`，未随 Git 提交。没有视频。`/private/tmp` 是本机临时存储，需长期留存时由交接方复制该目录；旧系统原始三页决策及新 DoH 的观察/地址/拒绝摘要已在 Git 索引中保留，不依赖临时目录才能读懂结果。

## 规则 Agent 如何应用

在规则 Agent 自己工作区先检查 `git status --short`，处理自己的未提交内容，避免覆盖。只应用本轮实现提交：

```sh
# 在自己的规则工作区执行；不需要切到本工作区或合并 R0/R1
 git cherry-pick 6566d568f5cd1bbe9b6afaef1b12a4b90463288a
 pnpm install --frozen-lockfile
 pnpm build
```

该提交来自双方共同基线，未触碰 image binding/paint/规则开关或 Roadmap；如果该工作区此后修改了网络调用，逐处解决冲突并确认仍经本次 resolver + pinned transport，不能选择跳过校验。需要完整验证交接时再按顺序 cherry-pick 文档提交 `3725f77` 和本次 DoH 结果提交（`git log -1 codex/network-dns-compat` 可取得）。

本次已经取得受信服务配置和三页真实观察。规则 Agent 应使用上述阿里 DoH 精确配置继续自己的原实验协议；无需为 DNS 交接重复跑这组三页观察。`openImageBindingExperiment` 复用 installUiNetworkSession，可继承本次部署配置，不需添加公共目标 fixture 特例。图片规则保持原有关闭状态；不要把本次 DNS 集成测试或网络恢复当作语义规则验收，不填造语义依据或更改 R0 门槛。
