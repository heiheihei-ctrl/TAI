/**
 * pi SDK 兼容层 —— 全项目唯一直接 import pi 的出口之一（另一处是 agent/session.ts）。
 * pi 升级或 API 漂移时只改这里。
 *
 * 说明：defineTool / Type 的具体导出名以 0.84.3 实测为准（W1-① 连通验证时确认）。
 */

export { defineTool } from "@earendil-works/pi-coding-agent";
export { Type } from "@sinclair/typebox";
