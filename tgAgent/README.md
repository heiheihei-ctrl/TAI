# tgagent · 天宫TAI 建筑设计 Agent

基于 [pi SDK](https://github.com/earendil-works/pi) 的建筑设计智能体服务端。

> **终态定位（2026-08-29 明确）**：tgagent **服务于 TAI 平台**——在 TAI 已有的 AI 对话框里
> 新增「建筑设计师模式」，由 tgagent 提供大脑能力，而不是另起一个独立前端。
> 因此 `qianduan/` 是**原型与契约验证器**，不是交付物；接入后其 UI 概念需在 TAI 前端重做。
> 完整接入规划见 [docs/TAI-INTEGRATION-PLAN.md](docs/TAI-INTEGRATION-PLAN.md)。

其他文档：设计与规划见 [DESIGN.md](DESIGN.md)，系统提示词见 [prompts/system-prompt.md](prompts/system-prompt.md)，协议样例见 [docs/](docs/)。

## 当前状态（2026-08-30）

**已完成**：W1–2 技术验证、W3 MVP 前端增强、**W4 后端**（模板词库 / 运镜预设 / PPT 编排）、**P0 契约对齐**、**代码审查的全部 P0/P1 项**。

- ✅ ws 协议契约（`src/shared/protocol.ts`，前后端对接基准）
- ✅ 五个 LLM 工具（brief / 生图 / 视频 / 参考分析 / PPT）+ 铁律服务端兜底
- ✅ pi 大脑适配层（验证点集中隔离在 `src/agent/piBrain.ts`）
- ✅ ScriptedBrain 无 LLM 联调模式（未配 key 自动启用）
- ✅ 视频异步任务轮询与 `video_completed` 推送、断线 seq 补发
- ✅ W3 前端交互：Brief 面板可编辑、视频按钮、卡片右键菜单、视频进度卡
- ✅ vision 带图对话（`npm run verify:vision` 命中 4/4 组视觉事实）
- ✅ **P0 契约对齐**——详见 [下节](#对接天宫tai-后端task_sourceta)：
  - 底图不再丢失：迭代走 `edit-image-async` + `sourceImageUrl`
    （此前 `baseImageUrl` 被丢弃，`inheritFromAssetId` 会**静默退化为文生图**）
  - 双凭证模式：`apiKey`（联调，不扣积分）/ `jwt`（生产，计用户积分）
  - 意图分流 + 默认 provider 改 `banana-3.1`（保 `aspectRatio` 与编辑能力）
  - 坐标归一化（`src/shared/region.ts`）、`Idempotency-Key`、并发门控改真信号量
  - 多候选部分失败语义：并发 N 任务允许部分成功（`ImageGenOutcome`），
    失败原因进 `partialFailures` 提示用户，不因个别失败丢整批已扣费的图
- ✅ **BFF 入口 `POST /chat`（SSE）**：供 TAI 后端 `/api/ai/architecture-chat` 转发
- ✅ **计费链路（tgagent 侧）**：`/chat` 捕获透传的 `Authorization`/`X-Team-Id` →
  会话级 jwt 任务源（回调只带 Bearer，绝不带 `x-api-key`）；构造期凭证互斥断言；
  401/403 独立错误码（`auth_expired` / `insufficient_credits`）。
  离线验证：`npm run test:tai`（⑫⑬⑭⑮⑯）与 `tests/bff-chat.test.ts`（⑤⑥）
- ✅ **生产加固收尾（2026-08-30，提交 `7dd43b6` / `525123a` / `9861d17`）**：
  - **并发门控死锁**：release 预分配槽位后被唤醒方重复计数，等待者把自己重新入队 →
    改用 `granted` 移交握手，并给 acquire 阶段补超时（原 `GATE_TIMEOUT_MS` 只在
    acquire **成功之后**起算，导致拥塞时永久挂起且无任何错误信号）
  - **计费链路全面 500**：`withUserAuth` 用 `{...this.opts}` 把共享源 `apiToken`
    带到 jwt 实例，撞防静默免单的构造期断言 → 显式剔除 `apiToken`；
    该断言改抛 `TaskSourceError`，BFF 的 500 分支补打 message + stack（原先吞错且无日志）

**实测健康度**（2026-08-30 复核，非文档转述）：
`tsc --noEmit` 0 错 · `npm test` **9/9**（耗时 2m54s；修复前 12m22s 且实为 7/9）·
`npm run smoke` 5/5 · `qianduan` vitest 11/11（修复前 2 failed）。

**当前阻塞**：TAI 后端环境未就绪——缺 `backend/.env`、数据库未接、50 个 migration 未执行。
已核实**可本地建 PostgreSQL 绕过，不一定要等 `DATABASE_URL`**；
完整可执行步骤见 [docs/P1-ENV-SETUP.md](docs/P1-ENV-SETUP.md)。
三处易踩空：migration 在 `backend/prisma/migrations/`（**不是** `backend/migrations/`）；
`docker-compose.yml` 在 `backend/` 下（非仓库根）且 `db:` 整段被注释；
本机 Docker 当前不可用。在此之前无法做任何真图联调。

**明确不做**：持久化。理由是终态接入 TAI 平台，而平台已有完整的会话与资产持久化，
自建等于在废弃前重复建设。（此点与 DESIGN.md §9 的数据模型冲突——那份文档写于"做独立应用"的定位下。）

**代码审查项（2026-08-29 提出，2026-08-30 全部关闭，详见 [docs/CODE-REVIEW-2026-08-29.md](docs/CODE-REVIEW-2026-08-29.md)）**：
三项 P0 与四项 P1 均已修复并补回归测试：

| # | 项 | 处理 |
|---|---|---|
| P0 | 会话键不含用户身份 | 键改为 `(projectId, userId, sessionId)`，`userId = sha256(bearer)` |
| P0 | `/chat` 无鉴权、无限速 | BFF secret + 每 IP 滑动窗口 + body 上限 |
| P0 | 错误码最后一公里 | `mapTaskSourceErrorToProtocol` + 工具层与视频轮询层消费 |
| P1 | 并发门控碎片化 | 信号量提到模块级；⚠️ 该修复曾引入死锁，已另行修复 |
| P1 | 多候选提交绕过门控 | cost = `min(req.count, MAX)` |
| P1 | 视频轮询缺 401/403 语义 | `getVideoTask` 接入 `authErrorFromStatus` |
| P1 | 两处 90s 超时撞车 | 工具阻塞超时降至 45s |

⚠️ **教训**：P1「并发门控碎片化」的修复（`6096f3b`）本身引入了更严重的死锁，
而该缺陷表现为**测试挂起而非失败**，红灯被掩盖了 4 个提交。
现在相关用例已加超时保护，把「挂起」转成「失败」。

**仍未处理**：

- **P2 前端测试未纳入统一入口**：`npm test` 只跑 `tests/run-all.ts` 的 9 个后端套件，
  `qianduan` 的 vitest 需单独跑，本次的过时断言因此长期无人察觉
- 上面的 ✅ 表示能力已实现且有测试，**不等于已在真实 TAI 环境跑通**

## 运行

```bash
# 要求 Node >= 22.19（pi SDK 硬性要求；本机用 nvm 切换：nvm use 22.19.0）
npm install

cp .env.example .env    # 填 DEEPSEEK_API_KEY 后自动启用 pi 大脑；留空走脚本大脑

npm run dev             # 启动网关 ws://localhost:8712/ws
npm run dev:offline     # 离线联调网关（ScriptedBrain+mock，零 key 零 token，配 qianduan/ 前端用）
npm run typecheck       # 类型检查
npm run smoke           # 全链路冒烟测试（无需任何 key）
```

前端工作台（`qianduan/`，Next.js）：`npm run dev` 后访问 http://localhost:3000，默认 live 模式直连网关；`NEXT_PUBLIC_DEMO_FIXTURES=1` 叠加静态高保真原型节点。

联调示例（wscat）：

```json
{"type":"message.send","projectId":"p_demo","text":"帮我出一个滨江办公楼的黄昏效果图","clientId":"c1"}
```

首次响应的 `body.sessionId` 需在后续消息中回传（或同一连接不传 sessionId 自动绑定）。

## 对接天宫TAI 后端（TASK_SOURCE=tai）

`src/tasks/taiSource.ts` 按 TAI 仓库 `backend/src/ai/ai.controller.ts` 的真实契约实现——
基线 `b8f19ba`（2026-08-27），**已逐项核对源码**，非文档转述。

### 两种部署形态

| | 当前（联调） | 终态（接入平台） |
|---|---|---|
| 前端 | `qianduan/` 直连 tgagent ws | TAI 前端 → TAI 后端 → tgagent |
| 入口 | `ws://tgagent:8712/ws` | `POST /api/ai/architecture-chat`（BFF）→ tgagent `POST /chat`（SSE） |
| 鉴权 | `x-api-key` | 用户 JWT（**必须**，否则不扣积分） |

选 BFF 的两条硬理由：① tgagent 是 ESM 独立进程，TAI 后端是 CommonJS，无法作为 NestJS 模块嵌入；
② 只有走 TAI 后端才能拿到用户 JWT 并扣减积分。

### 能力映射

| 能力 | 路径 | 说明 |
|---|---|---|
| 首轮生图 | `POST /api/ai/generate-image-async` → `GET /api/ai/image-task/:taskId` | 90s 轮询上限，超时降级；多候选靠**并发多个独立任务** |
| 版本迭代 | `POST /api/ai/edit-image-async` → 同上轮询 | 底图走 `sourceImageUrl`；**必须**用 banana 系，seedream5 的 `editImage()` 直接抛错 |
| 视频 | `POST /api/ai/generate-video-provider` → `GET /api/ai/video-task/:provider/:taskId` | provider 默认 `kling-o3`；首/尾帧作为 `referenceImages` 传入 |

### ⚠️ 鉴权与积分（最易踩的坑）

`getUserId()`（`ai.controller.ts:725`）开头即 `if (req.apiClient) return null`，随后 `:5555` 再
`if (!userId)` 跳过扣费；而守卫 `api-key-or-jwt.guard.ts:29` 中 **apiKey 判断优先**，
命中后不解析 JWT、`req.user` 为空。

⇒ **`x-api-key` 与 `Authorization` 绝不能同时携带**：混用时请求照常成功、图照常生成，
只是**没人付钱**，且不报任何错。生产计费须走 jwt 模式，此时代码不会发送 `x-api-key`。

### provider 选型（决策：保「迭代/比例」）

| provider | aspectRatio | 图生图 | 多候选 |
|---|---|---|---|
| **banana-3.1（默认）** | ✅ | ✅ `editImage` | ❌ `n:1` 硬编码，靠并发 |
| seedream5 / 5Pro | ❌ 被 provider 丢弃 | ❌ 抛错 | ✅ `batchMode` |

三者不可兼得，故默认取 `banana-3.1`。

配置（`.env`）：

```bash
TAI_API_BASE_URL=http://localhost:4000   # TAI 后端根地址（不含 /api）
TAI_API_TOKEN=<x-api-key>                # 仅 apiKey 模式需要；jwt 模式改用 TAI 用户 token
TAI_IMAGE_PROVIDER=banana-3.1            # 可选：seedream5 / midjourney / nano2 …
TAI_VIDEO_PROVIDER=kling-o3              # 可选：vidu / viduq3-pro / doubao …
TASK_SOURCE=tai
```

### 启动 TAI 后端（前置条件比文档写的多）

`cd ../TAI/backend && npm run dev` **单独跑不起来**，缺四步：

1. `backend/.env` 不存在（ConfigModule 只读 `backend/.env` 或 `TAI/.env`）
2. 数据库是 **PostgreSQL**，且 `docker-compose.yml` 里 db 服务**整段被注释**
3. **50 个 migration** 未执行
4. `AI_API_KEYS` 未配——tgagent 的 `TAI_API_TOKEN` 必须落在这个逗号分隔列表里，否则 401

### 回归

```bash
npm run test:tai     # 内置假后端断言契约，不需要真实 TAI 后端
npm test             # 全量 9 个套件
```

注意：图片 URL 由 TAI 后端落在火山 TOS/OSS，tgagent 侧不搬运——前端 `canvas.place` 直接用返回的 URL；若 URL 有签名过期问题，后续在 gateway 加下载落盘（同 qianwen 源做法）。

## 结构

```
src/
├─ shared/        前后端共享契约：ws 协议 / DesignBrief / 资产类型 / region（坐标归一化）
├─ agent/
│  ├─ piBrain.ts       pi SDK 装配（模型注册/系统提示词/事件映射，验证点集中于此）
│  ├─ brain.ts         Brain 接口 + ScriptedBrain（无 LLM 联调）
│  ├─ piCompat.ts      pi import 唯一出口（API 漂移只改这里）
│  ├─ systemPrompt.ts  读 prompts/system-prompt.md + 占位符注入
│  ├─ promptAssembly.ts 渲染 prompt 组装
│  └─ tools/           5 个领域工具：brief / rendering / video / reference / presentation
├─ tasks/          生成任务源抽象：mockSource（联调）/ qianwenSource / taiSource（TAI 契约）
├─ gateway/        ws 服务 + 会话记录 + BFF `POST /chat`（SSE，供 TAI 后端转发）
├─ assets/         资产登记与血缘（内存版；持久化交由 TAI 平台，不在本仓库实现）
├─ canvas/         画布落位算法
└─ index.ts        入口
```

## 已验证的 pi SDK 事实（0.84.3）

- 要求 **Node >= 22.19**（依赖 `fs.globSync`）
- `defineTool` 的 execute 签名为 5 参：`(toolCallId, params, signal, onUpdate, extensionCtx)`，第 4 参 `onUpdate` 是官方的工具进度回调通道（当前进度走自有 ws 通道，W1-① 后评估迁移）
- 工具返回的 `details` 泛型按分支推断，**多个 return 分支的 details 必须同形**

## W1-① 验证清单（2026-08-27 已完成 ✅）

DeepSeek key（vision-exp）+ pi 0.84.3 实测结论：

1. ✅ **models.json 自定义 provider schema 已校准**（`piBrain.ts`）：`{providers:{id:{baseUrl,api:"openai-completions",apiKey,models:[{id,name,reasoning,input,contextWindow,maxTokens,cost,compat}]}}}`；模型须带 `cost` 四项；`compat.thinkingFormat:"deepseek"` 启用思考控制；认证用 `setRuntimeApiKey`（运行时注入不落盘）
2. ✅ **系统提示词注入**：`DefaultResourceLoader({systemPromptOverride, appendSystemPromptOverride:()=>[]})` + `reload()`，实测模型严格遵循追问方法论与工具纪律
3. ✅ **工具白名单**：`tools:[三个自定义工具名] + customTools` 组合有效，内置编码工具未启用
4. ✅ **流式与事件映射**：`message_update/text_delta`→打字机流、`tool_execution_start/end`→进度卡，全部对上
5. ✅ **vision 图像注入已验证（2026-08-28）**：类型为 `{type:"image",data:<base64>,mimeType}`（以 dist 类型定义为准，与 web 文档不符）；`npm run verify:vision` 端到端通过——样图 1280x720 经 ws attachments → pi `PromptOptions.images` 注入，模型描述命中 4/4 组视觉事实（双塔办公/玻璃幕墙/黄昏暖调/水面倒影），且答出图中背景住宅等未在提问中给出的细节，排除"按提示词编造"的可能。样图为千问真实生成图 `.mock-assets/4569647b-*.png`，勿删
6. ✅ **排队语义**：agent 处理中新消息必须带 `streamingBehavior:"followUp"`（否则抛错）；打断走 `steer()`

**已知行为观察**：
- exp 模型有工具调用漂移，实测出现过两类，均已在 system prompt 与工具 description 双侧加固规则后消除：
  1. **多候选未指明底图时反问用户**（违反"具体修改＝立刻出图"）→ 加规则「默认取最新一批第一张直接执行并说明」；
  2. **先回复后落档**（用户一句话需求里已知字段不写 brief 就开始追问）→ 铁律新增第 ④ 条「先落档后回复，顺序不可颠倒」+ update_design_brief 工具描述强调"第一动作永远是落档"。
- 加固后连续 9 轮 `npm run verify` 全 PASS（加固前 6 轮挂 3 轮，两类漂移各占其半）；三场景：①模糊需求→brief+选择题追问 ②出图指令→生图+canvas.place ③迭代→inheritFromAssetId 血缘（模型会明确说明"基于左起第一张改"）
- 三场景脚本：`npm run verify`（`tests/pi-verify.ts`，消耗真实 token ~1万/轮）
- vision 带图对话脚本：`npm run verify:vision`（`tests/pi-vision.ts`，一轮带图对话的真实 token 消耗）
- API 直连诊断：`npx tsx tests/deepseek-direct.ts`
