/**
 * 入口：装配配置 → 任务源 → 会话管理 → 网关。
 */

import { loadConfig } from "./config.js";
import { AssetStore } from "./assets/store.js";
import { MockTaskSource } from "./tasks/mockSource.js";
import { TaiTaskSource } from "./tasks/taiSource.js";
import { QianwenTaskSource } from "./tasks/qianwenSource.js";
import { GatewaySessions } from "./gateway/sessions.js";
import { startGateway } from "./gateway/wsServer.js";
import type { GenerationTaskSource } from "./tasks/types.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  const assets = new AssetStore();

  const taskSource: GenerationTaskSource =
    cfg.taskSource === "tai"
      ? new TaiTaskSource({
          baseUrl: cfg.tai.apiBaseUrl,
          apiToken: cfg.tai.apiToken,
          imageProvider: cfg.tai.imageProvider,
          imageModel: cfg.tai.imageModel,
          videoProvider: cfg.tai.videoProvider,
        })
      : cfg.taskSource === "qianwen"
        ? new QianwenTaskSource({
            apiKey: cfg.qianwen.apiKey,
            baseUrl: cfg.qianwen.baseUrl,
            model: cfg.qianwen.imageModel,
          })
        : new MockTaskSource();

  const sessions = new GatewaySessions(cfg, assets, taskSource);
  const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

  const gw = await startGateway({
    port: cfg.port,
    host: cfg.host,
    sessions,
    log,
    wsToken: cfg.wsToken,
    bffSecret: cfg.bffSecret,
    chatRateLimit: cfg.chatRateLimit,
    chatMaxBodyBytes: cfg.chatMaxBodyBytes,
  });

  log(`tgagent 启动完成`);
  log(
    `  任务源: ${taskSource.name}` +
      (cfg.taskSource === "qianwen" ? `（生图模型: ${cfg.qianwen.imageModel}）` : "") +
      (cfg.taskSource === "tai" && cfg.tai.apiBaseUrl
        ? `（后端: ${cfg.tai.apiBaseUrl}，生图: ${cfg.tai.imageProvider}，视频: ${cfg.tai.videoProvider}）`
        : ""),
  );
  log(
    cfg.deepseek.apiKey
      ? `  对话大脑: pi + ${cfg.deepseek.model}（W1-① 验证中，失败自动降级脚本大脑）`
      : `  对话大脑: ScriptedBrain（未配置 DEEPSEEK_API_KEY）`,
  );
  log(`  绑定地址: ${cfg.host}:${gw.port}`);
  if (!cfg.bffSecret) log(`  ⚠️ BFF_SECRET 未配置：/chat 不做服务间鉴权（仅限本地开发）`);
  log(`  联调: wscat -c ws://localhost:${gw.port}/ws`);
  log(
    `  发送示例: {"type":"message.send","projectId":"p_demo","text":"帮我出一个滨江办公楼的黄昏效果图","clientId":"c1"}`,
  );

  const shutdown = async () => {
    log("正在关闭…");
    await sessions.disposeAll();
    taskSource.dispose?.();
    await gw.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err) => {
  console.error("启动失败:", err);
  process.exit(1);
});
