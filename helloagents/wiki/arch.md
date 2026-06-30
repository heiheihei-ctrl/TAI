# 架构设计

## 总览
```mermaid
flowchart LR
  Browser[浏览器\nReact + Vite] -->|HTTP /api| API[NestJS + Fastify]
  API --> DB[(PostgreSQL)]
  API --> OSS[对象存储\nOSS/Assets/Uploads]
  API --> AI[外部 AI Provider\nGemini 等]
```

## 前端
- 使用 React Router 进行路由，受保护路由通过 `ProtectedRoute` 控制。
- 画布/流程相关能力主要位于 `frontend/src/components/`，并通过 `services/` 与后端交互。
- 可缩放流程节点将持久化的 `boxH` 作为最小高度，实际高度由内容自然撑开；不要通过观察器持续累加并写回高度。

## 后端
- NestJS + Fastify adapter，启用压缩、Helmet、Cookie、Multipart、CORS。
- 全局前缀 `/api`，Swagger 暴露在 `/api/docs`。
- Prisma 负责数据访问，数据源通过 `DATABASE_URL` 连接 PostgreSQL。
- 业务后端当前直接对接外部 AI Provider；不再维护独立 `new-api` 网关层。

## 关键关注点
- 认证：Cookie + JWT（以代码为准，见 `backend/src/auth/*`）
- 代理：启动时为 undici 配置 ProxyAgent，解决 Node.js 20+ 下部分库代理问题（见 `backend/src/main.ts`）
- 大请求体：后端 `bodyLimit` 放宽至 200MB（适配项目内容）

