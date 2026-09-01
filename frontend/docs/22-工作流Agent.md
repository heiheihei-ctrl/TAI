# 对话驱动 Flow 生图工作流 Agent

## 概述

在 AI 对话框选择 **Workflow** 模式后，用户自然语言描述需求 → NestJS 调用 DeepSeek 扩写提示词并规划节点图 → 前端在画布创建 `textPrompt` / `generate`（可选 `image`）、连线并 `runNode` → **结果留在 generate 节点**。

本功能**不依赖**独立 `tgAgent` 进程；生图走现有 Flow 节点积分链路。

## 环境变量（backend）

```bash
DEEPSEEK_API_KEY=        # 必填，否则 /api/ai/workflow-chat 返回 503
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

## API

`POST /api/ai/workflow-chat`（JWT / ApiKeyOrJwtGuard）

请求体：

```json
{
  "prompt": "生成一张现代客厅夕阳氛围图",
  "projectId": "optional",
  "sessionId": "optional",
  "referenceImageUrls": ["https://..."]
}
```

SSE `data:` 帧：`{ seq, body }`，`body.type`：

| type | 含义 |
|------|------|
| `assistant.delta` / `assistant.message` | 对话文案 |
| `tool.status` | 进度文案 |
| `flow.command` | `{ command: apply_graph }` |
| `error` / `done` | 错误或结束 |

结尾另有 `event: done`。

## flow.command.apply_graph 白名单

- 节点类型：`textPrompt` | `generate` | `image`
- 边：`textPrompt.text → generate.text`；图生图另加 `image.img → generate.img`
- `image` 的 `imageUrl` 必须是远程 URL（禁止 `data:` / `blob:` / 裸 base64）
- `runNodeIds`：通常为 `["gen1"]`（tempId，前端映射真实 id）

## 前端事件

| 事件 | 方向 | 说明 |
|------|------|------|
| `flow:agent-apply` | chat → Flow | `{ requestId, command }` |
| `flow:agent-run-result` | Flow → chat | `{ requestId, ok, generateNodeId, imageUrl, error, … }` |
| `flow:updateNodeData` | 写 prompt / 图 | 既有机制 |

执行器：`frontend/src/components/flow/FlowAgentApplyBridge.tsx`（挂在 FlowOverlay）。

## 关键代码

- Backend：`backend/src/ai/workflow-agent/`
- Store：`aiChatStore.workflowChat` / `ManualAIMode = "workflow"`
- UI：AI 对话框模式 **Workflow**

## 验收

1. Workflow 模式输入文生图需求 → 画布出现已连线的 textPrompt+generate → 自动 Run → 图在 generate 节点。
2. 附带参考图 → image+textPrompt→generate。
3. 撤销可回滚建点；未配置 `DEEPSEEK_API_KEY` 时明确报错。
