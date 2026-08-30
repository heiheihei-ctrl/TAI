/**
 * 离线开发服务器 —— 强制 ScriptedBrain + mock 任务源（零外部依赖、零 token），
 * 供前端 GUI 联调：npm run dev:offline
 * 注意：DEEPSEEK_API_KEY 置空必须先于 config 加载（.env 不覆盖已存在的环境变量）。
 */

process.env.DEEPSEEK_API_KEY = "";
process.env.TASK_SOURCE = process.env.TASK_SOURCE || "mock";

const { loadConfig } = await import("../src/config.js");
const { AssetStore } = await import("../src/assets/store.js");
const { MockTaskSource } = await import("../src/tasks/mockSource.js");
const { GatewaySessions } = await import("../src/gateway/sessions.js");
const { startGateway } = await import("../src/gateway/wsServer.js");

const cfg = loadConfig();
const sessions = new GatewaySessions(cfg, new AssetStore(), new MockTaskSource());
const gw = await startGateway({ port: cfg.port, sessions });
console.log(`[dev-offline] 网关 ws://localhost:${gw.port}/ws（ScriptedBrain + mock 任务源，Ctrl+C 退出）`);
