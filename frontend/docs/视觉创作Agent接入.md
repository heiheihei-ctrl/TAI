# 方舟视觉创作 Agent

Tanva 在 AI 对话的模式菜单中新增「视觉创作」。用户可以上传参考图、使用当前选图、描述创作需求，在同一会话中继续修改，并将已转存的图片/视频加入画布。

## 启用

前端入口开关：在 `frontend/.env` 设置 `VITE_VISUAL_AGENT_ENABLED=true` 显示「视觉创作」模式；设为 `false` 或不配置则隐藏。修改后重启前端开发服务，生产环境需重新构建部署。后端执行开关为 `backend/.env` 中的 `VISUAL_AGENT_ENABLED`；设为 `false` 并重启后端可禁用服务。

1. 在火山方舟开通 Managed Agents、视觉增强 Agent、主模型、图片模型、视频模型及相关搜索工具权限。普通生图/视频模型可用不代表 Managed Agents 已开通。
2. 将 `backend/.env.visual-agent.example` 中的配置合并到后端环境。填写 `ARK_API_KEY`、三个模型 ID 和每轮积分价格，设置 `VISUAL_AGENT_ENABLED=true`。模型以该账号控制台实际支持列表为准。
3. 配置现有 `OssService` 存储。可使用 TOS，也可使用本地上传模式。参考图必须有方舟可访问的公网 URL；生产本地模式需配置公网资源域名。
4. 在部署环境执行新增数据库迁移并重新生成客户端：

```sh
cd backend
npx prisma migrate deploy
npx prisma generate
npm run build
```

5. 构建前端并重启后端。API 全局前缀为 `/api`。反向代理应允许 SSE 长连接，保留 `X-Accel-Buffering: no`，不要对该流做响应缓冲。

Windows 开发环境若 `prisma generate` 报 `query_engine-windows.dll.node` 的 EPERM，先正常停止占用该 DLL 的后端开发进程，再生成并重启。不要用 `--no-engine` 替代生产客户端生成。

管理员访问 `GET /api/ai/visual-agent/config` 可查看缺失配置项；普通用户只显示服务是否开通与每轮价格。前端从不接收方舟 API Key。

## Agent 与环境

可设置 `VISUAL_AGENT_ID` 和 `VISUAL_AGENT_ENVIRONMENT_ID` 复用控制台预建资源。预建 Agent 必须是视觉增强类型，并挂载对应模型和工具。

没有配置 ID 时，服务按教程自动创建资源：

- `base_agent=ultra_vision_agent_preview`；主模型 `reasoning_effort=high`。
- 基础工具集 `agent_toolset_20260916`，关闭其中的 `web_search`。
- 多模态工具集 `agent_toolset_multimodal_20260825`，显式启用 `image_generate`、`video_generate`、`visual_search`、`general_search`、`compose_video`，配置图片和视频模型。
- 云端 Environment 使用教程的 `networking.type=unrestricted`。需要限制出网时，在控制台配置符合业务要求的环境并通过 `VISUAL_AGENT_ENVIRONMENT_ID` 引用。
- 内置工具配置为自动执行。预建 Agent 若要求人工工具确认，本版本会清楚标记该轮失败并退款；本版未提供通用工具审批界面。

自动创建的 Agent/Environment 归该本站会话所有；用户关闭会话时会清理。配置复用的资源不会随会话删除。

## 执行、恢复与停止

本站会话绑定登录用户和项目。个人项目检查所有者，团队项目检查当前成员资格；同一会话只允许一个活动轮次。

后端先连接 Session SSE 并等待 `: ready`，再发送 `user.message`。同时分页读取完整事件历史，保存事件游标、脱敏后的消息/工具摘要与执行终态。前端接收本站 SSE 快照，刷新页面不会重新提交任务。

每个 worker 使用独立租约标识，带条件更新数据库，失去租约后不能继续提交或更新该轮。原请求是否被上游接受不明确时，会核对事件历史，不自动重发；超时仍会先读取终态，再请求停止。默认最长执行等待为 45 分钟。

「停止」先持久化取消意图：未提交的任务不会再发往方舟；已经提交的任务由 worker 发送 `user.interrupt` 并等待云端终态。浏览器断开 SSE 不等于取消云端任务。

会话快照展示最近 100 轮。关闭会话会删除本站会话历史和云端 Session；已转存的画布资源保留，尚未转存的云端文件会失去访问入口。

## 产物与设计 JSON

任务终止事件与产物注册并非同时发生。后端查询 `Files API?scope_id=...`，将 PNG/JPEG/WebP/GIF/MP4 流式转存到：

```text
projects/{projectId}/visual-agent/{sessionId}/{fileId}.{ext}
```

单文件最多 512MB；只允许配置域名下的 HTTPS 下载地址，不向下载地址转发 Ark Authorization，不跟随下载重定向。

每轮通过系统消息要求输出文件名使用 `tanva-{turnId}__` 前缀。后端按此前缀归属产物，避免上一轮延迟注册的文件混入下一轮。显示时移除前缀。自定义 Agent 必须遵守这个交付约定；未遵守时不会把未知归属文件自动导入。

完成第一批转存后，后端继续对该轮进行 24 小时的补充同步。用户可点击刷新按钮重新开启同步；此操作不会重新生成或再次扣费。生成结束而预期类型的文件仍未注册时，界面显示提示。

设计 JSON 只保存本站远程 URL/存储 key。参考图中的临时数据先经现有上传服务转换为远程资源；精确编辑时优先使用当前目标图。图片渲染复用 `SmartImage`，图片导入复用快速上传桥接，视频导入复用现有视频节点桥接。产物转存失败时不会向画布提供临时方舟下载链接。

## 计费

服务类型为 `ark-visual-agent`，复用现有个人/团队积分服务。价格来自后端 `VISUAL_AGENT_CREDITS_PER_TURN`，必须是正整数；未配置时禁止启动。

当前采用固定每轮价格：提交前预扣；成功执行后结算；明确拒绝、执行失败或停止时退款。同一请求 ID 重试不会再次提交或扣费。产物转存重试不再次计费。该产品价格不代表方舟上游模型、搜索和沙箱的实际成本，运营需自行设置。

## 本站 API

所有接口均要求登录及对应会话/项目权限。

| 方法 | 路径（省略 `/api/ai/visual-agent`） | 用途 |
| --- | --- | --- |
| GET | `/config` | 可用性及每轮积分 |
| GET | `/sessions?projectId=...` | 最近会话列表 |
| POST | `/sessions` | 创建会话，传 `projectId`、可选 `title` |
| GET | `/sessions/:id` | 会话、最近轮次、消息摘要和已转存产物 |
| POST | `/sessions/:id/messages` | 传 `prompt`、`requestId`、可选 `referenceUrls`（最多 8 张） |
| GET | `/sessions/:id/events` | `snapshot` SSE，支持重新连接 |
| POST | `/sessions/:id/interrupt` | 请求停止当前轮次 |
| POST | `/sessions/:id/sync` | 重新同步延迟产物 |
| DELETE | `/sessions/:id` | 关闭无活动任务的会话并清理其云端资源 |

## 验证

```sh
cd backend
npx vitest run src tests
```

测试覆盖分片 SSE、ready 顺序、远程引用校验、用户隔离、重复提交、过期任务终态恢复、租约接管、终态与游标原子保存、延迟产物归属、排队停止、删除互斥、4xx 退款和 SSE 背压。真实联调需要已开通权限的账号；首次建议生成一张图片，再测试图生视频、多轮修改、刷新恢复和存储失败重试。

官方参考：[视觉创作教程](https://docs.volcengine.com/docs/ark/visual-creation-agent?lang=zh)、[会话事件](https://docs.volcengine.com/docs/ark/session-event-stream?lang=zh)、[创建 Agent](https://docs.volcengine.com/docs/ark/create-agent-api?lang=zh)。
