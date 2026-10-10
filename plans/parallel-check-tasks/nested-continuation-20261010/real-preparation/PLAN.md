# 待授权：P02 单行真实验证

目的：检查真实 Jev 能否根据新增动作关系事实完成嵌套入口续行，并经原目标选择及几何收据完成两个视口的弹窗子目标。不是父全范围 covered 测试，不重跑 P01/P03 或 R0/R1。

- 实现/source commit：`de5fc94334665353ab9477969ad477b691570db4`。
- Manifest SHA-256：`21fb549f06b389d55912313645d2e8c50a724fcebca9caa488677bd9e8e166b2`。
- Runtime bundle SHA-256：`95795ee7a3ec18512a0b106b9ca17cdc346f00a27baee888ef3879d7c9814025`。
- 输入：manifest.rows 恰好原 P02 `/p/two`，页面 HTML、publicGoal、publicInput、私有评分与旧冻结 P02 逐字段一致。独立匿名子浏览器 320×480、640×480；写权限 none，仅原 local-ui 动作。私有预期 fail/pass 和路径只用于离线评分，不进入模型 prompt。
- 模型固定：主 `deepseek/deepseek-v4.1-flash` / Wafer；Jev `typesafe/jev-1.13` / TypeSafe。主请求上限 10、Jev 上限 6，原共享账户一次性上限 USD 0.62；预留公式 `10×0.060 + 6×0.003 = 0.618 ≤ 0.62`。不拆出可重复使用的额度。
- 时限：单主请求 60s、单 Jev 8s、单行与整批各 180s、清理最多另 60s。父及原共享行预算 maxActions=6/maxModelCalls=16；每子原配额 actions=3/modelCalls=3/reads=2。保留原默认检查和预算，不为保证通过提高上限。
- 无重试、fallback、恢复追加批次或 vision。任何请求身份/归属/权限/证据/持久化不一致、请求上限、未知费用、超额、HTTP/传输/超时失败、时限或取消均走现有停止链。已发未结算保留 unknown，不释放为可用费用。
- 停止与结果分开：安全停止退出 2；无安全停止但目标未全通过退出 3；未处理运行异常退出 1；符合整行原评分才退出 0。保留原父 blocked/partial 及缺口，不以取消或收尾成功当目标成功。

`approval.example.json` 只是空白模板：须另有用户对本方案的明确授权，填写批准者、可追溯来源和有效期，并保持 hash、费用、1 parent、10/6 requests、singleBatch、retries=0 等全部匹配。源码、依赖、Node 与 bundle 校验均通过后才能运行。新授权只消费此 manifest 对应的一次 claim；旧批次授权已做免费拒绝验证。当前没有真实授权文件或真实 claim。

用户另行授权后，由维护者在隔离工作树使用现有安全凭据注入方式启动以下冻结包；命令参数不含凭据。必须采用全新输出目录，且运行时 `DOTENV_CONFIG_PATH=/dev/null`、Node v24.21.0；运行环境仅提供必要 PATH/HOME 和 `PARALLEL_POPUP_API_KEY`，不要读取旧项目 .env：

```sh
node plans/parallel-check-tasks/nested-continuation-20261010/real-preparation/runtime.mjs --run \
  plans/parallel-check-tasks/nested-continuation-20261010/real-preparation/manifest.json \
  <new-explicit-approval.json> \
  data/parallel-popup-real/approved-p02-continuation-01
```

启动时重读公开价格并核对冻结上界；未知报价或价格变高不得调用模型。运行结束保留原请求、响应、模型原选择与程序采纳选择、第二 ENTRY 新事实、TARGET、实际动作/测量、费用与资源关闭证据。任何结果只报告一次，不补样、不借剩余预算追加。
