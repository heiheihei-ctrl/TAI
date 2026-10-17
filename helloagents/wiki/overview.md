# 项目概述

## Tanva 是什么
Tanva 是一个基于 Paper.js 的专业绘图应用，前端提供画布/流程（Flow）等交互能力，后端提供认证、项目、素材、AI 能力以及积分/管理后台等服务。

## 第三方组件清单

- [Excel 版组件清单](../../outputs/component-inventory/Tanva-开源及第三方组件清单.xlsx)：与精简清单一致的 28 项核心组件，保留四列表格与许可说明。

- [开源及第三方组件清单](../../outputs/component-inventory/Tanva-开源及第三方组件清单.html)：2026-10-16 核对后选列 28 项核心组件，名称使用常用库名，包含版本、提供方、许可及用途；保留阿里云内容安全审核 SDK，排除 tgAgent 及开发工具。
- [引用与许可核验明细](../../outputs/component-inventory/component-evidence.json)：保留版本声明、锁定版本、代码引用位置及许可来源；不代表完整传递依赖或生产部署审计。

## 运行方式（本地开发）
- 前端：`cd frontend && npm i && npm run dev`（默认 `http://localhost:5173`）
- 后端：`cd backend && npm i && npm run dev`（默认 `http://localhost:4000`，API 前缀 `/api`）

## 模块索引
### 前端（`frontend/src`）
- `wiki/modules/supply-chain-gallery.md`：玲珑供应链公共图库后台上传、上架与会员读取。
- `wiki/modules/frontend-app.md`：应用入口与路由
- `wiki/modules/frontend-canvas.md`：画布与 Paper.js 相关
- `wiki/modules/frontend-flow.md`：Flow/节点编排（ReactFlow）
- `wiki/modules/frontend-services.md`：HTTP/AI 等服务层
- `wiki/modules/frontend-stores.md`：状态管理（Zustand）

### 后端（`backend/src`）
- `wiki/modules/backend-app.md`：启动与全局中间件（Fastify/Nest）
- `wiki/modules/backend-auth.md`：认证与会话
- `wiki/modules/backend-users.md`：用户与账户
- `wiki/modules/backend-projects.md`：项目存储与读写
- `wiki/modules/backend-oss.md`：文件/素材/上传与视频帧
- `wiki/modules/backend-ai.md`：AI 能力（生成/分析/工具选择等）
- `wiki/modules/backend-ai-public.md`：公开 AI API（`/api/public/ai`）
- `wiki/modules/backend-credits.md`：积分与计费
- `wiki/modules/backend-admin.md`：管理后台
- `wiki/modules/backend-invites.md`：邀请码
- `wiki/modules/backend-personal-library.md`：个人素材库
- `wiki/modules/backend-global-image-history.md`：全局图片历史
- `wiki/modules/backend-templates.md`：公共模板
- `wiki/modules/backend-prisma.md`：数据访问层（Prisma）

