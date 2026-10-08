# 玲珑客服工作台（cs-desk）

仅 `DEPLOYMENT_BRAND=linglong` / 前端 `VITE_DEPLOYMENT_BRAND=linglong`（或登录页玲珑身份）启用。

## 能力

- 用户：画布右下角客服入口，创建/续接会话，收发文本/附件，响应协同卡片与服务包卡片。
- 座席：管理后台「客服工作台」三栏（待接入/进行中/已结束 · 聊天 · 客户信息）。
- 座席动作：接入、结束、转接、快捷回复、推荐服务包、附件、创建工单、发起协同（默认 50 元/次/分钟，本期不自动扣费）。

## 客服身份

- `User.isCsAgent`（与 `role` 独立）。完整管理员在用户管理勾选「座席」。
- 可进工作台：`admin` / `normal_admin` **或** `isCsAgent=true`。
- 仅 `isCsAgent`：`/admin` 只显示「客服工作台」。

## 多客服分单

- 打开工作台并连接 `/ws/cs` → `CsAgentPresence=online`（可手动切「暂离」`away`）。
- 用户建会话后：在线客服中按 **active 会话数最低**（同分按 `csAgentLastAssignedAt`）自动分配；原子 `UPDATE waiting AND agentId IS NULL`。
- 无人在线：留在待接入池，座席手动接入（同样条件更新防双抢）。
- 转接：`POST /api/cs/admin/conversations/:id/transfer`，目标须在线。

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
