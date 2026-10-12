# 产品资料验收协议

此协议是当前 `scripts/acceptance/product-sources/policy.ts` 的冻结输入。历史逐轮原文已封存为[原始档案](../../evaluation/archive/protocols/product-sources.md)，旧结果按执行提交解释，不因新路径获得新授权。

## 样本与判定

使用随 Git 的[资料页族](../../evaluation/fixtures/product-sources/)及正常中文产品规格，六个预注册任务覆盖健康、第二步效果不符、前置不足，每种各两次。模型只看到公开页面、任务与资料，真值在 `evaluation/private/product-sources/truth.ts`。

每行核对资料读取/精确引用、路径登记、原动作及对应测量、缺陷或有据弃权、报告及证据恢复。前置不足保持 partial/unverified，不能当成完整健康。固定回复只能证明接线，真实轨迹还需逐项语义审阅；同一合成页族不能证明公网泛化。

程序的详情错误硬停止判定要求同 run、原 action/item、动作前 binding、明确效果要求和附件摘要；仅引用包含“查看详情”或步骤标 verified 不足以定性。证据缺失和过宽谓词保留未验证，不能替代审阅。

## 冻结与执行

从仓库根目录、支持的 Node 版本执行；先安装依赖并 `pnpm build`。离线检查不加载真实凭据或联网：

```sh
DOTENV_CONFIG_PATH=/dev/null pnpm exec tsx scripts/acceptance/product-sources/cli.ts --dry-run
```

当前模型、端点报价上限、六行顺序、120次请求/US$7.56新增预留上限、时限及停止条件由 [policy.ts](../../scripts/acceptance/product-sources/policy.ts)定义。迁移只改变源码位置和协议路径，不扩大任何限制。费用未知、传输/安全/持久异常或错误通过按原门停止；保留已派发失败和未派发行，不补跑或拼接成绩。

`--freeze <清单>` 要求干净提交；`--free data/product-sources-acceptance/<新目录>` 使用固定本地服务；`--run <新目录> <清单> <授权文件>` 会调用真实模型。真实模式要求新冻结身份及明确授权，使用原 `R2_ACCEPTANCE_API_KEY` 和原 claim 命名空间；保留旧名称是为了不重置一次性消费边界。密钥存在不等于授权，旧批准不适用于迁移后的身份。

每行保存请求/响应、动作、报告、附件摘要、数据库、费用与停止原因；恢复报告时核对原附件。原始产物不随 Git 分发，不能用索引代替原件。
