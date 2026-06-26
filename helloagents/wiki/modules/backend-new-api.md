# 后端模块：new-api

## 作用

- 独立于业务后端的 AI 网关服务，目录在 `apps/new-api/`。
- 负责第三方凭据托管、统一 Bearer Token 鉴权、provider/channel/model 路由、异步任务状态归一化、请求审计和最小管理接口。

## 技术栈

- NestJS
- Prisma + PostgreSQL
- Redis
- Docker Compose
- Jest + Supertest

## 核心模块

- `src/modules/health/*`：`GET /api/status`，检查 DB/Redis 健康状态。
- `src/modules/auth/*`：统一 Bearer Token 校验，支持 bootstrap token 和 DB token。
- `src/modules/providers|channels|models/*`：注册中心与管理服务。
- `src/modules/routing/*`：根据 `modelKey` 选择可用 mapping 和 provider adapter。
- `src/modules/tasks/*`：统一异步任务入库、提交、查询、状态更新。
- `src/modules/audit/*`：请求日志和渠道健康日志。
- `src/modules/admin/*`：最小管理接口。
- `src/gateways/video|image|chat/*`：对外统一业务协议。
- `src/providers-adapters/*`：上游 provider 适配层，当前含 `dummy`、`tencent-vod`，以及 `volcengine/openai/apimart` 扩展点；`apimart` 已支持 chat completions 与 Omni Flash Ext 视频。

## 数据模型

- `api_tokens`
- `providers`
- `channels`
- `models`
- `model_provider_mapping`
- `tasks`
- `request_logs`
- `channel_health_logs`

## 使用方式

- 本地开发入口：`cd apps/new-api && npm run start:dev`
- Docker 入口：`cd apps/new-api && docker compose up -d`
- 第一个后台调用 token 通过 `POST /admin/tokens` 创建，初始化依赖 `NEW_API_BOOTSTRAP_TOKEN`
- Apimart 国内服务器代理：设置 `API_PROXY_URL=socks5h://user:pass@host:port` 后，Apimart adapter 会通过 SOCKS5H 转发请求；为空直连，非 `socks5h://` 会报错，避免本地 DNS 污染。

## 当前状态

- 已完成基础设施和扩展点。
- APIMart chat completions 和 Omni Flash Ext 视频已具备真实上游请求能力，其它 provider 继续按 adapter 扩展。
