# 后端模块：AI（backend-ai）

## 当前状态
- ToAPIs Seedance 2.0/Fast/2.5 请求合约、素材角色、整数秒计费及任务查询已按文档核验；首尾帧和多模态参考分离，审核等待与备用视频下载处理详见 [`seedance-toapis.md`](../seedance-toapis.md)。1.5 当前仍使用官方线路。
- Seedance 2.5 对非会员开放：前端不锁定选项、不自动回退至 1.5；后端权益校验排除 2.5，2.0 / Fast 保留原有规则。
- TAI Seedream 5.0 Pro 按 `providerOptions.banana.imageRoute`（兼容 `bananaImageRoute`）分流：normal 使用 ToAPIs `doubao-seedream-5-0-pro` 异步提交/轮询，stable（含未传线路）使用豆包官方 `doubao-seedream-5-0-pro-260628`。分别读取 `TOAPIS_TOKEN` 与 `ARK_API_KEY`/`DOUBAO_API_KEY`，不再受 Watcha 全局配置影响。**Linglong 已下线 Seedream**（面板隐藏 `seedream5`/`seedream5Pro`，后端拒绝生图）。
- 业务后端不再通过独立 `new-api` 网关转发图像、文本或视频请求。
- `Omni Flash Ext` 保留为独立受管视频模型，但默认 vendor 已切回 `APIMart` 直连。
- `generate-image`、`edit-image`、`text-chat` 统一走现有 provider 直连链路；不再存在 `NEW_API_IMAGE_MODELS` / `NEW_API_CHAT_MODELS` 白名单分流。
- `volc-enhance-video` 相关后端入口已移除，不再对外暴露增强任务创建/轮询接口。
- **工作流 Agent**：`POST /api/ai/workflow-chat`（DeepSeek 规划 prompt + Flow 图，SSE；生图由前端节点 Run）。需配置 `DEEPSEEK_API_KEY`。详见 `frontend/docs/22-工作流Agent.md`。
- **Linglong / Seedance（91model.ai）**：仅当 `DEPLOYMENT_BRAND=linglong` 时，Seedance 新建/查询走 `TIANYI_SEEDANCE_BASE_URL`（默认 `https://91model.ai`）：`POST/GET /v1/contents/generations/tasks`。钥匙填 `TIANYI_SEEDANCE_API_KEY`。仅支持 **2.0 / 2.5**（`TIANYI_SEEDANCE_20_MODEL=doubao-seedance-2-0`，`TIANYI_SEEDANCE_25_MODEL=doubao-seedance-2-5`）。面板保留 Seedance + **GPT-Image-2** + 免费节点（无 Seedream）。历史 `tianyi-seedance:` 任务仍可查询。
- **Linglong / GPT-Image-2（91model.ai）**：文生图 `POST /v1/images/generations`，请求体对齐文档：**仅** `model` / `prompt` / `n` / `size`（`auto` 或 `1024x1024`/`1536x1024`/`1024x1536`）；**不要传 `response_format`**（文档写明不支持，**只以 `b64_json` 输出**）。后端优先解析 `data[].b64_json` → `imageData` → 本地/OSS 落盘。图生图走 `POST /v1/images/edits`。TAI 仍走 ToAPIs。积分：相对 TAI 价 **上浮 85%**（×1.85）。
- **Linglong / 91model 出站网络**：`TianyiCloudService` **直连** `91model.ai`，**不**使用 ToAPIs 的 `API_PROXY_URL` / 全局 `HTTP(S)_PROXY`。可选 `TIANYI_HTTP_TIMEOUT_MS`（默认 180000）。
- **Linglong / 星辰 TokenHub（Seedream）**：已下线；不再走 `ai.ctaigw.cn` 生图。

## 关键文件
- `backend/src/ai/ai.controller.ts`：`/api/ai/*` 主入口。
- `backend/src/ai/workflow-agent/`：对话驱动 Flow 生图工作流 Agent。
- `backend/src/ai/services/video-provider.service.ts`：视频路由与上游提交/轮询。
- `backend/src/ai/services/tianyi-cloud.service.ts`：玲珑品牌 Seedance（91model.ai）客户端。
- `backend/src/ai/services/model-routing.service.ts`：模型管理配置解析，当前保留 `legacy` / `tencent_vod` 两类视频路由。
- `backend/src/ai/providers/*`：图像/文本供应商适配。

## 注意事项
- Seedance 官方/尊享线路优先读取 `DOUBAO_API_KEY`，未配置或为空时兼容 `ARK_API_KEY`；不再使用内置旧密钥。两者均已配置时仍以 `DOUBAO_API_KEY` 为准，更新密钥应同步检查两项并重启所有后端实例；仅在控制台创建新密钥不会替换进程中的旧值。
- 阿里云内容审核独立于 ToAPIs 模型调用。**`DEPLOYMENT_BRAND=linglong` 时整条审核链路关闭**（不请求 green-cip）。TAI 下审核 SDK 连接/读取超时默认 10/30 秒，可通过 `ALIYUN_GREEN_CONNECT_TIMEOUT_MS` / `ALIYUN_GREEN_READ_TIMEOUT_MS` 配置（1000–120000ms）；文本连接超时仅重试一次，不重试鉴权/业务错误，不改变审核开关、拦截结果或既有失败策略。
- AI 对话框文本请求前端等待 120 秒；Banana 文本通道预算 115 秒，ToAPIs 主备各 55 秒，预留返回时间，超时通过 AbortSignal 取消在途请求。GPT-6 文本模型固定基础价 10 积分，其他文本模型沿用原有定价；部署反向代理的读取超时需覆盖 120 秒。
- `Omni Flash Ext` 仍使用 `backend/src/ai/services/omni-flash-ext.adapter.ts` 做请求规范化，但最终上游为 APIMart 直连。
- 若历史数据库里的 `model_provider_mapping_v2` 仍残留 `new_api` vendor，需要同步改成 `apimart` 或其他现行 vendor，避免旧配置回灌。
- `Sora2VideoService` 里仍有独立上游 `newapi.megabyai.cc` 兼容逻辑；这不是仓库内已移除的 `new-api` 网关。
- 工作流 Agent **不**在后端调生图 API，避免与 Flow 节点计费分叉；未配置 DeepSeek 时接口返回明确错误。
- Linglong 下 Seedance 仅 **2.0 / 2.5**（`TIANYI_SEEDANCE_20_MODEL` / `TIANYI_SEEDANCE_25_MODEL`，默认 `doubao-seedance-2-0` / `doubao-seedance-2-5`），网关 `TIANYI_SEEDANCE_BASE_URL=https://91model.ai`。前端隐藏 `doubaoVideo`（原 1.5 入口），开放 `seedance20Video`；后端将历史 1.5 请求升到 2.0。任务 ID 前缀为 `tianyi-seedance:`。
