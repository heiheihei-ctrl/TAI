# 后端模块：AI（backend-ai）

## 当前状态
- 业务后端不再通过独立 `new-api` 网关转发图像、文本或视频请求。
- `Omni Flash Ext` 保留为独立受管视频模型，但默认 vendor 已切回 `APIMart` 直连。
- `generate-image`、`edit-image`、`text-chat` 统一走现有 provider 直连链路；不再存在 `NEW_API_IMAGE_MODELS` / `NEW_API_CHAT_MODELS` 白名单分流。
- `volc-enhance-video` 相关后端入口已移除，不再对外暴露增强任务创建/轮询接口。

## 关键文件
- `backend/src/ai/ai.controller.ts`：`/api/ai/*` 主入口。
- `backend/src/ai/services/video-provider.service.ts`：视频路由与上游提交/轮询。
- `backend/src/ai/services/model-routing.service.ts`：模型管理配置解析，当前保留 `legacy` / `tencent_vod` 两类视频路由。
- `backend/src/ai/providers/*`：图像/文本供应商适配。

## 注意事项
- `Omni Flash Ext` 仍使用 `backend/src/ai/services/omni-flash-ext.adapter.ts` 做请求规范化，但最终上游为 APIMart 直连。
- 若历史数据库里的 `model_provider_mapping_v2` 仍残留 `new_api` vendor，需要同步改成 `apimart` 或其他现行 vendor，避免旧配置回灌。
- `Sora2VideoService` 里仍有独立上游 `newapi.megabyai.cc` 兼容逻辑；这不是仓库内已移除的 `new-api` 网关。
