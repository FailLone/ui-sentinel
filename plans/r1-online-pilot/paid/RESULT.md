# 已授权在线批次：首条请求被拒绝，整批停止

2026-10-09。本次只启动semantic-agent一行，派发1次真实主模型请求；Wafer返回HTTP400 / model_request_rejected，未返回usage。冻结runner立即触发agent-provider-or-response-error，取消当前run，随后保留unknown账目并退出1。没有修代码、重试、fallback、视觉请求或追加样本。

运行源码de54a7ee7c141e719f212852e774b304162cd3dc，输入交付d63352c79aec5ff24e0f91bd75730052850075e7，manifestHash **9f73f0d6e3140b2d891d043441053bb75579550d58fdbf850a081c0bdc56ba75**。批准者准确记为human user，维护会话转达原话“授权”；签发后24小时是执行安排，非用户指定期限。具体批准文件、已消费claim及真实请求在[证据索引](evidence-index.json)，机器结论在[result.json](result.json)。旧单frame授权没有复用。

| 场景 | 模式 | 本次状态 | 主模型 / Jev 实际请求 | 可作质量评价？ |
| --- | --- | --- | --- | --- |
| semantic | agent | 已尝试；服务拒绝后cancelled | 1 / 0 | 否，尚无交互/测量 |
| semantic | program | 未运行：首条触发整批停止 | 0 / 0 | 未评价 |
| semantic | jev | 未运行：首条触发整批停止 | 0 / 0 | 未评价 |
| ambiguity | agent | 未运行：首条触发整批停止 | 0 / 0 | 未评价 |
| ambiguity | program | 未运行：首条触发整批停止 | 0 / 0 | 未评价 |
| ambiguity | jev | 未运行：首条触发整批停止 | 0 / 0 | 未评价 |
| expanded | agent | 未运行：首条触发整批停止 | 0 / 0 | 未评价 |
| expanded | program | 未运行：首条触发整批停止 | 0 / 0 | 未评价 |
| expanded | jev | 未运行：首条触发整批停止 | 0 / 0 | 未评价 |

未运行行不是失败或成功。原runner的completedRows=1表示已记录一份行报告，不是成功完成一项场景；本次成功完成行数0，可比较三组的场景数0。原result-summary的固定服务提示是静态通用文字，实际identity.free=false、请求/账本证明这1次为真实调用。

## 实际执行、覆盖和测量

semantic-agent的runId为run-70e34b02-2d84-4498-b133-15405529861b。0个浏览器动作、0个交互后置测量、0个发现，2个local-interaction事项仍pending。检查账本共8项，其中6项verified属于入口观察、investigation和automatic-check，不等于交互已完成，也不能证明健康页面通过。原事项、公开来源、检查与证据引用保留在report及其4份引用产物。

firstMeasurementEventMs和firstFindingMs均null；没有发生可报告的首次测量或有效发现。误报/漏报及程序/Jev收益在本次没有有效对照分母，不用零发现冒充零误报/高质量。报告persistence.status=not-final、recordedStatus=cancelled，readConsistency=single-read-transaction；本次未取得正常最终报告持久化通过结论，不改写为verified。

收到的provider错误只说“The model request was rejected. Check the request and try again.”，param=null；本次严格不按该返回建议自动重试。错误不能定位具体请求参数、凭据权限或供应商内部根因，不能猜测为模型/provider身份已成功兼容，也不证明Jev适配失败。

## 全部费用、停止与时长

- 已派发：Agent 1、Jev 0、视觉0；重试0。请求0ddb03d5250db453759b72ee绑定到上述parentRun和准确manifest。
- 已知实际费用US$0；**实际总费用未知**。唯一请求没有usage，actualUsd=null、unknownCount=1，保留US$0.053的unknown预留；HTTP400不能当作零收费凭据。
- heldReservedUsd=0；包含未知预留的accountedUsd=0.053；未触发额度超支。账本stop epoch=1，批次保持停止，无自动恢复。
- claim已消费；固定目录为/Users/xietian/Documents/ChatGPT/ui-sentinel-r1-online-claims。保留该目录、原始claim及execution-lock，不能换目录继续。未用预留不代表可以追加请求。
- 启动器至退出记录约4,389ms（含启动及公开报价预检）；单行runner耗时1,246ms，执行器记录1,124ms，供应商请求708ms。不同计时边界分别保存，均不当作三组性能比较。

在读取已有私密凭据前额外作了2次公开端点报价检查；冻结runner按原逻辑又检查2次。4次均为公开模型元数据HTTP，不是推理请求或付费探针；没有更换模型/provider或扩大冻结cap。私密凭据只在内存提供给父runner，没有复制.env或保存密钥。

## 材料与结论

隔离工作区固定在de54a7e，跟踪源码与锁文件干净；identity.sourceDirty=true来自未跟踪的manifest/approval/launcher输入，原值保留。子构建source map的133份源码逐一匹配该提交。离线依赖安装完成，已有Chromium被复用，没有重跑免费套件或浏览器验证矩阵。

本地原始失败及关闭后的权威account数据库保留在独立运行目录；供复核的35份文件按相对路径编入索引，包含请求/费用日志、完整公共state绑定、报告/产物、源码映射、批准及claim副本。仅对两个文本文件中的供应商账户user_id作脱敏，原始私有文件保持不动；索引同时记录原始摘要与交付摘要。未打包浏览器profile、无关data或密钥。

**没有三组实测差异，也没有支持继续采用Jev的新增依据：Jev根本未调用。** 这不是Jev没有收益的负结论；当前得到的是主模型请求被服务拒绝以及停止/unknown账目保留的事实。下一步若要解决协议/供应商拒绝或补账，须另行明确处理范围；本次不补丁重跑、不对账后恢复旧批次。R1未通过，默认功能保持关闭。本地提交交付后停止。
