# GPT-Image-2.5 ToAPIs 节点

- 节点键：`gptImage25`，复用 Nano2 图片展示、任务轮询与远程图片持久化。
- 运行入口：FlowOverlay 的节点回调注入分支必须包含 `gptImage25`，绑定 `onRun` 和 `onSend`；遗漏时 Nano2 按钮的可选回调调用会静默跳过，表现为点击无反应。
- 上游：`POST /v1/images/generations`，使用后端 `TOAPIS_TOKEN` 和现有 ToAPIs 主备地址配置。
- 模型：`gpt-image-2.5-sunburst-vip`，固定 ToAPIs，不受全局尊享路线切换影响，也不会改写为 `gpt-image-2-official`。
- 默认请求：`size: "1:1"`、`n: 1`、`quality: "high"`、`metadata: { resolution: "1K", orientation: "square" }`。
- 质量档位：Low、Medium、High、Xhigh、Max，对应透传 `low/medium/high/xhigh/max`；默认 High。Xhigh/Max 独立定价未确认，积分预览与扣费暂沿用 High。
- 方向按比例计算：正方形 square、横向 landscape、纵向 portrait。分辨率放 metadata，省略 2.0 专用 official_fallback/background/moderation/output_format。
- 支持异步任务 ID 轮询和同步 `data[0].url` 返回；后端启动时自动补建缺失节点配置，重启后刷新前端可见。
- 积分暂定为 `gpt-image-2` 普通路线对应质量×分辨率积分的 1.25 倍，向上取整；默认 high/1K 为 143 积分。Xhigh/Max 以 High 为基准同样加价 25%。这是产品暂定价，不代表供应商报价。
- 当前依据请求预览接入；其他比例、分辨率、参考图能力以及真实上游任务响应仍需有效密钥实测。