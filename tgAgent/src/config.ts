/**
 * 配置加载 —— 零依赖 .env 读取（避免 dotenv 依赖）；环境变量优先于 .env 文件。
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadDotFile(): void {
  const p = join(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2] ?? "";
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotFile();

export interface AppConfig {
  port: number;
  deepseek: {
    apiKey: string;
    baseUrl: string;
    model: string;
  };
  tai: {
    /** TAI 后端根地址（NestJS，不含 /api 前缀），如 http://localhost:4000 */
    apiBaseUrl: string;
    /** TAI 后端 x-api-key */
    apiToken: string;
    /** 生图 provider（image-generation.dto aiProvider 枚举），默认 banana-3.1 */
    imageProvider: string;
    /** 生图模型 ID 覆盖（可选） */
    imageModel: string;
    /** 视频 provider（video-provider.dto 枚举），默认 kling-o3 */
    videoProvider: string;
  };
  /** 千问生图（测试后端，TASK_SOURCE=qianwen 时启用） */
  qianwen: {
    apiKey: string;
    baseUrl: string;
    imageModel: string;
  };
  taskSource: "mock" | "tai" | "qianwen";
  /** WebSocket 连接鉴权令牌（空字符串 = 关闭鉴权，仅本地开发） */
  wsToken: string;
  /** HTTP/WS 绑定地址；默认 127.0.0.1（仅本机）。生产由 TAI 部署设为 0.0.0.0 */
  host: string;
  /** BFF 服务间共享密钥；请求头 x-bff-token 须匹配。空 = 开发模式跳过校验 */
  bffSecret: string;
  /** /chat 每 IP 滑动窗口限流 */
  chatRateLimit: { max: number; windowMs: number };
  /** /chat 请求体上限（字节） */
  chatMaxBodyBytes: number;
  /**
   * 会话/资产持久化目录（相对 cwd）。
   * "off"/"memory"/空 = 关闭持久化（纯内存，测试与本地联调默认）。
   */
  sessionStoreDir: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 8712),
    deepseek: {
      apiKey: process.env.DEEPSEEK_API_KEY ?? "",
      baseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash-vision-exp",
    },
    tai: {
      apiBaseUrl: process.env.TAI_API_BASE_URL ?? "",
      apiToken: process.env.TAI_API_TOKEN ?? "",
      // 默认 banana-3.1：唯一同时支持 aspectRatio 与 editImage 的 provider。
      // seedream5 / 5Pro 会丢弃 aspectRatio，且 editImage() 直接抛错，与「保迭代/比例」冲突。
      // 代价：banana 的 n:1 硬编码，多候选需靠并发多个独立任务实现。
      imageProvider: process.env.TAI_IMAGE_PROVIDER ?? "banana-3.1",
      imageModel: process.env.TAI_IMAGE_MODEL ?? "",
      videoProvider: process.env.TAI_VIDEO_PROVIDER ?? "kling-o3",
    },
    qianwen: {
      apiKey: process.env.QIANWEN_API_KEY ?? "",
      baseUrl: process.env.QIANWEN_BASE_URL ?? "https://dashscope.aliyuncs.com/api/v1",
      imageModel: process.env.QIANWEN_IMAGE_MODEL ?? "wan2.7-image",
    },
    taskSource: (process.env.TASK_SOURCE as "mock" | "tai" | "qianwen") ?? "mock",
    wsToken: process.env.WS_TOKEN ?? "",
    host: process.env.HOST ?? "127.0.0.1",
    bffSecret: process.env.BFF_SECRET ?? "",
    chatRateLimit: {
      max: Number(process.env.CHAT_RATE_MAX ?? 10),
      windowMs: Number(process.env.CHAT_RATE_WINDOW_MS ?? 10_000),
    },
    chatMaxBodyBytes: Number(process.env.CHAT_MAX_BODY_BYTES ?? 1_048_576),
    sessionStoreDir: (process.env.SESSION_STORE_DIR ?? ".tgagent-data").trim(),
  };
}

/** 是否具备启用 pi 真实大脑的条件（W1-①：DeepSeek key 就绪） */
export function piBrainReady(cfg: AppConfig): boolean {
  return cfg.deepseek.apiKey.length > 0;
}
