# 导入与环境预检（macOS / Linux shell）

这是独立源码快照包，不需要原产品仓库或它的 Git 历史。本期开发只需要 Git、Node 24.x、pnpm 10.17.1 和依赖注册表网络。Windows 可在安装了这些工具的 WSL 中执行，未宣称验证原生 PowerShell。

## 1. 安装工具并确认实际运行版本

Node 可从 Node.js 官方发行安装 24.x 或用你已安装的版本管理器切换；Git 使用操作系统安装包。缺 pnpm 时在选定 Node 下执行 `npm install --global pnpm@10.17.1`，不假定 Corepack、Python、jq 或全局 tsx。本包不附第三方工具二进制。

```sh
node --version
pnpm --version
pnpm exec node --version
git --version
```

node 和 pnpm exec node 都必须是 v24.x，pnpm 必须 10.17.1。目录自动切版本可能改变后者；导入后在 checkout 再检查。不要忽略 unsupported engine 警告继续声称环境通过。

## 2. 校验外层包并导入独立工作区

将收到的全部文件放在同一包目录（包含准备证据），先进入该目录。下面使用当前实际路径生成变量，没有要求与发送者相同的绝对路径。`SHA256SUMS` 自身摘要应与发送消息比对；包内 hash 可发现损坏，不能替代可信渠道的摘要。

```sh
node verify-package.mjs
# Linux 可额外用 sha256sum -c SHA256SUMS；macOS 用 shasum -a 256 -c SHA256SUMS
r1_package_dir="$PWD"
r1_tip=$(node -p 'require("./delivery.json").deliveryTipSha')
r1_ref=$(node -p 'require("./delivery.json").bundle.ref')
r1_bundle=$(node -p 'require("./delivery.json").bundle.path')
# 选择一个不存在的新目录，不在现有 R0 checkout 内运行 git init。
mkdir ../r1-jev-dev-workspace
cd ../r1-jev-dev-workspace
git init
git bundle verify "$r1_package_dir/$r1_bundle"
git bundle list-heads "$r1_package_dir/$r1_bundle"
git fetch "$r1_package_dir/$r1_bundle" "$r1_ref:refs/heads/codex/r1-jev-decision-dev"
git switch codex/r1-jev-decision-dev
test "$(git rev-parse HEAD)" = "$r1_tip"
git status --porcelain=v1
node "$r1_package_dir/verify-package.mjs" --tree "$PWD"
```

bundle verify 必须报告完整历史/无 prerequisites，ref/tip 与 delivery.json 相符；任何不一致停止并报告。`--tree` 在**首次导入未修改时**校验所有 tracked 文件逐字摘要及文件集合。开发后的树应按返程 diff 审查，不要求与原输入全树相同。

## 3. 独立依赖与输入检查

本期本地可写目录添加到当前独立 repo 的 `.git/info/exclude`，不修改原共享 .gitignore：

```sh
node --input-type=module -e 'import {appendFileSync} from "node:fs"; appendFileSync(".git/info/exclude", "\n.r1-pnpm-store/\nartifacts/\n")'
node plans/r1-jev-input/preflight.mjs
pnpm install --frozen-lockfile --store-dir .r1-pnpm-store
pnpm exec tsc --noEmit
git status --porcelain=v1
```

依赖按包内锁文件，安装成功不代表产品测试成功。pnpm 可能提示 esbuild/sharp/bufferutil 的 install script 被默认忽略；本期不盲目 approve 所有脚本。TypeScript、Vitest、tsx 必须实际可运行；若所用平台缺必要二进制，列环境失败和必要依赖，给出有依据的最小安装方法后复验。无需 Playwright browser、服务 dist、数据库或 .env，不运行全量 `pnpm build`、旧 `validate:*`、旧 `smoke:*`。

准备阶段已进行的命令/结果以外层 preparation-evidence 为准；此时产品实现尚未开始，没有本期 Vitest 用例，不能把“没有测试”当通过。

## 4. dev 实现后执行并完整记录

```sh
node plans/r1-jev-input/preflight.mjs
pnpm exec tsc --noEmit
pnpm exec vitest run --config plans/r1-jev-input/vitest.r1.config.ts
pnpm r1:jev:offline -- --output artifacts/r1-jev/run-1
pnpm r1:jev:offline -- --output artifacts/r1-jev/run-2
```

另外对实际修改的 TS/JSON 文件执行 `pnpm exec biome format <文件列表>`。离线模式必须显式替身、不访问提供方；不要仅靠清空一个 API key 判断零外网。测试应装网络陷阱/注入传输计数，并覆盖 T01–T16。实际运行日志、退出码、版本、源码/config 身份、输入输出按返程协议保存。

全部路径相对于新 workspace 或交付包；日志机器路径映射回包内 evidence 或 bundle checkout。安装环境/网络无法满足则准确记录，不拿本机 node_modules、全局工具或旧 dist 冒充重建成功。
