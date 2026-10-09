# Git 获取开发输入与环境预检

本次开发输入通过 Git 分支提供，成果通过压缩包返程。不再要求传递或导入源码输入压缩包。需要你自己机器上的 Git、Node 24.x、pnpm 10.17.1，以及 GitHub/依赖注册表访问能力；不假定全局 tsx、Python、jq 或浏览器已安装。

## 1. 克隆指定分支，固定输入提交

先从交接提示取得完整输入 tip SHA（40位），赋值给下面的变量。它是唯一允许的开发起点，不能替换成“最新 main”。目标目录须不存在，并与现有 R0 工作区分开。

```sh
r1_expected_tip='<交接提示给出的完整40位输入tip>'
git clone --single-branch --no-tags --branch codex/r1-jev-input-20261007 https://github.com/FailLone/ui-sentinel.git ui-sentinel-r1-jev-dev
cd ui-sentinel-r1-jev-dev
test "$(git rev-parse HEAD)" = "$r1_expected_tip"
git status --porcelain=v1
git switch -c codex/r1-jev-decision-dev "$r1_expected_tip"
```

SHA 不一致立即停止并记录，不自行追随新提交。分支完整包含筛选源码历史；不需要额外 fetch 原产品分支/标签，也不需要旧版 bundle。这个输入分支不是 R0 的后代，是为排除私有验收资料而建立的源码快照；后续按允许路径 diff 集成，不整树合并覆盖 R0。

## 2. 运行环境与材料预检

Node 使用官方发行 24.x 或已安装的版本管理器切换；缺 pnpm 时，在选定 Node 下执行 `npm install --global pnpm@10.17.1`。不假定 Corepack 已安装。macOS/Linux shell 可直接执行以下步骤；Windows 可使用配置好工具的 WSL。

```sh
node --version
pnpm --version
pnpm exec node --version
git --version
node --input-type=module -e 'import {appendFileSync} from "node:fs"; appendFileSync(".git/info/exclude", "\n.r1-pnpm-store/\nartifacts/\n")'
node plans/r1-jev-input/preflight.mjs
pnpm install --frozen-lockfile --store-dir .r1-pnpm-store
pnpm exec tsc --noEmit
git status --porcelain=v1
```

node 和 pnpm exec node 均须 v24.x，pnpm 为10.17.1；目录自动切版本可能导致两者不一致，不能忽略 engine 警告。预检核对只读参考源码/配置摘要、Roadmap 快照和全部合成输入摘要，并检查没有不应出现的私有资料。环境/材料缺失分别记录，不能靠发送者机器文件补猜。

所有 store、node_modules 和 artifacts 留在自己的独立目录。不共享 R0 的 dist/DB/证据/profile/端口/费用账本。pnpm 可能提示忽略 esbuild/sharp/bufferutil 安装脚本，不要盲目 approve 所有脚本；本期实际所需 tsc/tsx/Vitest 应可运行，确有缺二进制则记录最小安装方法并复验。无须产品 dist、浏览器或 .env。

## 3. 开发后的免费复验

```sh
node plans/r1-jev-input/preflight.mjs
pnpm exec tsc --noEmit
pnpm exec vitest run --config plans/r1-jev-input/vitest.r1.config.ts
pnpm r1:jev:offline -- --output artifacts/r1-jev/run-1
pnpm r1:jev:offline -- --output artifacts/r1-jev/run-2
```

对实际修改的 TS/JSON 执行 `pnpm exec biome format <文件列表>`。新模块/用例尚未实现时，空 Vitest 列表不能算测试通过。默认 stub，测试需网络陷阱或注入传输计数，不能只靠没 key 宣称零外网。禁止运行真实模型或 R0 付费入口，不运行本筛选分支未交付的全产品脚本。

全部实际命令、退出码、原始日志、源码/配置/fixture 身份和工具版本按 return-and-acceptance.md 保存，路径相对返程包。代码全部提交后，从最终分支生成完整历史代码 bundle，与证据一起压缩返程；接收者不依赖远端 Git 或你的本机文件即可验收。
