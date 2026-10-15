# 玲珑客服工作台（cs-desk）

仅 `DEPLOYMENT_BRAND=linglong` / 前端 `VITE_DEPLOYMENT_BRAND=linglong`（或登录页玲珑身份）启用。

## 能力

- 用户：画布右下角客服入口，创建/续接会话，收发文本/附件，响应协同卡片与服务包卡片。
- 座席：管理后台「客服工作台」三栏（待接入/进行中/已结束 · 聊天 · 客户信息）。
- 座席动作：接入、结束、转接、快捷回复、推荐服务包、附件、创建工单、发起协同（默认 50 元/次/分钟，本期不自动扣费）。

## 客服身份

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

## New reception after ending a session

- Ending a session keeps customer input available. The next customer message creates or reuses an open session and runs online-agent assignment again; with no available agent it stays waiting.
- The message API returns the actual destination conversationId. The customer joins that conversation and refreshes its messages and agent status, retaining visible previous messages.
- Ended sessions and their collaboration consent remain closed.

## Workbench identity synchronization

- Admin conversation lists return the database-backed viewer id, role and isCsAgent. The workbench synchronizes these to the matching authenticated user and login cache on entry and every 15 seconds.
- Reception status and canvas-button availability use the synchronized CS identity; permissions remain enforced by the backend.
