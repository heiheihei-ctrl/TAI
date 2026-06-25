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
- `src/providers-adapters/*`：上游 provider 适配层，当前含 `dummy` 实现和 `volcengine/openai/apimart` 骨架。

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

## 当前状态

- 已完成基础设施和扩展点。
- 真实模型接入目前只提供骨架，后续按 provider adapter 扩展。
