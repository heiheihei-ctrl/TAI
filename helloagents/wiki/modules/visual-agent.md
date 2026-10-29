# 视觉创作 Agent

- 入口：AI 对话 → 模式 → 视觉创作。
- 前端：`VisualCreationPanel.tsx` 管理独立会话、参考图、状态流及资源导入；`visualAgentApi.ts` 调用鉴权接口。
- 后端：`backend/src/ai/visual-agent/`，注册于 `AiModule`。通过方舟 Managed Agents 执行图片/视频创作。
- 持久化：Prisma `VisualAgentSession` / `VisualAgentTurn`，迁移 `202610280001_visual_agent`。会话按用户/项目隔离；执行游标、终态、租约、取消意图和产物持久化。
- 产物：Files API → OssService → 本站远程 URL/key；不得将临时地址/base64 写入设计 JSON。按轮次文件名前缀归属，结束后继续同步延迟文件；支持手动重新同步。
- 积分：`ark-visual-agent`；`VISUAL_AGENT_CREDITS_PER_TURN` 设置固定每轮积分，预扣、成功结算、失败/取消退款；转存重试不重复生成或计费。
- 配置：`backend/.env.visual-agent.example`。开通权限、设置模型/价格并应用迁移后启用；没有配置时前端显示未开通。
- 运维与 API 详见 [`frontend/docs/视觉创作Agent接入.md`](../../../frontend/docs/视觉创作Agent接入.md)。
# 联调错误诊断

方舟 REST 请求失败时返回 HTTP 状态、请求方法/资源类型、上游 error.code 和 request_id（若存在）。不返回原始响应 message、请求内容或密钥。400 不能仅凭状态码归因为权限或余额问题，应结合错误码定位；客户端回归测试覆盖诊断信息和敏感内容隔离。

# 入口状态

前端入口由 `frontend/.env` 的 `VITE_VISUAL_AGENT_ENABLED=true` 控制；设为 `false` 或未配置时隐藏，并通过可用模式检查回退。修改后需重启 Vite，生产环境需重新构建。后端 `VISUAL_AGENT_ENABLED` 独立控制服务执行，关闭服务需设为 `false` 并重启后端。

视觉创作入口已恢复：AI 对话 → 模式 → 视觉创作。使用现有 VisualCreationPanel、后台接口和历史会话；服务可用性仍由后端配置控制。

