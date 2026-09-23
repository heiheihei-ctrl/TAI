# 后端模块：AI（backend-ai）

## 当前状态
- TAI Seedream 5.0 Pro 按 `providerOptions.banana.imageRoute`（兼容 `bananaImageRoute`）分流：normal 使用 ToAPIs `doubao-seedream-5-0-pro` 异步提交/轮询，stable（含未传线路）使用豆包官方 `doubao-seedream-5-0-pro-260628`。分别读取 `TOAPIS_TOKEN` 与 `ARK_API_KEY`/`DOUBAO_API_KEY`，不再受 Watcha 全局配置影响；Linglong 仍走天翼云。
- **Linglong Seedream 5.0 Pro（天翼）**：`DEPLOYMENT_BRAND=linglong` 时统一 `POST https://ai.ctaigw.cn/v1/images/generations`，模型默认 `doubao-seedream-5.0-pro`（`TIANYI_SEEDREAM_MODEL`）。支持文生图、图生图（`image`），以及 `layerDecomposition=true` → `layer_decomposition` 图层拆分（可不填 prompt，需参考图；默认 `watermark=false`）。TAI 品牌忽略该参数。
- 业务后端不再通过独立 `new-api` 网关转发图像、文本或视频请求。
- `Omni Flash Ext` 保留为独立受管视频模型，但默认 vendor 已切回 `APIMart` 直连。
- `generate-image`、`edit-image`、`text-chat` 统一走现有 provider 直连链路；不再存在 `NEW_API_IMAGE_MODELS` / `NEW_API_CHAT_MODELS` 白名单分流。
- `volc-enhance-video` 相关后端入口已移除，不再对外暴露增强任务创建/轮询接口。
- **工作流 Agent**：`POST /api/ai/workflow-chat`（DeepSeek 规划 prompt + Flow 图，SSE；生图由前端节点 Run）。需配置 `DEEPSEEK_API_KEY`。详见 `frontend/docs/22-工作流Agent.md`。
- **Linglong / 星辰 TokenHub**：仅当 `DEPLOYMENT_BRAND=linglong` 时，Seedream / Seedance 新建任务走 `https://ai.ctaigw.cn`。TAI 下即使请求携带 `vendorKey=tianyi` 也会忽略并走受管路线。历史 `tianyi-seedance:` 任务仍可查询。Seedance 1.5 Pro 创建对齐官方示例：`POST /v1/contents/generations/tasks`；查询 `GET /v1/contents/generations/tasks/{taskId}`。模型调用名配置 `TIANYI_SEEDANCE_15_MODEL`。

## 关键文件
- `backend/src/ai/ai.controller.ts`：`/api/ai/*` 主入口。
- `backend/src/ai/workflow-agent/`：对话驱动 Flow 生图工作流 Agent。
- `backend/src/ai/services/video-provider.service.ts`：视频路由与上游提交/轮询。
- `backend/src/ai/services/tianyi-cloud.service.ts`：玲珑品牌天翼云 Seedream/Seedance 客户端。
- `backend/src/ai/services/model-routing.service.ts`：模型管理配置解析，当前保留 `legacy` / `tencent_vod` 两类视频路由。
- `backend/src/ai/providers/*`：图像/文本供应商适配。

## 注意事项
- 阿里云内容审核独立于 ToAPIs 模型调用。审核 SDK 连接/读取超时默认 10/30 秒，可通过 `ALIYUN_GREEN_CONNECT_TIMEOUT_MS` / `ALIYUN_GREEN_READ_TIMEOUT_MS` 配置（1000–120000ms）；文本连接超时仅重试一次，不重试鉴权/业务错误，不改变审核开关、拦截结果或既有失败策略。
- AI 对话框文本请求前端等待 120 秒；Banana 文本通道预算 115 秒，ToAPIs 主备各 55 秒，预留返回时间，超时通过 AbortSignal 取消在途请求。GPT-6 文本模型固定基础价 10 积分，其他文本模型沿用原有定价；部署反向代理的读取超时需覆盖 120 秒。
- `Omni Flash Ext` 仍使用 `backend/src/ai/services/omni-flash-ext.adapter.ts` 做请求规范化，但最终上游为 APIMart 直连。
- 若历史数据库里的 `model_provider_mapping_v2` 仍残留 `new_api` vendor，需要同步改成 `apimart` 或其他现行 vendor，避免旧配置回灌。
- `Sora2VideoService` 里仍有独立上游 `newapi.megabyai.cc` 兼容逻辑；这不是仓库内已移除的 `new-api` 网关。
- 工作流 Agent **不**在后端调生图 API，避免与 Flow 节点计费分叉；未配置 DeepSeek 时接口返回明确错误。
- Linglong 下 Seedance **仅 1.5 Pro**：配置 `TIANYI_SEEDANCE_15_MODEL`（也兼容 `TIANYI_SEEDANCE_MODEL`；默认 `doubao-seedance-1-5-pro-251215`）。前端隐藏 2.x 模型选项与 `seedance20Video` 节点；后端强制走 1.5-pro。任务 ID 前缀为 `tianyi-seedance:`。
