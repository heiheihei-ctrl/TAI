# P1 联调环境启动清单

> 目标：让 TAI 后端在本机跑起来，使 tgagent 的 `POST /chat` 能被真实调用，
> 结束「零运行验证」状态。
>
> 本文所有路径与配置项均于 2026-08-30 逐项核实（源码级），非文档转述。
> 前置状态已确认：backend 依赖已装、prisma CLI 可用、client 已生成。

---

## 0. 先看清现状（已核实）

| 项 | 状态 |
|---|---|
| `backend/node_modules` | ✅ 已装（1036 包） |
| `node_modules/.bin/prisma` | ✅ 可用 |
| `node_modules/.prisma/client` | ✅ 已生成（省掉 generate 一步） |
| `backend/.env` | ❌ **缺失** |
| `backend/docker-compose.yml` 的 `db:` | ❌ **整段被注释** |
| `AI_API_KEYS` | ❌ 未配 |
| Docker | ⚠️ **当前不可用/未启动** |
| `.env.example` | ❌ 仓库里没有，只能从代码反推 |

⚠️ **没有 `.env.example`，且 `ConfigModule` 未配置 `validationSchema`**——
缺变量不会在启动时报清晰错误，而是等到运行时才炸。所以务必按本文逐项配齐。

---

## 1. 唯一硬阻塞：数据库

两条路线，**二选一**。

### 路线 A：Docker（推荐，但需先启动 Docker Desktop）

⚠️ 当前 `docker --version` 无输出。先启动 Docker Desktop 再继续。

`backend/docker-compose.yml` 里 `db:` 服务整段被注释，需手动取消注释。

编辑 `backend/docker-compose.yml`，把第 2–17 行的 `# db:` 整段（含 `image`、`ports`、
`environment`、`volumes`、`healthcheck`）前的 `#` 去掉。取消后应为：

```yaml
services:
  db:
    image: docker.1ms.run/library/postgres:16-alpine
    container_name: tanva-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-postgres}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}
      POSTGRES_DB: ${POSTGRES_DB:-tanva}
    volumes:
      - tanva_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test:
        ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-tanva}"]
      interval: 5s
      timeout: 3s
      retries: 10
```

> `volumes` 里引用了 `tanva_postgres_data`，需确认文件末尾有同名具名卷声明；
> 没有就补一段 `volumes: { tanva_postgres_data: }`。

然后：

```bash
cd backend
docker compose up -d db
docker compose ps          # 确认 healthy
```

顺带建议把注释里的 `adminer`（5051 端口）也放开，方便直观看数据。

### 路线 B：本地 PostgreSQL（Docker 不可用时的退路）

装 PostgreSQL 16，建库 `tanva`，用户 `postgres` / 密码 `postgres`，端口 5432。
本机已有 PostgreSQL 的话直接建库即可。

```bash
psql -U postgres -c "CREATE DATABASE tanva;"
```

---

## 2. 创建 `backend/.env`

`ConfigModule` 只读两个位置：`backend/.env` 或 `TAI/.env`（`app.module.ts:35`）。
**别放错目录，否则静默读不到。**

最小可用配置：

```bash
# ── 数据库 ──
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tanva?schema=public"

# ── 服务 ──
PORT=4000

# ── 服务间鉴权：tgagent 的 TAI_API_TOKEN 必须在这个逗号分隔列表里 ──
# 读取处 api-key-or-jwt.guard.ts:22，按逗号 split + trim + 去空
AI_API_KEYS="tgagent-dev-key"

# ── JWT（有默认值，本地可省略；生产必须换） ──
# 默认 fallback：dev-access-secret / dev-refresh-secret（auth.service.ts:176,181）
JWT_ACCESS_SECRET="dev-access-secret"
JWT_REFRESH_SECRET="dev-refresh-secret"
```

其余（OSS、短信、各 AI provider 的 key）是**功能级**依赖，不影响服务启动与
`architecture-chat` 端点连通性；缺了会在调用具体生图能力时才报错，可后续补。

`.env` 已在 `.gitignore` 内，不要提交。

---

## 3. 执行 migration

⚠️ **50 个 migration 在 `backend/prisma/migrations/*/migration.sql`（Prisma 风格），
不是 `backend/migrations/`。** 按后者找会得到 0 个，误判成"不存在"。

另外 `package.json` 里**没有 migrate 脚本**，得直接调 prisma CLI：

```bash
cd backend
npx prisma migrate deploy
npx prisma migrate status    # 确认全部 applied
```

想确认库真的建起来了：

```bash
npx prisma db pull --print   # 或 psql -U postgres -d tanva -c "\dt"
```

---

## 4. 启动后端

```bash
cd backend
npm run dev
```

- 启动命令是 `ts-node-dev --respawn --transpile-only`（`package.json` 的 `dev`）
- 端口默认 **4000**（`main.ts:307`，读 `PORT`）
- 全局前缀是 `api`（`main.ts:198`），故实际路径 `/api/ai/architecture-chat`

看到 `API listening on http://localhost:4000` 即起成功。

---

## 5. 验证链路

### 5.1 服务活着

```bash
curl http://localhost:4000/api/health
```

### 5.2 architecture-chat 端点通（这是 P2 的验收点）

```bash
curl -N -X POST http://localhost:4000/api/ai/architecture-chat \
  -H "content-type: application/json" \
  -H "x-api-key: tgagent-dev-key" \
  -d '{"projectId":"p_smoke","prompt":"帮我出一个滨江办公楼的黄昏效果图"}'
```

⚠️ **这里必须用 `x-api-key`（联调模式），不要带 `Authorization`。**
两者同时携带时守卫优先判 apiKey → `getUserId()` 返回 null → 不扣积分，
且全程不报错（`ai.controller.ts:725` + `api-key-or-jwt.guard.ts:29`）。

预期返回 SSE 流（`text/event-stream`），含 `brief.updated`、`conversation.delta`，
结尾 `event: done`。

### 5.3 tgagent 侧切换到 TAI 源

在 `tgagent/.env`：

```bash
TASK_SOURCE=tai
TAI_API_BASE_URL=http://localhost:4000
TAI_API_TOKEN=tgagent-dev-key        # 必须在上面的 AI_API_KEYS 列表里
TAI_IMAGE_PROVIDER=banana-3.1
TAI_VIDEO_PROVIDER=kling-o3
```

然后：

```bash
cd tgagent
npm run typecheck
npm test          # 9/9，离线假后端，不需要真 TAI
npm run smoke     # 5/5
```

再起 tgagent：`npm run dev`（网关 ws://localhost:8712/ws）。

---

## 6. 常见坑

| 现象 | 原因 | 处理 |
|---|---|---|
| 启动即退，报 Prisma 连不上 | `.env` 放错目录 | 必须在 `backend/.env` 或 `TAI/.env` |
| 401 | `AI_API_KEYS` 未配，或 token 不在逗号列表里 | 检查 split/trim 后的值完全相等 |
| 请求成功但**不扣积分** | 同时带了 `x-api-key` 和 `Authorization` | 二选一，别混用 |
| `npx prisma migrate deploy` 报找不到 migration | 找错目录 | 是 `prisma/migrations/`，不是 `migrations/` |
| 缺某个 OSS/SMS 变量 | 功能级依赖 | 不影响启动；等调到具体能力再补 |
| 端口冲突 | 默认 4000 | 改 `.env` 的 `PORT` |

---

## 7. 做完这一步之后

P1 解除，可以推进：

1. **P2 运行期验证**——三个从未跑过的点：Fastify 流式写法、axios 流管道、守卫行为
2. **P3 前端分流**——`aiChatStore.ts` 增列 `"architecture"`
   ⚠️ `manualToolMap` 在 **`:7249` 和 `:7680` 两处**重复定义，别只改一处
   （`docs/TAI-INTEGRATION-PLAN.md` §4 只记录了 7249，实际有两处）
3. **P4 能力迁移**——Brief 面板、血缘连线、候选择优、视频进度卡迁入 TAI 前端
