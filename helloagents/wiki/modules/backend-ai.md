# 后端模块：AI（backend-ai）

## 当前状态
- 业务后端不再通过独立 `new-api` 网关转发图像、文本或视频请求。
- `Omni Flash Ext` 保留为独立受管视频模型，但默认 vendor 已切回 `APIMart` 直连。
- `generate-image`、`edit-image`、`text-chat` 统一走现有 provider 直连链路；不再存在 `NEW_API_IMAGE_MODELS` / `NEW_API_CHAT_MODELS` 白名单分流。
- `volc-enhance-video` 相关后端入口已移除，不再对外暴露增强任务创建/轮询接口。
- **工作流 Agent**：`POST /api/ai/workflow-chat`（DeepSeek 规划 prompt + Flow 图，SSE；生图由前端节点 Run）。需配置 `DEEPSEEK_API_KEY`。详见 `frontend/docs/22-工作流Agent.md`。
- **Linglong / 星辰 TokenHub**：当 `DEPLOYMENT_BRAND=linglong`（或请求 `vendorKey=tianyi`）时，Seedream / Seedance 统一走 `https://ai.ctaigw.cn`。Seedance 1.5 Pro 创建任务对齐官方示例：`POST /v1/contents/generations/tasks`（`model` + `content` + `ratio` + `duration` + `watermark`），查询 `GET /v1/contents/generations/tasks/{taskId}`。模型调用名配置 `TIANYI_SEEDANCE_15_MODEL`（须在 TokenHub 控制台开通）。

## 关键文件
- `backend/src/ai/ai.controller.ts`：`/api/ai/*` 主入口。
- `backend/src/ai/workflow-agent/`：对话驱动 Flow 生图工作流 Agent。
- `backend/src/ai/services/video-provider.service.ts`：视频路由与上游提交/轮询。
- `backend/src/ai/services/tianyi-cloud.service.ts`：玲珑品牌天翼云 Seedream/Seedance 客户端。
- `backend/src/ai/services/model-routing.service.ts`：模型管理配置解析，当前保留 `legacy` / `tencent_vod` 两类视频路由。
- `backend/src/ai/providers/*`：图像/文本供应商适配。

## 注意事项
- `Omni Flash Ext` 仍使用 `backend/src/ai/services/omni-flash-ext.adapter.ts` 做请求规范化，但最终上游为 APIMart 直连。
- 若历史数据库里的 `model_provider_mapping_v2` 仍残留 `new_api` vendor，需要同步改成 `apimart` 或其他现行 vendor，避免旧配置回灌。
- `Sora2VideoService` 里仍有独立上游 `newapi.megabyai.cc` 兼容逻辑；这不是仓库内已移除的 `new-api` 网关。
- 工作流 Agent **不**在后端调生图 API，避免与 Flow 节点计费分叉；未配置 DeepSeek 时接口返回明确错误。
- Linglong 下 Seedance **仅 1.5 Pro**：配置 `TIANYI_SEEDANCE_15_MODEL`（也兼容 `TIANYI_SEEDANCE_MODEL`；默认 `doubao-seedance-1-5-pro-251215`）。前端隐藏 2.x 模型选项与 `seedance20Video` 节点；后端强制走 1.5-pro。任务 ID 前缀为 `tianyi-seedance:`。
