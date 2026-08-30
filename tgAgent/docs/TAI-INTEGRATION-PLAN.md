# tgagent 接入 TAI 平台 · 技术规划

> 目标：**tgagent 服务于 TAI 平台**。终态是在 TAI 已有的 AI 对话框里新增「建筑设计师模式」，由 tgagent 提供大脑能力，而不是另起独立前端。
> 本文基于 2026-08-28 对两个仓库的源码级核对。基线：tgagent 无 git；TAI `b8f19ba`（2026-08-27 18:00，与 origin/main 一致）。

---

## 1. 定位重定义（最重要的一条）

| | 当前形态 | 终态 |
|---|---|---|
| 前端 | `qianduan/` 自研 Next.js 画布（1249 行） | **TAI 平台前端**（React Flow 11，7.87 万行） |
| 通信 | 前端直连 `ws://tgagent:8712/ws` | 走 TAI 后端端点 |
| 鉴权/积分 | 自研（`WS_TOKEN` 可选，实际不鉴权） | 复用 TAI JWT + 积分体系 |
| tgagent 角色 | 独立全栈应用 | **TAI 的领域大脑服务** |

**结论：`qianduan/` 应降级为原型与契约验证器，不是交付物。** 它的价值在于已验证了交互形态（Brief 面板、候选择优、视频进度卡），这些 UI 概念要迁移到 TAI 前端重做，而不是把 qianduan 塞进平台。

注意一个已确认的事实偏差：DESIGN.md §12.3 称「画布内核为 React Flow」——那是 **TAI 平台**的事实（`frontend/package.json` 有 `reactflow ^11.11.4`），qianduan 从未使用 React Flow。规划时应以 TAI 前端为准。

---

## 2. 现状盘点

### tgagent 可复用的资产（移植价值高）
- `src/agent/` — pi SDK 大脑装配、三层降级（PiBrain → ScriptedBrain）
- `src/agent/tools/` — 5 个领域工具（brief / 生图 / 视频 / 参考分析 / PPT）
- `src/agent/templates/` — 渲染词库 + PPT 模板（360 行，70 个断言守卫）
- `src/shared/brief.ts` — DesignBrief 结构（需求档案，产品差异化核心）
- `src/canvas/layout.ts` — 落位避让算法

### TAI 平台已具备、tgagent 不必重造的
- 画布与节点系统（30+ 节点类型，React Flow 11）
- 撤销/重做（`services/historyService.ts`，**快照式**）
- 会话持久化、鉴权、积分、内容审核
- 生图/生视频全链路（多 provider 路由）

---

## 3. 三个接入方案与取舍

| 方案 | 做法 | 优点 | 缺点 |
|---|---|---|---|
| **A. 前端直连** | TAI 前端新增模式 → 直连 tgagent ws | tgagent 几乎不改 | 绕过 TAI 鉴权与积分；前端要写 ws 客户端；两套消息体系并存 |
| **B. BFF 转发**（推荐） | TAI 后端新增端点 → 内部转发 tgagent | 鉴权/积分/审计统一；前端只加一个模式分支；tgagent 技术栈自由 | 需打通流式转发 |
| **C. 嵌入 NestJS** | tgagent 改造成 TAI 的一个 module | 深度集成、无跨进程开销 | **ESM/CJS 冲突**；改造量最大 |

### 推荐 B，理由
1. **ESM/CJS 硬约束**：TAI 后端 `package.json` 为 `"type": "commonjs"`；tgagent 与 pi SDK 为 ESM。方案 C 需要打包层改造，成本高且脆弱。
2. **鉴权与积分是硬需求**（已决策：生图计入用户积分）：只有走 TAI 后端才能拿到用户 JWT 并扣减积分。apiKey 路径经源码确认**不扣用户积分**——`getUserId()`（`ai.controller.ts:725`）开头即 `if (req.apiClient) return null`，随后 `ai.controller.ts:5555` 再 `if (!userId)` 跳过扣费。故 apiKey 只能用于联调，不能作为终态计费方案。
3. **前端改动最小**：只需在对话流程里加一个模式分支。

⚠️ Node 版本无阻塞：pi SDK 要求 Node ≥ 22.19，本机 v22.22.2 满足；TAI 后端无 `engines` 限制。

---

## 4. 前端接入点（精确到行）

主战场：`frontend/src/stores/aiChatStore.ts`（**8667 行**）。

| 位置 | 内容 | 作用 |
|---|---|---|
| `:505` | `ManualAIMode = "auto"\|"text"\|"generate"\|"edit"\|"blend"\|"analyze"\|"video"\|"vector"` | 增列 `"architecture"` |
| `:514` | `AvailableTool` 八种工具 | 设计师模式**不应**映射到单工具 |
| `:7249` | `manualToolMap: Record<ManualAIMode, AvailableTool \| null>` | 模式→工具的映射表 ⚠️ **共两处，见下方警告** |
| `:7265` | `if (!selectedTool) { if (manualMode !== "auto") … else { await aiImageService.selectTool(...) } }` | **核心分流点**：在 `auto` 分支前插入 tgagent 路由 |
| `:936` | `TEXT_MODEL_BY_PROVIDER: Record<AIProviderType, string>` | 档位→模型映射（如需注册 tgagent provider） |

> ⚠️ **2026-08-30 核实：`manualToolMap` 在该文件里定义了两次**——`:7249` 与 `:7680`
> （同一函数内两个分支各自定义一份）。本节原先只记录了 7249。
> P3 做模式分流时**必须两处都改**，只改一处会出现「某个入口下模式不生效」的诡异行为。
> `ManualAIMode` 类型定义在 `:505`（与本节记录一致）。

**关键实现要点**：设计师模式不能走 `manualToolMap`（那是单工具映射）。正确做法是在 `:7265` 的 `if (!selectedTool)` 判断之前加一个早退分支——当 `manualMode === "architecture"` 时，把消息、选区、附件整体交给 tgagent，并消费其流式事件回写 `ChatMessage`。

配套文件：`types/ai.ts`（请求/响应类型）、`services/aiBackendAPI.ts`（调用封装，注意平台每次都带 `Idempotency-Key` 头）。

---

## 5. 后端接入点

- `backend/src/ai/ai.controller.ts`（7200+ 行）—— 新增 `@Post('architecture-chat')` 端点
- `backend/src/ai/dto/` —— 新增请求 DTO
- `backend/src/ai/ai.module.ts`（86 行）—— 注册依赖
- 全局前缀确认为 `api`（`main.ts:198`），故实际路径 `/api/ai/architecture-chat`

---

## 6. 契约差异（必须对齐，否则静默出错）

| # | 项 | TAI 平台 | tgagent 现状 | 处理 |
|---|---|---|---|---|
| 1 | **局部重绘坐标** | `PreciseEditContext.cropRectNormalized` = **归一化 0–1**（`aiChatStore.ts:455`） | `SelectionRef.regionRect{x,y,w,h}` **像素坐标** | 必须转换，否则遮罩区域错位 |
| 2 | **选区引用** | `targetImageId` + `targetImageSource` | `selectionRefs[]` | 字段映射 |
| 3 | **画布落位** | `content.flow.nodes`（React Flow 节点） | `canvas.place` 自研坐标 | 落位算法可复用，节点结构要重写 |
| 4 | **底图传递** | `edit-image-async` 用 `sourceImageUrl` | `baseImageUrl` **从未发送**（已确认缺陷） | 见下条 |
| 5 | **生图 provider** | seedream5 丢 `aspectRatio`、不支持 edit；banana-3.1 支持比例与编辑但 `n:1` | 默认 seedream5 | 按意图分流 |

关于第 5 点，用户已决策 **v1 保「迭代/比例」**：
- 首轮探索 → `generate-image-async`，并发 N 个独立任务（2–4 张，构图发散）
- 版本迭代 → `edit-image-async` + `sourceImageUrl` 带底图，provider 走 **banana-3.1**
- 代价：`batchMode` 单次多张不可用（banana 硬编码 `n:1`），并发改由任务数承担

---

## 7. 计费链路：JWT 透传（已决策）

**决策：tgagent 生图计入用户积分。** 技术前提是把用户身份透传到 TAI 后端。

### 链路

```
TAI 前端 (fetchWithAuth)
  │ Authorization: Bearer <accessToken> + X-Team-Id
  ▼
TAI 后端 /api/ai/architecture-chat  (JwtAuthGuard → req.user)
  │ 转发时透传 Authorization 头
  ▼
tgagent
  │ 回调 TAI 生图端点时携带同一 Authorization 头
  ▼
TAI 后端 /api/ai/generate-image-async → getUserId() → 扣用户积分
```

### ⚠️ 关键陷阱：绝不能同时带 `x-api-key`

守卫 `ApiKeyOrJwtGuard`（`api-key-or-jwt.guard.ts:29`）中 **apiKey 判断优先**：一旦 `x-api-key` 有效，直接 `request.apiClient = { apiKey }` 并 return true，**不解析 JWT、不设置 `req.user`**。结果 `getUserId()` 返回 null → 不扣费。

⇒ **计费链路上的请求必须只带 `Authorization`，不能带 `x-api-key`。** 两者混用不报错，只会静默免单——这是最难察觉的一类缺陷。

### 后端解析方式（已确认）

| 位置 | 行为 |
|---|---|
| `ai.controller.ts:725` `getUserId()` | `req.apiClient` 存在 → 返回 null；否则 `req.user.sub \|\| req.user.id` |
| `ai.controller.ts:424` `extractAccessToken()` | 先读 cookie `access_token`，再读 `Authorization: Bearer <token>` |
| `ai.controller.ts:444` `resolveRequestUserId()` | `req.user` 优先，否则用 `JWT_ACCESS_SECRET` 验签取 `sub`/`id` |

### 前端凭证携带（已确认，`services/authFetch.ts`）

- `Authorization: Bearer ${getAccessToken()}`（`:134`）
- `X-Team-Id: ${getBillingTeamId()}`（`:141`，团队计费）
- `credentials: 'include'`；401 自动 refresh 后重试（`:193`）
- 403 同样触发余额刷新（`notifyCreditsChanged()`，`:174`）——403 表示业务拒绝（如积分不足）

### 对 tgagent 的改造要求

1. ✅ `TaiTaskSource` 支持**可切换凭证模式**：`jwt`（生产，计费）/ `apiKey`（联调，免扣费）；
   构造期断言 **jwt 与 apiToken 互斥**（并存直接抛错，防未来回归引入静默免单）
2. ✅ 透传 `X-Team-Id`
3. ✅ 区分 **401**（`TaskSourceError.code: "auth_expired"`，token 过期）与
   **403**（`"insufficient_credits"`，积分不足）——生图提交/轮询/视频提交三处均已接入
4. ✅ BFF `POST /chat` 捕获 `Authorization` / `X-Team-Id`，注入**会话级 jwt 任务源**
   （含本轮结束后的视频轮询；有 jwt 源后绝不回退共享 apiKey 源）。
   离线验证：`tests/bff-chat.test.ts` ⑤⑥（假 TAI 后端断言只带 Bearer、无 x-api-key）
5. 注意：异步生图端点的积分在 **worker 里预扣**（`authFetch.ts:24` 的 `CREDITS_DEDUCT_DEFERRED_PATH_PATTERNS` 含 `generate-image-async`），前端不会立即看到余额变化（平台侧行为，无需 tgagent 处理）

---

## 8. 撤销栈（待决③ 已关闭）

`services/historyService.ts`（739 行）是**全量/增量快照式**，不是 command pattern：

```ts
historyService.commit(label)                    // 提交快照
historyService.commitContentSnapshot(label, c)  // 提交指定内容
historyService.undo() / redo()
historyService.resetToCurrent(label)            // 重置基线
```

快照体 `ProjectContentSnapshot` = `{ layers, assets{images,models,texts}, flow{nodes,edges}, paperJson }`，带增量快照与内存预算裁剪。

⇒ **agent 的写操作天然可撤销**：执行器只需「修改 store → `commit('agent:place')`」。DESIGN.md §6.3 假设的「command/undo 封装层注入」前提不成立，该设计可简化。

---

## 9. 分阶段路线

| 阶段 | 目标 | 依赖 | 状态（2026-08-30） |
|---|---|---|---|
| **P0 契约对齐** | 修 `baseImageUrl` 发送；坐标归一化；provider 按意图分流（首轮**并发** / 迭代走 `edit-image-async`+banana-3.1）；双凭证模式；并发门控改真信号量 | — | ✅ **完成**（9/9 测试验证） |
| **P1 联调环境** | 起 TAI 后端：补 `backend/.env`、接 PostgreSQL、跑 50 个 migration、配 `AI_API_KEYS` | **可本地建库绕过，不必等外部 `DATABASE_URL`** | ⛔ **未启动**（步骤已就绪，见 [P1-ENV-SETUP.md](P1-ENV-SETUP.md)） |
| **P2 BFF 打通** | TAI 新增 `architecture-chat` 端点，转发 tgagent 并透传流 | P1 才能联调 | 🟡 **代码已写完**（controller 132 行 + DTO + module 注册，过全量类型检查），**零运行验证** |
| **P3 前端模式** | `ManualAIMode` 增列、分流分支、消息回写 | P2 | ⬜ 未开始（⚠️ `manualToolMap` 有两处，见 §4） |
| **P4 能力迁移** | Brief 面板、血缘连线、候选择优、视频进度卡迁入 TAI 前端 | P3 | ⬜ 未开始 |
| **P5 退役** | `qianduan/` 归档为原型 | P4 | ⬜ 未开始 |

### 完成度

| 维度 | 进度 | 说明 |
|---|---|---|
| 契约与协议层 | **100%** | 生图/视频/鉴权/计费/坐标/分流/`Idempotency-Key` 均已对齐并有测试 |
| tgagent 服务端 | **~95%** | 大脑、工具、BFF 入口就绪；代码审查 2026-08-29 识别的三项 P0 与四项 P1 **已全部关闭**（2026-08-30，含并发门控死锁与计费链路 500 两个回归的修复）。实测：`tsc` 0 错、`npm test` 9/9（2m54s）、`smoke` 5/5。持久化仍为零（内存态）——终态交由 TAI 平台，非缺陷。 |
| TAI 后端接入 | **代码 ~90% / 验证 0%** | 骨架齐备并通过全量类型检查；**一次都没跑起来**，被 P1 环境阻塞 |
| TAI 前端接入 | **0%** | 尚未改动一行 |
| 整体可演示度 | **~40%** | 四层里三层就绪，但端到端从未在真实 TAI 环境跑通一次 |

> **读法提示**：tgagent 侧的百分比是「代码完成度」，不是「验证完成度」。
> 除契约层外，其余均未经过真实环境验证——这正是 P1 必须解除的原因。

---

## 10. 风险与已决项

**已决策（2026-08-28）**

| 决策项 | 结论 | 影响 |
|---|---|---|
| 首轮多候选 | **并发**提交 N 个独立任务 | 快，但积分峰值高；构图差异大于 `batchMode` 同源采样 |
| 计费归属 | **计入用户积分** | 必须走 JWT 链路，禁用 apiKey（见 §7） |
| P1 数据库 | **本地 PostgreSQL**（2026-08-30 修正） | 原决策为索取测试环境 `DATABASE_URL`，现确认**本地建库即可绕过**，不必阻塞等待。连接串**勿写入仓库**，只进 `.env` |
| 持久化 | **不做** | 终态接入 TAI 平台，平台已有会话/资产持久化；自建等于废弃前重复建设。与 DESIGN.md §9 冲突——那份文档写于"做独立应用"的定位下，已在 DESIGN.md 该节顶部标注 |

**风险**
1. **P1 仍是最大阻塞（2026-08-30 逐项核实，附三处易踩空）**：TAI 后端跑不起来——
   `backend/.env` 缺失、数据库未接、50 个 migration 未执行。不解决，P2 之后全部无法验证。
   完整可执行步骤已整理为 [P1-ENV-SETUP.md](P1-ENV-SETUP.md)。核实中确认的三处坑：

   | # | 项 | 实际情况 |
   |---|---|---|
   | ① | migration 位置 | 在 `backend/prisma/migrations/*/migration.sql`（Prisma 风格，50 个）。按 `backend/migrations/` 找会得到 0 个，易误判为「不存在」。且 `package.json` **没有 migrate 脚本**，须直接 `npx prisma migrate deploy` |
   | ② | `docker-compose.yml` 位置 | 在 **`backend/` 下**，非仓库根；`db:` 服务**整段被注释**（第 2–17 行）。且本机 Docker 当前不可用，故清单另给了「本地 PostgreSQL」路线 |
   | ③ | 配置校验 | 仓库**没有 `.env.example`**，且 `ConfigModule` 未配 `validationSchema` → 缺变量不在启动时报错，而是运行时才炸 |
2. **验证不对称（部分收敛，2026-08-29）**：tgagent 侧 9 个测试真实跑通；TAI 侧三个文件（controller / DTO / module）此前只做过语法解析——现已在 `backend/` 安装依赖（`npm ci`，1036 包）并通过**全量类型检查**（`tsc -p tsconfig.build.json --noEmit` 退出码 0，`--listFilesOnly` 确认三文件在编译范围内）。剩余缺口收窄为**运行期验证**（Fastify 流式写法、axios 流管道、守卫行为），仍被 P1 环境阻塞。
3. ~~**静默免单**~~ → **已设防（2026-08-29）**：`x-api-key` 与 `Authorization` 混用时不报错但不扣费（§7）。现已三道设防：① `TaiTaskSource` 构造期断言 jwt 与 apiToken 互斥（tests/tai-source.test.ts ⑫）；② `authHeaders()` 的 jwt 分支结构上不发 x-api-key（⑥ 断言）；③ BFF 链路由假后端测试锁定只带 Bearer（tests/bff-chat.test.ts ⑤⑥）。
4. ~~**积分峰值与部分失败**~~ → **已设防（2026-08-29）**：并发 N 个任务 = N 次预扣，部分 403/失败曾会整批抛错、丢掉已扣费的成功图。现 `generateImages` 返回 `ImageGenOutcome { images, partialFailures }`：只要 ≥1 张成功就正常交付，逐任务失败原因进 `partialFailures`；全灭时才抛错（401/403 类错误优先透传）。工具层据此向用户推送 `error` 事件并在回复中注明（`generateRendering.ts`）。回归：tests/tai-source.test.ts ⑮（轮询失败不连累其余）⑯（提交失败被记录）。积分峰值本身是产品决策（首轮多候选并发）的固有代价，未改。
5. ~~**BFF 尾延迟**~~ → **已消除（2026-08-29）**：原以为需透出 pi 的 `agent_end` 事件，实际查明 `handleSend` 内部 `await brain.handleUserMessage()` → pi 的 `await session.prompt()`，**本轮 agent 执行完才 resolve**，故 await 返回即可收尾，无需静默观察。实测 SSE 端到端 10s→8s，事件数不变（20 条，未丢）。
6. **巨型文件改动**：`aiChatStore.ts` 8667 行、`FlowOverlay.tsx` 2.37 万行——改动必须是极小增量，避免巨型 diff。
7. ~~**tgagent 无 git**~~ → **已完成（2026-08-29）**：`git init` + 首提交 `a9cf62c`（96 文件 / 24405 行）。`.gitignore` 另补齐了 `.pi-data/`、`.tmp-tests/`、`.workbuddy/`、`*.tsbuildinfo`、`.next/`。
8. **tgagent 生产加固（代码审查 2026-08-29 提出，2026-08-30 全部关闭）**：[docs/CODE-REVIEW-2026-08-29.md](CODE-REVIEW-2026-08-29.md) 识别的三项 P0 与四项 P1 均已修复并有回归测试：
   - ✅ **P0 会话键纳入用户身份**：`key(projectId, userId, sessionId)`，`userId = sha256(bearer).slice(0,16)`，默认 `"anon"` 保留 WS 兼容；`applyBffAuth` 对同会话凭证切换直接抛 `TaskSourceError("auth_expired")`；补 `tests/sessions.test.ts` §7 userId 隔离 + `tests/bff-chat.test.ts` ⑩。
   - ✅ **P0 `/chat` 入口防护**：新增 `host` / `bffSecret` / `chatRateLimit` / `chatMaxBodyBytes` 配置；BFF secret 守卫 → 每 IP 滑动窗口限速（bucket 在 `startGateway` 内，per 实例隔离）→ body 上限；缺 `BFF_SECRET` 时启动打印告警但不阻塞。
   - ✅ **P0 错误码最后一公里**：`protocol.ts` 新增 `mapTaskSourceErrorToProtocol` + `ErrorCode` 类型、`ErrorMessage.code` 扩列 `auth_expired`；工具层与视频轮询层均消费映射，前端能拿到可操作的错误码。
   - ✅ **P1 §4 会话级 jwt 源令信号量碎片化**：信号量提到模块级共享（`7dd43b6` 之前由 `6096f3b` 完成）。
   - ✅ **P1 §5 多候选提交绕过门控**：cost = `min(req.count, MAX)`。
   - ✅ **P1 §7 工具阻塞超时与轮询上限撞车**：工具阻塞超时降至 45s（< 轮询 90s）。
   - ✅ **P1 §8 视频完成事件跨轮次补发**：已写入协议约定——下行带单调 `seq` + 环形缓冲，
     客户端 `message.send` 携带 `lastSeq` → 网关 resync 补发；`npm run smoke` ⑤ 验证通过。

   ⚠️ **但 P1 §4 的修复本身引入了更严重的缺陷**，值得单列（2026-08-30 修复，提交 `7dd43b6`）：
   `6096f3b` 把信号量模块化时，`releaseGateSlot` 在唤醒等待者时已替其预分配槽位，
   而 `acquireGateSlot` 被唤醒后仍复检并重复计数 → 双重计数 → 等待者把自己重新入队 →
   **永久死锁**（并发超过上限后请求全部挂起，且不超时，因为 `GATE_TIMEOUT_MS` 只在
   acquire 成功之后才起算）。该缺陷**表现为测试挂起而非失败**，红灯被掩盖了 4 个提交。
   修复：`granted` 移交握手 + acquire 阶段独立超时；相关用例（⑩）另加 20s 超时保护。

   **剩余 P2 打磨项**（不阻塞联调）：`qianduan` 的 vitest 未纳入 `npm test` 统一入口。
   ~~`not_configured` 走 default → `generation_failed`~~ 已修复（2026-08-30）：
   `ErrorMessage.code` 增列 `not_configured`，mapper 单列分支（文案「服务配置错误」），
   回归见 `tests/tai-source.test.ts` ⑰。
