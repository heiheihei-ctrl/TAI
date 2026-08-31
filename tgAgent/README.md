# tgagent · 天宫TAI 建筑设计 Agent

基于 [pi SDK](https://github.com/earendil-works/pi) 的建筑设计智能体服务端。

> **定位**：tgagent **服务于 TAI 平台**——在 TAI 已有的 AI 对话框里新增「建筑设计师模式」，
> 由 tgagent 提供大脑能力。完整接入规划见 [docs/TAI-INTEGRATION-PLAN.md](docs/TAI-INTEGRATION-PLAN.md)。

其他文档：架构设计见 [DESIGN.md](DESIGN.md)，系统提示词见 [prompts/system-prompt.md](prompts/system-prompt.md)，协议样例见 [docs/](docs/)。

## 当前状态（2026-09-01）

**已完成**：W1–2 技术验证、W3 MVP 前端增强、W4 后端（模板词库 / 运镜预设 / PPT 编排）、P0 契约对齐、代码审查全部 P0/P1 项、**平台接入批次（2026-09-01，含前端/后端/tgagent 三侧）**。

- ✅ ws 协议契约（`src/shared/protocol.ts`，前后端对接基准）
- ✅ 五个 LLM 工具（brief / 生图 / 视频 / 参考分析 / PPT）+ 铁律服务端兜底
- ✅ pi 大脑适配层（验证点集中隔离在 `src/agent/piBrain.ts`）
- ✅ ScriptedBrain 无 LLM 联调模式（未配 key 自动启用）
- ✅ 视频异步任务轮询与 `video_completed` 推送、断线 seq 补发
- ✅ **P0 契约对齐**：
  - 底图不再丢失：迭代走 `edit-image-async` + `sourceImageUrl`
  - 双凭证模式：`apiKey`（联调，不扣积分）/ `jwt`（生产，计用户积分）
  - 意图分流 + 默认 provider `banana-3.1`（保 `aspectRatio` 与编辑能力）
  - 坐标归一化、`Idempotency-Key`、并发门控改真信号量
  - 多候选部分失败语义：允许部分成功，失败原因进 `partialFailures`
- ✅ **BFF 入口 `POST /chat`（SSE）**：供 TAI 后端 `/api/ai/architecture-chat` 转发
- ✅ **计费链路（tgagent 侧）**：`/chat` 捕获透传的 `Authorization`/`X-Team-Id` → 会话级 jwt 任务源；401/403 独立错误码
- ✅ **生产加固（2026-08-30）**：并发门控死锁修复（`granted` 移交握手 + acquire 超时）、`withUserAuth` 凭证互斥断言、BFF 500 分支补打日志
- ✅ **平台接入批次（2026-09-01）**，四层改动一次到位：
  - **前端**：`ManualAIMode` 增 `architecture` 列；`architectureChat` 流式对话
    （修正 `state.projectId` 编译错误 → `useProjectContentStore`）；**消费 `canvas.place`
    落画布**（此前只打日志，图永远不出现）；`asset.video_completed` / `presentation.ready`
    回写消息；`lastSeq` 游标跨轮补发；`AbortController` 真中断 + 生成中发送键变停止键
  - **TAI 后端**：`architecture.controller.ts` 转发 `x-bff-token`（TGAGENT_BFF_SECRET）、
    `X-User-Id`（JWT sub，会话跟随用户而非 900s 过期的 token）、`lastSeq`；DTO 同步
  - **tgagent**：限流改按**用户维度**（X-User-Id > bearer 派生 > IP 兜底，BFF 聚集转发下
    按 IP 限会互相误伤）；`/chat` 支持 `lastSeq` 补发跨轮事件；`X-User-Id` 优先派生会话身份
  - **配置**：`TASK_SOURCE=tai`（出图过 TAI、计用户积分，`TAI_API_TOKEN` 留空走 JWT 模式）、
    `BFF_SECRET` 两侧同值启用服务间鉴权（实测 401/401/过鉴权）

**实测健康度**（2026-09-01）：
`tsc --noEmit` 0 错 · `npm test` 10 个套件全 PASS（w4 统计口径 70 pass / 0 fail，
另含 BFF 端到端与会话持久化共 45+ 断言）· 启动实测：`TASK_SOURCE=tai` + `BFF_SECRET` +
持久化目录均生效，`/chat` 无 token → 401、错 token → 401、正确 token → 过鉴权进入业务层

> ⚠️ `smoke` / `dev:offline` / `verify` / `verify:vision` 四个脚本原先指向 `tests/` 下
> **并不存在**的文件（`npm run smoke` 直接 `ERR_MODULE_NOT_FOUND`），已从 `package.json` 移除；
> 全链路验证统一用 `npm test`（含 BFF `/chat` 端到端，无需任何 key）。

**持久化（2026-09-01 起已做，本地文件版）**：`src/gateway/sessionStore.ts` 把会话快照
（seq/ring/brief/selection/mode/画布占位/挂起的视频任务）与资产表落到
`.tgagent-data/`（`SESSION_STORE_DIR` 可改，设为 `off` 关闭）。
**不落盘**：pi 大脑上下文（重启后对话历史从空开始，属可接受降级）与用户 JWT
（凭证绝不落盘，恢复后由下一轮 BFF 重新注入）。写入为原子写 + 500ms debounce，
退出时 flush。此前"明确不做持久化"的判断基于独立应用定位，BFF 形态下进程重启
= 用户回到对话框 agent 失忆，已不可接受。

**当前阻塞**：TAI 后端真实环境仍未跑通端到端——`backend/.env` 已就位（含
`TGAGENT_BASE_URL` 与 `TGAGENT_BFF_SECRET`，见 2026-09-01 批次），但数据库/migration
未起，无法在真实 TAI 环境验证计费链路。
完整可执行步骤见 [docs/P1-ENV-SETUP.md](docs/P1-ENV-SETUP.md)。

**代码审查项**：三项 P0 与四项 P1 已全部修复并补回归测试，详见 [docs/archive/CODE-REVIEW-2026-08-29.md](docs/archive/CODE-REVIEW-2026-08-29.md)。

## 运行

```bash
# 要求 Node >= 22.19（pi SDK 硬性要求）
npm install

# 在本目录创建 .env（仓库无 .env.example）；填 DEEPSEEK_API_KEY 后自动启用 pi 大脑，留空走脚本大脑

npm run dev             # 启动网关 ws://localhost:8712/ws（HTTP /chat 同端口）
npm run typecheck       # 类型检查
npm test                # 全量测试（70 断言，含 BFF /chat 端到端，无需任何 key）
```

联调示例（wscat）：

```json
{"type":"message.send","projectId":"p_demo","text":"帮我出一个滨江办公楼的黄昏效果图","clientId":"c1"}
```

首次响应的 `body.sessionId` 需在后续消息中回传。

## 对接天宫TAI 后端（TASK_SOURCE=tai）

详见 [docs/TAI-INTEGRATION-PLAN.md](docs/TAI-INTEGRATION-PLAN.md)。

**两种部署形态**

| | 当前（联调） | 终态（接入平台） |
|---|---|---|
| 入口 | `ws://tgagent:8712/ws` | `POST /api/ai/architecture-chat`（BFF）→ tgagent `POST /chat`（SSE） |
| 鉴权 | 无（本地联调） | 用户 JWT（**必须**，否则不扣积分） |

**能力映射**

| 能力 | 路径 | 说明 |
|---|---|---|
| 首轮生图 | `POST /api/ai/generate-image-async` → `GET /api/ai/image-task/:taskId` | 90s 轮询上限，超时降级；多候选靠并发多个独立任务 |
| 版本迭代 | `POST /api/ai/edit-image-async` → 同上轮询 | 底图走 `sourceImageUrl`；必须用 banana 系 |
| 视频 | `POST /api/ai/generate-video-provider` → `GET /api/ai/video-task/:provider/:taskId` | provider 默认 `kling-o3` |

**⚠️ 鉴权与积分**：`x-api-key` 与 `Authorization` 绝不能同时携带——混用时请求照常成功、图照常生成，只是**没人付钱**，且不报任何错。生产计费须走 jwt 模式。

**provider 选型**：banana-3.1（默认）是唯一同时保住 `aspectRatio` 与图生图的 provider。seedream5 的 `editImage()` 直接抛错。

配置（`.env`）：

```bash
TAI_API_BASE_URL=http://localhost:4000
TAI_API_TOKEN=                            # 生产留空：计费走 BFF 透传的用户 JWT；仅 ws 本地联调才填 x-api-key
TAI_IMAGE_PROVIDER=banana-3.1
TAI_VIDEO_PROVIDER=kling-o3
TASK_SOURCE=tai

BFF_SECRET=<随机密钥>                     # /chat 服务间鉴权；与 TAI 后端 .env 的 TGAGENT_BFF_SECRET 同值
SESSION_STORE_DIR=.tgagent-data           # 会话/资产持久化目录；off = 关闭
```

- **限流**：`/chat` 按**用户维度**滑动窗口（默认 10 次/10s，`CHAT_RATE_MAX`/`CHAT_RATE_WINDOW_MS` 可调），
  键为 X-User-Id / bearer 派生的 userId；无身份请求才回退 IP。BFF 转发后所有用户共用一个出口 IP，
  按 IP 限会互相误伤——这是 2026-09-01 修复的缺陷。
- **持久化恢复语义**：重启后 seq/ring/brief/资产恢复；挂起的视频任务等用户 JWT 重新注入
  （下一轮 BFF）后续上轮询，避免无凭证时回退共享 apiKey 源导致静默免单。

回归：

```bash
npm run test:tai     # 内置假后端断言契约
npm test             # 全量套件（含 BFF /chat 端到端与会话持久化，无需任何 key）
```

## 结构

```
src/
├─ shared/        前后端共享契约：ws 协议 / DesignBrief / 资产类型 / region
├─ agent/
│  ├─ piBrain.ts       pi SDK 装配（模型注册/系统提示词/事件映射）
│  ├─ brain.ts         Brain 接口 + ScriptedBrain（无 LLM 联调）
│  ├─ piCompat.ts      pi import 唯一出口（API 漂移只改这里）
│  ├─ systemPrompt.ts  读 prompts/system-prompt.md + 占位符注入
│  ├─ promptAssembly.ts 渲染 prompt 组装
│  └─ tools/           5 个领域工具
├─ tasks/          生成任务源：mock / qianwen / tai
├─ gateway/        ws 服务 + 会话记录 + BFF POST /chat（SSE）
├─ assets/         资产登记与血缘（内存版）
├─ canvas/         画布落位算法
└─ index.ts        入口
```

## 已验证的 pi SDK 事实（0.84.3）

- 要求 **Node >= 22.19**
- `defineTool` 的 execute 签名为 5 参，`details` 泛型按分支推断
- 工具返回的 `details` 多个 return 分支必须同形
