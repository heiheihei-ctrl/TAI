# 模板 JSON 示例

本目录存放协议与数据模型的 JSON 模板示例，供前后端联调、测试用例构造、新成员 onboarding 使用。

## 文件索引

| 文件 | 说明 |
|---|---|
| [`P1-ENV-SETUP.md`](P1-ENV-SETUP.md) | **P1 联调环境启动清单**（可执行步骤；含三处易踩空的核实结论） |
| [`TAI-INTEGRATION-PLAN.md`](TAI-INTEGRATION-PLAN.md) | 接入 TAI 平台的分阶段计划、契约核实与风险清单 |
| [`CODE-REVIEW-2026-08-29.md`](CODE-REVIEW-2026-08-29.md) | 代码审查报告（计费链路改造批次；P0/P1 清单已于 2026-08-30 全部关闭） |
| [`brief-template.json`](brief-template.json) | `DesignBrief` 完整数据示例 |
| [`upstream-messages.json`](upstream-messages.json) | 客户端 → 服务端上行消息示例 |
| [`downstream-messages.json`](downstream-messages.json) | 服务端 → 客户端下行消息示例 |
| [`asset-template.json`](asset-template.json) | `Asset` 资产记录示例 |
| [`resync-example.json`](resync-example.json) | 断线重连 `message.resync_batch` 示例 |

## 协议概要

```
客户端 ──WebSocket (port 8712)──► 网关
  │  message.send (上行)           │
  │  brief.patch                   │  emit() → seq++
  │  selection.changed             │  ring buffer (500 msg)
  │  card.mark / card.delete       │  attach(sender)
  │  message.resync (重连)        │  resync(lastSeq)
  ▼                              ▼
存根/TAI/千问任务源           SessionRecord
                              ├─ seq 环形缓冲
                              ├─ DesignBrief (深合并)
                              ├─ SelectionRef[]
                              ├─ VideoJobRegistry
                              └─ Brain (PiBrain | ScriptedBrain)
```

## 快速引用

- **协议定义**: `src/shared/protocol.ts`
- **Brief 定义**: `src/shared/brief.ts`
- **Asset 定义**: `src/shared/assets.ts`
- **画布算法**: `src/canvas/layout.ts`
