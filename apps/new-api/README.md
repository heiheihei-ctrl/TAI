# new-api

`new-api` 是 Tanva 的独立 AI 网关服务，位于 `apps/new-api/`。它负责第三方模型凭据托管、统一协议、模型路由、异步任务归一化、日志审计和最小管理接口，供业务后端通过统一 Bearer Token 调用。

## 项目目标

- 前端不接触第三方模型平台，也不保存第三方密钥。
- 业务后端只保存 `NEW_API_BASE_URL` 和 `NEW_API_KEY`。
- `new-api` 统一管理 provider/channel/model/mapping，并对上游请求做适配。
- 后续新增模型时，尽量不改业务后端协议。

## 架构说明

链路：

`Frontend -> Business Backend -> new-api -> Upstream Provider`

当前阶段已实现：

- NestJS + Prisma + PostgreSQL + Redis 独立服务骨架
- Bearer Token 鉴权，支持 DB token 与 bootstrap token
- `provider / channel / model / model-mapping / task / request-log / channel-health-log` 数据模型
- 统一视频异步任务协议
- 图片生成、图片编辑、聊天补全接口骨架
- `DummyAdapter` 演示适配器
- `Volcengine/OpenAI/APIMart` 适配器骨架
- 最小 admin API
- Docker Compose、本地 README、基础 e2e/unit 测试
- 第一个真实视频 provider：`APIMart`（当前先支持 `omni-flash-ext`）
- 腾讯直连真实视频 provider：`tencent_vod`（当前先支持 `kling-3.0`）

当前阶段未完成：

- 真实上游 provider 的完整接入
- 流式 chat
- webhook/callback 投递
- 复杂限流和结算

## 目录结构

```text
apps/new-api/
  src/
    common/
    modules/
    gateways/
    providers-adapters/
    prisma/
  prisma/
    schema.prisma
    migrations/
  test/
  docker-compose.yml
  .env.example
  README.md
```

## 环境变量说明

见 [`.env.example`](./.env.example)：

- `PORT`：服务端口，默认 `4455`
- `DATABASE_URL`：PostgreSQL 连接串
- `REDIS_URL`：Redis 连接串
- `NEW_API_BOOTSTRAP_TOKEN`：初始化阶段的管理员 Bearer Token
- `SESSION_SECRET`：保留配置项
- `REQUEST_TIMEOUT_MS`：请求超时
- `LOG_LEVEL`：日志等级

启动时会校验关键环境变量，缺失会直接报错退出。

## 本地启动步骤

1. 复制环境变量：

```bash
cd apps/new-api
cp .env.example .env
```

2. 启动依赖：

```bash
docker compose up -d postgres redis
```

3. 安装依赖并初始化 Prisma：

```bash
npm install
npm run prisma:generate
npm run prisma:migrate:dev
```

4. 启动服务：

```bash
npm run start:dev
```

如果要整套容器启动：

```bash
docker compose up -d
```

容器内启动命令会自动执行 `prisma migrate deploy`。

## DB 初始化步骤

开发环境：

```bash
npm run prisma:migrate:dev
```

部署环境：

```bash
npm run prisma:migrate:deploy
```

当前不需要额外 seed。初始化使用 bootstrap token 直接调用 admin API 即可。

## 如何创建第一个 token

服务启动后，使用 `.env` 里的 `NEW_API_BOOTSTRAP_TOKEN` 访问 admin API：

```bash
curl -X POST http://localhost:4455/admin/tokens \
  -H "Authorization: Bearer change_me_bootstrap_token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "business-backend",
    "scopes": ["admin", "gateway"]
  }'
```

返回结果中的 `data.token` 只会出现一次。业务后端后续应使用这个 token，而不是 bootstrap token。

## 如何创建 provider/channel/model/mapping

1. 创建 provider：

```bash
curl -X POST http://localhost:4455/admin/providers \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "providerKey": "dummy",
    "name": "Dummy Provider",
    "type": "demo"
  }'
```

2. 创建 channel：

```bash
curl -X POST http://localhost:4455/admin/channels \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "<PROVIDER_ID>",
    "channelKey": "dummy-main",
    "name": "Dummy Main",
    "credentialType": "none"
  }'
```

3. 创建 model：

```bash
curl -X POST http://localhost:4455/admin/models \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "modelKey": "dummy-video",
    "name": "Dummy Video",
    "taskType": "video",
    "protocolType": "task"
  }'
```

4. 创建 mapping：

```bash
curl -X POST http://localhost:4455/admin/model-mappings \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "modelId": "<MODEL_ID>",
    "providerId": "<PROVIDER_ID>",
    "channelId": "<CHANNEL_ID>",
    "routeKey": "dummy.video"
  }'
```

## 如何调用 `/v1/videos`

提交任务：

```bash
curl -X POST http://localhost:4455/v1/videos \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "dummy-video",
    "prompt": "generate a short demo clip",
    "metadata": {
      "projectId": "demo-project"
    }
  }'
```

查询任务：

```bash
curl http://localhost:4455/v1/videos/<TASK_ID> \
  -H "Authorization: Bearer <TOKEN>"
```

如果模型存在但未配置 route，会返回：

```json
{
  "success": false,
  "error": {
    "code": "MODEL_ROUTE_NOT_CONFIGURED",
    "message": "model route not configured"
  }
}
```

### APIMart / Omni Flash Ext 真实视频示例

如果要接第一条真实视频链路，推荐先配置：

- provider: `apimart`
- model: `omni-flash-ext`

示例 channel：

```bash
curl -X POST http://localhost:4455/admin/channels \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "<APIMART_PROVIDER_ID>",
    "channelKey": "apimart-main",
    "name": "APIMart Main",
    "baseUrl": "https://api.apimart.ai",
    "credentialType": "bearer",
    "credentialsJson": {
      "apiKey": "<APIMART_API_KEY>"
    },
    "timeoutMs": 30000
  }'
```

说明：

- `credentialsJson.apiKey` 为必填。
- `ApimartAdapter` 已支持 `POST /v1/chat/completions`，以及 `modelKey = "omni-flash-ext"` 的视频提交与查询。
- 国内服务器访问 APIMart 时可配置环境变量 `API_PROXY_URL=socks5h://user:pass@host:port`；必须使用 `socks5h://`，否则会拒绝启动该代理请求，避免本地 DNS 污染。
- 业务后端若通过 `generate-video-provider` 走 `omni-flash-ext`，应保持 `managedModelKey = "omni-flash-ext"`。

### Tencent VOD / Kling 3.0 真实视频示例

如果服务器当前可直连腾讯云，推荐优先配置：

- provider: `tencent_vod`
- model: `kling-3.0`

示例 channel：

```bash
curl -X POST http://localhost:4455/admin/channels \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "providerId": "<TENCENT_VOD_PROVIDER_ID>",
    "channelKey": "tencent-vod-main",
    "name": "Tencent VOD Main",
    "baseUrl": "https://vod.tencentcloudapi.com",
    "credentialType": "tencent_vod",
    "credentialsJson": {
      "secretId": "<TENCENT_VOD_SECRET_ID>",
      "secretKey": "<TENCENT_VOD_SECRET_KEY>",
      "subAppId": 1427717337,
      "region": "ap-guangzhou",
      "apiVersion": "2018-07-17"
    },
    "timeoutMs": 30000
  }'
```

说明：

- `TencentVodAdapter` 当前只实现了 `modelKey = "kling-3.0"` 的视频提交与查询。
- 业务后端若通过 `generate-video-provider` 走 `kling-3.0`，应显式传 `klingModel = "kling-v3-0"`，避免控制器落回 `kling-2.6` 分支。

## 后端联调验证

已验证一个最小灰度样板：

- managed model: `kling-3.0`
- backend route: `new_api`
- `new-api` model mapping target: `dummy.video`

联调目标链路：

`Client -> Backend -> new-api -> dummy provider -> new-api -> Backend`

关键步骤：

1. `new-api` 中创建与后端 managed model 同名的 model，例如 `kling-3.0`。
2. 为该 model 建立 provider/channel mapping；当前阶段可先映射到 `dummy`。
3. 业务后端在 `model_provider_mapping_v2` 中将对应 model 的 `defaultVendor` 切到 `new_api`，并补充 `vendorKey/platformKey/route = "new_api"` 的 vendor。
4. 业务后端配置：

```env
NEW_API_BASE_URL=http://127.0.0.1:4455
NEW_API_KEY=<gateway token>
```

5. 本地开发若启用了系统代理，必须避免 backend 对 `127.0.0.1:4455` 走代理：

```env
NO_PROXY=127.0.0.1,localhost
HTTP_PROXY=
HTTPS_PROXY=
ALL_PROXY=
```

6. `kling` 联调时，请求体除了 `managedModelKey = "kling-3.0"`，还需要显式传 `klingModel = "kling-v3-0"`；否则业务后端会落回 `kling-2.6` 分支。

成功标志：

- 后端提交返回 `taskId` 形如 `new-api:task_xxx`
- 后端轮询 `/api/ai/video-task/:provider/:taskId` 返回 `succeeded`
- `new-api` 控制台可看到 `/v1/videos` 与 `/v1/videos/:taskId` 请求

## 测试

```bash
npm test
npm run test:e2e
```

测试覆盖：

- `health.e2e`
- `auth.e2e`
- `admin.e2e`
- `video.e2e`
- `routing.service.spec`
- `task-status.util.spec`
