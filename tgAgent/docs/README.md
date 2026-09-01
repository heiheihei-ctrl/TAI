# 文档索引

本目录存放协议与数据模型的 JSON 模板示例，供前后端联调、测试用例构造使用。

## 文件索引

| 文件 | 说明 |
|---|---|
| [`TAI-INTEGRATION-PLAN.md`](TAI-INTEGRATION-PLAN.md) | 接入 TAI 平台的分阶段计划、契约核实与风险清单 |
| [`P1-ENV-SETUP.md`](P1-ENV-SETUP.md) | 联调环境启动清单（可执行步骤） |
| [`brief-template.json`](brief-template.json) | `DesignBrief` 完整数据示例 |
| [`upstream-messages.json`](upstream-messages.json) | 客户端 → 服务端上行消息示例 |
| [`downstream-messages.json`](downstream-messages.json) | 服务端 → 客户端下行消息示例 |
| [`asset-template.json`](asset-template.json) | `Asset` 资产记录示例 |
| [`resync-example.json`](resync-example.json) | 断线重连 `message.resync` 补发示例 |

## 协议概要

```
客户端 ──WebSocket (port 8712)──► 网关（BFF /chat 转发）
  │  message.send                     │
  │  brief.patch                      │  emit() → seq++
  │  selection.changed                │  ring buffer (500 msg)
  │  card.mark / card.delete          │  attach(sender)
  │  message.resync (重连)            │  resync(lastSeq)
  ▼                                  ▼
mock / 千问 / TAI 任务源          SessionRecord
                                  ├─ seq 环形缓冲
                                  ├─ DesignBrief (深合并)
                                  ├─ SelectionRef[]
                                  ├─ VideoJobRegistry
                                  ├─ Brain (PiBrain | ScriptedBrain)
                                  └─ 持久化快照 (.tgagent-data/，debounce 落盘，
                                     JWT 绝不落盘；SESSION_STORE_DIR=off 关闭)
```

## 快速引用

- **协议定义**: `src/shared/protocol.ts`
- **Brief 定义**: `src/shared/brief.ts`
- **Asset 定义**: `src/shared/assets.ts`
- **画布算法**: `src/canvas/layout.ts`
- **任务源**: `src/tasks/taiSource.ts`
