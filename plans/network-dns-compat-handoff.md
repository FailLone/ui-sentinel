# DNS 兼容能力交接

交付日期：2026-10-09（Asia/Shanghai）。代码、定向验证和操作资料已交付；**确定性验证通过，系统模式公网观察 0/3 完成，DoH 公网验证因未指定部署服务而未执行**。不能将本次结果计入 R0 或图片规则验收。

## 提交与工作区

- 工作区：`/private/tmp/ui-sentinel-network-dns-compat`
- 分支：`codex/network-dns-compat`
- 基线：`2ac24efab18f7704f5c0b2b7bd74cf1f22ef94f8`。开始时主工作区 `3bfecce` 与规则分支 `36247ff` 的共同提交；相关网络代码与主工作区一致，避免引入后续不相关实验。没有合并 R0/R1/规则分支。
- 实现提交：`6566d568f5cd1bbe9b6afaef1b12a4b90463288a`，含配置、DoH、扫描链路接入、诊断、测试、固定公网验证脚本和使用文档。
- 本文与小型证据索引在随后的 `docs: record DNS compatibility validation and handoff` 提交。用 `git log -2 --oneline` 查交付提交，最终工作区 tracked/untracked 均干净；`data/` 和 `dist/` 为未提交的忽略项。
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

**DoH 公网验证：未执行。** 已集中询问解析端点、bootstrap IP 和域名披露授权，交付时尚未取得配置；未将三个目标域名发送给任意外部解析服务。拿到配置后，部署者应明确列出上述入口/资源域名再运行同一脚本，不增加来源授权：

```sh
# 先按实际受信服务设置上述环境变量（或 .env）
node --import tsx scripts/validation/network-dns-public.ts
```

会在 `data/network-dns-compat/public-doh/` 输出逐页结果；失败保留解析/地址/连接/TLS 阶段，不自动回退。当前不能声称已验证 DoH 的真实公网连通性或所有企业 VPN 兼容。

## 免费与证据交付

没有模型调用、付费 API 调用、图片语义检查、登录、表单提交或业务写操作。执行的是确定性本地测试，以及固定页面的受限只读导航尝试。主文档未取得时不产生扫描成功声明，也没有 UI 缺陷或规则失败结论。

随 Git 提交的小型索引：[docs/evidence/network-dns-compat.json](../docs/evidence/network-dns-compat.json)，含完整三页小型网络记录、测试统计、构建标识、审计摘要和本地文件 SHA-256/大小。

**未随 Git 交付**：`/private/tmp/ui-sentinel-network-dns-compat/data/network-dns-compat/` 下测试/构建/审计日志、编译观察入口和 JSON 原始结果；`dist/` 构建输出也未提交。本次没有大体积截图/视频。`/private/tmp` 是本机临时存储，需长期留存时由交接方复制该目录；小型结论和原始三页决策已在 Git 索引中保留，不依赖临时目录才能读懂结果。

## 规则 Agent 如何应用

在规则 Agent 自己工作区先检查 `git status --short`，处理自己的未提交内容，避免覆盖。只应用本轮实现提交：

```sh
# 在自己的规则工作区执行；不需要切到本工作区或合并 R0/R1
 git cherry-pick 6566d568f5cd1bbe9b6afaef1b12a4b90463288a
 pnpm install --frozen-lockfile
 pnpm build
```

该提交来自双方共同基线，未触碰 image binding/paint/规则开关或 Roadmap；如果该工作区此后修改了网络调用，逐处解决冲突并确认仍经本次 resolver + pinned transport，不能选择跳过校验。需要完整验证交接时再 cherry-pick 本分支随后文档提交（`git log -1 codex/network-dns-compat` 可取得）。

先由部署者配置受信服务，再运行固定三页免费观察脚本；真实页面可观察后，规则 Agent 才继续自己的原实验协议。`openImageBindingExperiment` 复用 installUiNetworkSession，可继承本次部署配置，不需添加公共目标 fixture 特例。图片规则保持原有关闭状态；不要把本次 DNS 集成测试或网络恢复当作语义规则验收，不填造语义依据或更改 R0 门槛。
