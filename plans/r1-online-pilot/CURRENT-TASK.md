# 当前任务：R1 首请求 HTTP 400 有限诊断（已完成并停止）

2026-10-09。本轮唯一交付：[diagnosis-400/README.md](diagnosis-400/README.md)，机器索引：[diagnosis-400/evidence-index.json](diagnosis-400/evidence-index.json)。不回旧八状态，不重跑在线九轮。

已完成：保存请求/实际 wire/网关转换核对；同 DeepSeek/Wafer/required+low 的真实成功反证；官方协议和只读费用查询能力核对；原权威账本只读检查；白名单响应关联头取证增强；保存请求 fixture + 注入传输，26 项定向测试及类型检查通过。没有确证根因，因此没有参数兼容修复。没有新增真实推理/付费、认证账户查询、密钥读取、浏览器运行、Agent 派发或供应商消息。

未解：400 的具体被拒字段/服务原因，以及本请求官方 generation/结算身份和最终 USD 金额。已知费用 0 不等于实际总费用 0；实际总费用未知，unknownCount=1、unknownReservedUsd=0.053、held=0、stop epoch=1。因缺少有效 gen- 身份，未发送无效 generation 查询，未枚举余额/无关消费。原账本支持追加审计，但缺少可信绑定凭据，本轮追加 0 条。

固定失败身份：源码 de54a7ee7c141e719f212852e774b304162cd3dc；失败交付基线 4bf887cb6150975145abc62cad3c61bc9f5fea56；manifestHash 9f73f0d6e3140b2d891d043441053bb75579550d58fdbf850a081c0bdc56ba75；run-70e34b02-2d84-4498-b133-15405529861b；本地请求 0ddb03d5250db453759b72ee；Wafer 请求 a0d1d4a1a35a。

停止状态：原运行工作区 ui-sentinel-r1-online-runtime、权威 DB/log/artifacts、固定 ui-sentinel-r1-online-claims 的 claim/锁保持原摘要。旧许可已消费，补账也不复活批次；不能换库/新 campaign 绕过 unknown。默认关闭，R1 未通过。不 push/main 合并。

下一条仅需取得能绑定上述请求的官方拒绝详情与最终收费凭据。已准备支持摘要，未发送；没有新付费方案许可。本轮公开报价高于旧 cap，未来任何新授权仍须独立核实报价与准入。没有新证据则停止，不继续猜测或自发探针。

接手时包含前任未提交修改的任务文本已完整归档：[history/20261009-pre-diagnosis-CURRENT-TASK.md](history/20261009-pre-diagnosis-CURRENT-TASK.md)。历史执行、候选及授权沿革以归档和 paid 证据为准，不作为新的“当前优先”。
