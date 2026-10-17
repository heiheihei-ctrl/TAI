# 玲珑客服工作台（cs-desk）

仅 `DEPLOYMENT_BRAND=linglong` / 前端 `VITE_DEPLOYMENT_BRAND=linglong`（或登录页玲珑身份）启用。

## 能力

- 用户：画布右下角客服入口，创建/续接会话，收发文本/附件，响应协同卡片与服务包卡片。
- 座席：管理后台「客服工作台」三栏（待接入/进行中/已结束 · 聊天 · 客户信息）。
- 座席动作：接入、结束、转接、快捷回复、推荐服务包、附件、创建工单、发起协同（默认 50 元/次/分钟，本期不自动扣费）。

## 客服身份

- 工作台使用队列接口返回的 `viewer` 识别当前客服，顶部显示当前登录客服姓名；在线状态标记为「在线」，与具体会话接待归属区分。
- 「全部」中查看其他客服的会话时显示只读提示，隐藏发送、附件和推荐入口并禁用发起协同；只有当前接待客服可回复。有客服身份且在线的完整管理员可点击「转给我接待」，通过既有转接接口成功变更归属后再回复，不能转接给咨询用户本人。

- `User.isCsAgent`（与 `role` 独立）。完整管理员在用户管理勾选「客服 → 开启」。
- 可进工作台查看：`admin` / `normal_admin` **或** `isCsAgent=true`。
- **可上线/自动分单/手动接入/转接目标：仅 `isCsAgent=true`**（管理员未开客服身份不算在线客服）。
- 仅 `isCsAgent`：`/admin` 只显示「客服工作台」。
- 禁止把会话分给咨询用户本人。

## 多客服分单

- 已开启客服身份的账号打开工作台并连接 `/ws/cs` → `CsAgentPresence=online`（可手动切「暂离」`away`）。
- 用户建会话后：在线且 `isCsAgent` 的客服中按 **active 会话数最低**（同分按 `csAgentLastAssignedAt`）自动分配；原子 `UPDATE waiting AND agentId IS NULL`。
- 无人在线：留在待接入池，由已开启客服身份的座席手动接入（同样条件更新防双抢）。
- 转接：`POST /api/cs/admin/conversations/:id/transfer`，目标须在线且为客服身份。

## API

- 用户：`/api/cs/conversations*`、`/api/cs/collab/:id/respond`
- 座席：`/api/cs/admin/*`（客服身份校验）
- 管理：`PATCH /api/admin/users/:userId/cs-agent`

## 实时

- 客服 WS 与 HTTP 使用相同的令牌优先级（登录 Cookie → Authorization → query token），防止旧本地缓存令牌覆盖有效 Cookie。握手拒绝记录 HTTP 状态及原因，令牌校验日志仅记录错误类型，不记录令牌内容。

- 工作台 WS 连接仅随工作台挂载/卸载启停，切换会话、筛选及客服身份刷新只更新订阅和入房，不关闭连接。重连 `ready` / 入房 `joined` 后补拉详情；当前聊天每 2 秒及窗口重新聚焦时补拉消息，防止 WS 漏帧导致列表摘要已更新但协同卡片仍待处理。
- 补拉消息按会话隔离、消息 ID 合并并排序，保留请求期间收到的实时消息；异步详情响应只应用到仍选中的会话，避免切换会话或旧请求覆盖最新协同响应。

- 客服协同鼠标通过 `/ws/cs` 的 `canvas_cursor` 双向同步，复用企业协同的光标与姓名标签、画布世界坐标换算，双方独立缩放/平移后仍指向相同位置。前端以 100ms 节流发送，不持久化鼠标坐标。
- 连接启动幂等，后端 `ready` 后重新登记画布，收到 `canvas_ready` 才发送鼠标；断线重连保留期望的画布与会话上下文。画布登记失败通过 `canvas_error` 在页面显示原因，避免静默丢弃鼠标帧。
- 客户上报本人个人画布，客服上报时附会话 ID 并校验已接受的在线画布授权；每次转发复核当前协同、接待客服及会话，仅发送至同一画布的客户/客服。结束、转接、离开或断线后清理光标，未再收到的光标 5 秒过期。

- 协同卡片按会话 ID 与协同请求 ID 关联系统响应消息，两端在实时收信和历史加载后统一显示最新状态；客户同意/拒绝后隐藏操作按钮，避免再次提交已处理请求。
- 协同状态显示为「待处理 / 已同意 / 已拒绝 / 已结束」，客服服务记录中的会话状态显示为「待接入 / 进行中 / 已结束」。

- WebSocket 路径：`/ws/cs`（JWT query/cookie；房间 = conversationId）
- 事件：`ready` / `joined` / `message` / `status` / `typing` / `read` / `error`
- 生产 nginx 需与 `/ws/collab` 一样单独 `proxy_pass` WebSocket（勿落入 SPA `try_files`）

## 数据表

`CsConversation` / `CsMessage` / `CsTicket` / `CsQuickReply` / `CsServicePackage` / `CsCollabRequest` / `CsAgentPresence`

迁移：`202610080001_add_cs_desk`、`202610080002_cs_agent_presence`

## Customer support canvas access

- A green canvas button appears beside End session after a collaboration request; consent enables opening the personal canvas in a new tab.
- Linglong only: access requires the requesting agent to remain the assigned CS agent, an active session, accepted consent and a customer-owned personal project.
- CS consent does not authorize deleting the project or accessing team projects. Existing realtime connections are not actively disconnected when a session ends.

### 在线用户画布入口

- 协同入口右上角展示已授权客户的姓名、公司、会员和积分，客户信息为只读，不修改客服登录身份。授权目标接口返回客户资料与协同开始时间，每 15 秒刷新资料并复核授权/在线状态，失败时退出画布显示提示。
- 页面顶部居中显示白色悬浮胶囊：双方头像、「协同操作中」、橙色计时与「结束协同」按钮；窄屏下移至第二行。计时从服务端客户同意时间 `startedAt` 开始，刷新继续累计，不作自动计费。
- 「结束协同」调用 `POST /api/cs/admin/conversations/:id/collab/:collabId/end`，仅当前接待客服可结束有效协同，写入结束时间与系统消息后返回工作台，客服咨询会话保持进行中。

- 「进入画布」先请求 `GET /api/cs/admin/conversations/:id/canvas-target`，服务端校验当前接待座席、进行中的会话、最新已接受协同及客户个人项目归属。
- 客户画布通过 `/ws/cs` 的 `canvas_presence` 上报当前项目；服务端校验项目归属后记录在线状态。断连、关闭/切走授权画布后，客服点击只收到提示，不打开客服自己的项目。
- 入口 URL 带 `csConversationId` 与明确的 `projectId`。新页再次校验在线状态和授权，再加载该项目；该入口跳过默认个人项目初始化和 URL 回写，避免客服自己的项目覆盖目标。
- 授权/在线校验失败、项目元数据或内容加载失败均停留提示页；不回退个人项目或本地快照，不在错误画布中自动保存。
- 当前在线状态由客服 WS 网关实例内连接维护，与现有客服实时连接部署一致；前后端需同时更新，用户刷新画布后上报在线项目。

## New reception after ending a session

- Ending a session keeps customer input available. The next customer message creates or reuses an open session and runs online-agent assignment again; with no available agent it stays waiting.
- The message API returns the actual destination conversationId. The customer joins that conversation and refreshes its messages and agent status, retaining visible previous messages.
- Ended sessions and their collaboration consent remain closed.

## Workbench identity synchronization

- Admin conversation lists return the database-backed viewer id, role and isCsAgent. The workbench synchronizes these to the matching authenticated user and login cache on entry and every 15 seconds.
- Reception status and canvas-button availability use the synchronized CS identity; permissions remain enforced by the backend.
