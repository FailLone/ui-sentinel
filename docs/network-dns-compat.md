# 公网扫描可配置 DNS 解析

本功能仅服务 `ui-scan` 的公网 HTTP/HTTPS 请求。默认 `system`；部署者可显式选择 RFC 8484 DoH GET。没有自动切换、自动发现、重试、备用解析器或代理。本次不默认开启 URL 扫描或 DoH，不改变图片规则、R0 完成门/费用/历史证据、R1 调度或系统网络设置。

## 基线与链路核对

独立分支 `codex/network-dns-compat`，工作区 `/private/tmp/ui-sentinel-network-dns-compat`。基线 `2ac24efab18f7704f5c0b2b7bd74cf1f22ef94f8`，为开始时主工作区 `3bfecce` 与规则分支 `36247ff` 的共同祖先。网络目录、地址策略及共享配置在该基线和主工作区提交间没有差异；选择共同基线便于规则分支 cherry-pick，并避免引入后续不相关实验。未合并其他分支，未复制其未提交代码。仓库及上级目录未找到 AGENTS.md。已读用户指定的图片公网验证文档，仅将其作为既有失败背景；本次证据独立产生。

| 环节 | 实现与约束 |
| --- | --- |
| URL/域名入口 | `src/inspection/url.ts` 的 `parseEntryUrl` 拒绝非 HTTP(S)、凭据、控制路径等；`contract.ts` 固定入口 origin；API 严格 schema 不接受网络配置字段。 |
| 创建预检 | `src/server/routes/ui-scan-address.ts` 改用部署解析器；所有回答中优先返回被拒绝的地址给既有单地址合同接口，避免混合回答被隐藏。解析失败仍沿用延期入队行为，执行前重新解析且失败关闭。 |
| 系统解析 | `node:dns/promises.lookup(host, {all:true})`，沿用 OS getaddrinfo/hosts/企业 DNS 路径。不是 `dns.resolve`，不改系统配置。IP 字面量不发 DNS 查询。 |
| 地址策略 | `src/execution/network/address.ts` 对全部 A/AAAA 地址调用原有 `isPrivateAddress`。私网、回环、链路本地、CGNAT、198.18/19 合成地址、文档/保留/组播范围和 IPv4-mapped IPv6 等按既有策略拒绝；不认识的地址失败关闭。本次未扩大任何地址授权。 |
| 主文档/资源/重定向 | `session.ts` 使用 CDP Fetch 暂停每一跳；先检查来源/方法/导航范围，再解析、全量校验，交给 Node 固定地址传输，最后 `Fetch.fulfillRequest`。主文档仅原入口 origin；资源/data 原有独立授权不变。每一跳重新走这条链路，Node 不跟随重定向。 |
| 实际连接 | `transport.ts` 的 `http/https.request` 使用 `agent:false`，`lookup` 回调只返回已选定的一个已检查地址；没有第二次 DNS。URL 保留原域名，因此 Host、TLS SNI 和证书身份校验保留，显式 `rejectUnauthorized:true`。全部回答通过后沿用 IPv4 优先选择，无其他地址尝试。 |
| 浏览器其他通道 | `launchBrowser({uiScan:true})` 的拒绝代理、阻止 service worker/弹窗/WS、禁用 QUIC 与原有通道限制保留，浏览器不能绕开固定传输自行解析连接。 |
| 图片/证据 | 本基线图片走浏览器资源路径；截图/DOM 证据从已加载页面本地保存，没有独立 HTTP 下载器。只读核对规则分支已提交的 image-paint / image-binding-host / image-bindings；宿主复用同一 network session，没有新增抓图路径。本分支未带入这些规则实验。 |

没有发现必须更换代理架构的连接一致性缺口。改动点为解析器、两处调用、诊断与失败传播。系统模式仍使用同一系统接口、全部回答策略和固定传输；现在等待解析有上限，错误不再被吞成空回答。系统 `getaddrinfo` 本身不能被 Node 取消，任务取消/超时会停止等待并忽略晚到结果，不会继续连接；底层 OS 查询可能稍后返回。

## 部署配置与启动

使用项目 `.env` / 环境变量惯例；配置在进程加载时读取。不要把 resolver 设置放进任务 URL、目标、网页内容或模型输出。普通用户依旧只输入 URL 和可选目标。

```dotenv
# 默认；企业 DNS/VPN 现有解析行为保留
URL_SCAN_DNS_MODE=system
URL_SCAN_DNS_TIMEOUT_MS=5000
```

DoH 配置模板（替换示意端点和 IP 后使用，不含真实凭据）：

```dotenv
URL_SCAN_DNS_MODE=doh
URL_SCAN_DNS_TIMEOUT_MS=5000
URL_SCAN_DOH_ENDPOINT=https://resolver.example/dns-query
URL_SCAN_DOH_BOOTSTRAP_ADDRESS=<部署者核验的一个IPv4或IPv6地址>
URL_SCAN_DOH_ALLOWED_HOSTS=www.example.org,cdn.example.org
```

`endpoint` 必须为 HTTPS 域名 URL，允许自定义路径和端口，不支持 URL 用户信息、query、fragment 或 IP 形式端点；此版无 resolver 认证配置。`bootstrap` 必填，直接约束解析服务的连接，不需要先经过系统 DNS。单个 bootstrap 无轮换、无备用，TLS 仍校验 endpoint 的域名和系统信任链。bootstrap 是部署者明确授权的服务地址，可为私有受信任服务；它不授予任何扫描目标私网访问权限，不能由任务输入控制。DoH 回答仍不被视为可信目标地址。

`allowedHosts` 是必须的、无通配符的精确域名清单，用于限制向解析服务披露查询，不是资源访问权限或复杂分流。清单外域名报 `resolution-scope-denied`，不发外部查询、不改走系统 DNS。部署者应仅列出确认为公网扫描用途的入口和依赖域名，不能自动识别企业内部名字。CNAME 仅使用同一应答中的别名链和地址，不另发 CNAME 查询；不完整的别名应答失败关闭。IP 字面量直接走原有地址策略。

```sh
# 项目支持 Node >=22.18 <23 或 >=24 <25；本次使用 24.21.0
pnpm install --frozen-lockfile
pnpm build
pnpm start
```

URL 扫描的既有 `EXECUTION_URL_SCAN=1` 开关仍由部署者按原有要求决定；本次不改变启用状态。修改配置后重启进程。恢复系统模式：设 `URL_SCAN_DNS_MODE=system` 或删除该变量并重启；DoH 其他变量在 system 模式不使用。没有自动恢复/失败回退。

## 解析与传输契约

A 和 AAAA 并发各一次，任何一族请求失败使本次解析失败，并取消另一请求。默认总解析期限 5000 ms，部署允许 1..15000 ms；任务取消、页面关闭及 session seal 传入取消信号。每个 DNS 响应最大 65535 字节（压缩前后分别限制），最多 256 个 answer；检查 HTTP 状态/MIME、DNS QR/ID/opcode/rcode/TC、问题匹配、完整消费和答案所属别名链。无自有缓存，避免引入 TTL/缓存生命周期问题。

目标连接仍用既有 15 秒期限、响应字节和整轮预算。DNS 服务连接有独立 64 KiB 级预算及期限，不会消费页面字节预算。浏览器请求预算先预留，随后才会发出 DNS 请求。

测试分层证明：真实本地 TLS 端点证明 bootstrap、SNI/Host/证书检查和取消；真实 Chromium 使用显式本地 fixture 授权验证固定地址取页、资源拒绝和跨源跳转拒绝；无公网授权例外的 session 接口测试证明合法公网/IPv6 回答进入固定传输参数，混合回答和重绑定阻止后续传输。fixture 授权仅在测试创建，不写入部署配置。真实公网可达性另行记录，不能由本地夹具推断。

## 诊断与结果解释

`network:policy` 记录模式；文档成功记录和全部拒绝记录保留 `dnsMode`、`networkStage`、`resolvedAddresses`、`selectedAddress`、成功响应后的 `connectedAddress` 和 `elapsedMs`。成功子资源依旧按既有方式汇总，不无限增加持久日志。`selectedAddress` 是连接尝试地址，不代表连接成功；`connectedAddress` 来自成功响应的 socket。失败时的阶段和原因才是判断依据。

| 分类 | reasonCode / sessionReason / stage |
| --- | --- |
| DNS 失败/超时 | `resolution-failed` / `resolution-failed` 或 `resolution-timeout` / `resolution` |
| 未批准域名披露 | `resolution-failed` / `resolution-scope-denied` / `resolution` |
| DoH HTTP/不可达/错误响应 | `resolution-failed` / `resolution-unavailable` 或 `resolution-invalid-response` / `resolution` |
| DoH TLS | `resolution-failed` / `resolution-tls` / `resolution` |
| 目标地址拒绝 | `private-address` / 空 / `address`（私有字面量可在 policy 阶段提前拒绝） |
| 已验证目标连接失败 | `transport-error` / `connection` 或 `timeout` / `connection` |
| 目标 TLS | `transport-error` / `tls` / `tls` |
| 取消 | `execution-stopped`；最终收口取消保持原有 `finalizationShutdown` 语义 |

不记录解析端点完整配置、凭据、原始异常字符串或 DNS 查询 URL。错误配置只提示变量名及格式，避免回显秘密。日志沿用既有目标 URL 记录行为。解析/传输失败使 boundary 的 flush/settle 抛出执行错误；地址/来源拒绝继续记录 network intervention。未加载的页面没有可供 UI/图片规则判定的观察，本次工具不运行任何语义检查。

## 开源选型与维护

先检查项目依赖：Playwright 不提供满足本项目固定地址约束的 DoH 注入；Node 原生 DNS 没有 DoH；Node HTTPS 和既有 pinned transport 可以复用。间接依赖中的 undici 不是 DNS 编解码器，另引入连接栈没有必要。

比较两个实际候选：

| 候选 | 版本/许可证/官方资料 | 结论 |
| --- | --- | --- |
| dns-packet | **5.6.1 / MIT**；[官方项目](https://github.com/mafintosh/dns-packet)、[源码与版本](https://github.com/mafintosh/dns-packet/blob/master/package.json)、[许可证](https://github.com/mafintosh/dns-packet/blob/master/LICENSE) | 选用。小型、职责明确的二进制 codec；本版只带 `@leichtgewicht/ip-codec` 2.0.5（MIT）一个运行时依赖。无内置网络、重试、缓存或回退，因此可直接复用现有固定传输。类型包 `@types/dns-packet` 5.6.5（MIT）仅开发依赖。 |
| dns-query | 0.11.2 / MIT；[官方项目](https://github.com/dnsquery/dns-query)、[Node 传输源码](https://github.com/dnsquery/dns-query/blob/master/lib.mjs) | 未用。提供完整 DoH/UDP 客户端，但其 `requestRaw` 直接用 endpoint hostname 建 Node 请求，无所需的 lookup/bootstrap 注入；响应块收集没有本项目大小上限，超时按活动重置而非总期限。不能只改 URL 为 IP 而牺牲证书/SNI。且有五项直接依赖及 resolver 发现逻辑，本项目不需要。 |

项目自行承担最小适配：选择 RFC8484 GET、部署配置/披露范围、校验解码后应答与问题对应、合并 A/AAAA、期限取消/预算、原有地址策略及 CDP 固定连接。DNS wire 编解码由 dns-packet 实现；TLS、HTTP 和 socket 由 [Node 官方 HTTPS](https://nodejs.org/docs/latest-v24.x/api/https.html) 实现。没有自写 DNS wire parser、TLS、缓存或底层 socket 实现，也未引入常驻服务。解析库只解决解析，实际连接约束由项目既有 transport/session 提供。

2026-10-09 查阅官方 README、package、changelog、源码及安全页面：dns-packet 非 archived，当前 5.6.1，发布节奏较慢，不能声称活跃高频更新。[维护者安全页面](https://github.com/mafintosh/dns-packet/security/advisories) 未列公开 advisory；本次 `pnpm audit --prod --json` 未列 dns-packet/ip-codec 告警，但全项目仍有 4 moderate、9 high 既有依赖告警（包含 sharp/js-yaml 等），不等于项目审计全绿，亦不保证没有未知漏洞。未为此升级不相关依赖。

版本固定在 package/lockfile。升级时核对上游安全公告、解析器边界、响应结构、Node 22/24 支持；重跑本文定向集成用例，尤其是 malformed packet、超限、双族取消、bootstrap/TLS 与固定连接。不要以换库为由添加系统 fallback、默认公共供应商或更宽地址许可。Node 运行时补丁随部署维护；未来独立下载路径必须复用此边界或补充等价连接证明。

## 验证入口与范围

```sh
pnpm exec vitest run src/execution/network/resolver.test.ts src/execution/network/session-dns.test.ts src/execution/network/boundary-dns.test.ts src/server/routes/ui-scan-address.test.ts src/server/routes/ui-scan-runs.test.ts src/execution/network/acceptance.test.ts
pnpm build
# 固定三页、真实 Chromium、无模型/规则调用；模式来自上述部署配置
node --import tsx scripts/validation/network-dns-public.ts
```

结果、提交、证据路径见 [交接](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/network-dns-compat-handoff.md) 和小型证据索引 `docs/evidence/network-dns-compat.json`。未重跑 R0 全套验收、R1 调度或图片规则实验。公网验证仅导航、一次页面 DOM/截图观察和正常资源加载，保留既定页面及既定资源 origin，不登录、不提交。

不支持：企业内网扫描授权、VPN 品牌识别、专有 fake-IP 通道、HTTP/SOCKS 通用代理、企业证书管理、多协议 DNS、域名分流、resolver 认证、自动供应商故障切换。拿到公网地址仍可能因本机路由/企业网络无法直连；该结果需要如实记录，不能自动改造成代理项目。本机成功也不代表所有 VPN 兼容、R0 验收或图片规则通过。

## 2026-10-09 授权公网验证补充

使用部署者随后明确指定的阿里公共 DNS：`https://dns.alidns.com/dns-query`，bootstrap `223.5.5.5`，5000 ms 解析期限。仅通过本次进程环境变量启用，没有改为默认供应商。完整精确域名清单和可执行配置见 [交接中的 DoH 验证](https://github.com/FailLone/ui-sentinel/blob/25409ce/plans/network-dns-compat-handoff.md)。

复用代码 `6566d56` 的原观察构建及 62 项已通过测试，运行 HEAD `3725f77` 无代码差异；不重装、不重建、不重跑测试。三页各一次，均完成真实 DOM/截图观察：Commons 3093 ms、MDN 5215 ms、GitHub 5250 ms。旧 system 模式 0/3 结果保留，新 DoH 模式 **3/3** 独立报告。

主文档选定地址和实际 socket 分别一致为 `103.102.166.224`、`151.101.89.91`、`20.205.243.166`；全部 289 个完成响应也逐条匹配其已校验地址。无解析/连接/TLS 失败，无需代码修复或重试。TLS 校验始终开启；IPv6 回答通过地址策略，但本次实际连接使用 IPv4，不能推断公网 IPv6 连通性。

保留 22 条来源/通道/方法拒绝及 27 条观察结束取消。其中 Commons 15 个 thumb 域图片和 1 个 auth 域脚本重定向被原策略拒绝；MDN/GitHub 遥测 POST 等未被放行。没有扩大 DNS 清单或资源来源。三页观察成功不等于资源全加载、网站无缺陷、R0 通过或图片规则验收通过。

规则 Agent 可使用上述已授权配置恢复原公网实验，并继续报告受限资源/未完成加载带来的覆盖限制。原始 JSON、三张截图和日志未随 Git 提交；本分支证据索引保存摘要、拒绝明细、地址集合、构建身份、文件大小和 SHA-256。本次没有模型或图片语义调用，不改变系统/VPN/代理配置。
