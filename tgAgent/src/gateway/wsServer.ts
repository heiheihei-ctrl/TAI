/**
 * WebSocket 网关 —— 协议路由（DESIGN.md §5）+ mock 静态资源服务。
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import type { ServerMessage, UpstreamMessage, SelectionRef } from "../shared/protocol.js";
import type { GatewaySessions, SessionRecord } from "./sessions.js";
import { TaskSourceError } from "../tasks/types.js";
import { mapTaskSourceErrorToProtocol } from "../shared/protocol.js";
import { MockTaskSource } from "../tasks/mockSource.js";

const MOCK_MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
};

export interface GatewayHandle {
  port: number;
  close(): Promise<void>;
}

export async function startGateway(opts: {
  port: number;
  host?: string;
  sessions: GatewaySessions;
  log?: (line: string) => void;
  wsToken?: string;
  bffSecret?: string;
  chatRateLimit?: { max: number; windowMs: number };
  chatMaxBodyBytes?: number;
}): Promise<GatewayHandle> {
  const log = opts.log ?? console.log;
  const requiredToken = opts.wsToken ?? ""; // 空字符串 = 关闭鉴权
  const chatRateBuckets = new Map<string, number[]>(); // 每实例独立限流桶
  const httpServer: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/healthz") {
      res.writeHead(200).end("ok");
      return;
    }
    // BFF 转发入口：供 TAI 后端 /api/ai/architecture-chat 调用
    // （见 docs/TAI-INTEGRATION-PLAN.md §3 方案 B、§5）
    if (req.method === "POST" && url.pathname === "/chat") {
      void handleBffChat(req, res, { ...opts, chatRateBuckets });
      return;
    }
    if (url.pathname.startsWith("/mock-assets/")) {
      // 仅允许纯文件名，拒绝路径穿越
      const name = normalize(url.pathname.slice("/mock-assets/".length)).replace(/^([.]{2}[\\/])+/, "");
      const file = join(process.cwd(), ".mock-assets", name);
      readFile(file)
        .then((buf) => {
          res.writeHead(200, { "content-type": MOCK_MIME[extname(name)] ?? "application/octet-stream" });
          res.end(buf);
        })
        .catch(() => {
          res.writeHead(404).end("not found");
        });
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  wss.on("connection", (socket: WebSocket) => {
    let detach: (() => void) | undefined;
    let record: SessionRecord | undefined;
    let authenticated = false;
    // per-connection 速率限制：100 条/秒
    const rateTimestamps: number[] = [];
    const RATE_LIMIT = 100;
    const RATE_WINDOW_MS = 1000;

    const send = (m: ServerMessage) => socket.send(JSON.stringify(m));

    // 鉴权检查：仅当配置了 wsToken 时启用
    const checkAuth = (upstream: UpstreamMessage): boolean => {
      if (!requiredToken) return true; // 未配置令牌，跳过鉴权
      // 方式2: 首条消息必须是 auth
      if (upstream.type === "auth" && (upstream as any).token === requiredToken) {
        authenticated = true;
        send({ seq: 0, body: { type: "conversation.delta", sessionId: "", delta: "鉴权成功" } });
        return true;
      }
      // 未鉴权且首条非 auth 消息
      if (!authenticated) {
        send({ seq: 0, body: { type: "error", code: "invalid_asset_ref", message: "未鉴权：请先发送 {\"type\":\"auth\",\"token\":\"...\"}" } });
        return false;
      }
      return true;
    };

    socket.on("close", () => detach?.());
    socket.on("message", (raw: unknown) => {
      void (async () => {
        let upstream: UpstreamMessage;
        try {
          upstream = JSON.parse(String(raw)) as UpstreamMessage;
        } catch {
          send({ seq: 0, body: { type: "error", code: "bad_request", message: "非法 JSON" } });
          return;
        }
        // 速率检查
        const now = Date.now();
        while (rateTimestamps.length > 0 && now - rateTimestamps[0]! > RATE_WINDOW_MS) {
          rateTimestamps.shift();
        }
        if (rateTimestamps.length >= RATE_LIMIT) {
          if (upstream.type !== "message.resync") {
            send({ seq: 0, body: { type: "error", code: "rate_limited", message: "请求过于频繁" } });
          }
          return;
        }
        rateTimestamps.push(now);
        // 鉴权检查（wsToken 未配置时跳过）
        if (!checkAuth(upstream)) return;
        try {
          await route(upstream);
        } catch (err) {
          const message = (err as Error)?.message ?? "internal error";
          console.error(`[gateway] 处理上行消息异常: ${message}`, err);
          send({
            seq: 0,
            body: {
              type: "error",
              code: "internal",
              message,
            },
          });
        }
      })();

      async function route(msg: UpstreamMessage): Promise<void> {
        switch (msg.type) {
          case "message.send": {
            const target = opts.sessions.getOrCreate(msg.projectId, msg.sessionId);
            if (target !== record) {
              detach?.(); // 解绑旧会话
              record = target;
              detach = record.attach(send);
            } else if (!detach) {
              detach = record.attach(send);
            }
            // 携带 lastSeq 补发：piggyback resync，客户端在收到新消息前先补上遗漏
            if (msg.lastSeq !== undefined) {
              send(record.resync(msg.lastSeq));
            }
            await record.handleSend(msg);
            return;
          }
          case "message.steer": {
            await record?.steer(msg.text);
            return;
          }
          case "message.interrupt": {
            await record?.interrupt();
            return;
          }
          case "selection.changed": {
            // 选区快照挂在会话上；未建会话时先缓存到新建的会话
            record ??= opts.sessions.getOrCreate(msg.projectId);
            detach ??= record.attach(send);
            record.setSelection(
              msg.selectionRefs ??
                (msg.selectionIds ?? []).map((assetId) => ({ assetId, kind: "image" as const })),
            );
            return;
          }
          case "task.cancel": {
            await record?.cancelVideo(msg.taskId);
            return;
          }
          case "card.mark": {
            record?.markCards(msg.marks);
            return;
          }
          case "card.delete": {
            record ??= opts.sessions.getOrCreate(msg.projectId, msg.sessionId);
            detach ??= record.attach(send);
            if (msg.assetId) {
              record.assets.delete(msg.assetId);
              record.removeSelection(msg.assetId);
            }
            record.emit({
              type: "canvas.update",
              sessionId: msg.sessionId ?? record.sessionId,
              updates: [{ assetId: msg.assetId, patch: { deleted: true } }],
            });
            return;
          }
          case "brief.patch": {
            record?.patchBrief(msg.patch);
            return;
          }
          case "mode.toggle": {
            if (!msg.sessionId) {
              send({ seq: 0, body: { type: "error", code: "bad_request", message: "mode.toggle 需要 sessionId，请先发送 message.send 建立会话" } });
              return;
            }
            const target = opts.sessions.getOrCreate(msg.projectId, msg.sessionId);
            if (target !== record) {
              detach?.();
              record = target;
              detach = record.attach(send);
            } else if (!detach) {
              detach = record.attach(send);
            }
            record.setMode(msg.mode);
            return;
          }
          case "session.fork":
          case "session.switch": {
            send({
              seq: 0,
              body: {
                type: "error",
                sessionId: msg.sessionId,
                code: "bad_request",
                message: "会话树分叉/切换将在 pi 会话树对接后启用（DESIGN.md §3.3）",
              },
            });
            return;
          }
          case "message.resync": {
            // 新连接可凭 projectId+sessionId 路由到已有会话并挂载下行（刷新/重连恢复）
            if (!record && msg.projectId && msg.sessionId) {
              const found = opts.sessions.get(msg.projectId, msg.sessionId);
              if (found) {
                record = found;
                detach ??= record.attach(send);
              }
            }
            if (!record) return;
            send(record.resync(msg.lastSeq));
            return;
          }
          default: {
            send({ seq: 0, body: { type: "error", code: "bad_request", message: "未知消息类型" } });
          }
        }
      }
    });
  });

  return new Promise((resolve) => {
    const host = opts.host ?? "127.0.0.1";
    httpServer.listen(opts.port, host, () => {
      const addr = httpServer.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : opts.port;
      log(`[gateway] http://${host}:${actualPort} | ws://localhost:${actualPort}/ws 已就绪；静态资源: /mock-assets/*`);
      resolve({
        port: actualPort,
        close: async () => {
          wss.close();
          await new Promise<void>((r) => httpServer.close(() => r()));
        },
      });
    });
  });
}

// MockTaskSource 写出的文件由 /mock-assets 服务；导出常量供测试对齐
export const MOCK_ASSETS_URL_PREFIX = "/mock-assets";
export { MockTaskSource };

/** 单轮总上限，仅作兜底——正常情况下 handleSend 返回即结束，此定时器不该被触发 */
const BFF_CHAT_MAX_MS = 180_000;

/** 每 IP 滑动窗口限流（每个网关实例独立桶） */
function chatRateLimited(
  buckets: Map<string, number[]>,
  ip: string,
  max: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    buckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  buckets.set(ip, arr);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return false;
}

/**
 * BFF 转发入口：`POST /chat`，SSE 流式响应。
 *
 * 为什么需要它：TAI 前端只与 TAI 后端通信，不直连 tgagent；而鉴权与积分必须走 TAI 后端
 * （apiKey 路径不扣用户积分，见 docs/TAI-INTEGRATION-PLAN.md §7）。所以由 TAI 后端校验
 * JWT 后转发到这里，并把 `Authorization` 透传回来——tgagent 回调 TAI 生图接口时用它扣用户积分。
 *
 * 结束条件：`handleSend` 内部是 `await brain.handleUserMessage()` → pi 的 `await session.prompt()`，
 * 该 Promise 要到**本轮 agent 执行完成**才 resolve。所以 await 返回即可结束本轮，**无需静默等待**。
 * 保留 BFF_CHAT_MAX_MS 仅为兜底：上游万一挂死时，SSE 仍能关闭而不是永远悬着。
 */
async function handleBffChat(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    sessions: GatewaySessions;
    log?: (line: string) => void;
    bffSecret?: string;
    chatRateLimit?: { max: number; windowMs: number };
    chatMaxBodyBytes?: number;
    chatRateBuckets: Map<string, number[]>;
  },
): Promise<void> {
  const log = opts.log ?? console.log;

  // ── 服务间鉴权：x-bff-token 须匹配 BFF_SECRET ──
  const secret = opts.bffSecret ?? "";
  if (secret) {
    const provided = req.headers["x-bff-token"];
    if (provided !== secret) {
      res.writeHead(401, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
  }

  // ── 每 IP 限流 ──
  const ip = req.socket.remoteAddress ?? "unknown";
  const rl = opts.chatRateLimit ?? { max: 10, windowMs: 10_000 };
  if (chatRateLimited(opts.chatRateBuckets, ip, rl.max, rl.windowMs)) {
    res.writeHead(429, { "content-type": "application/json" })
      .end(JSON.stringify({ error: "rate_limited" }));
    return;
  }

  // ── 读请求体（带上限） ──
  const maxBytes = opts.chatMaxBodyBytes ?? 1_048_576;
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const c of req) {
      total += (c as Buffer).length;
      if (total > maxBytes) {
        res.writeHead(413, { "content-type": "application/json" })
          .end(JSON.stringify({ error: "payload too large" }));
        req.destroy();
        return;
      }
      chunks.push(Buffer.from(c));
    }
  } catch {
    res.writeHead(400, { "content-type": "application/json" })
      .end(JSON.stringify({ error: "读取请求体失败" }));
    return;
  }

  let payload: {
    projectId?: string;
    sessionId?: string;
    text?: string;
    selectionRefs?: SelectionRef[];
    attachments?: { mediaType: string; data: string }[];
  };
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString("utf-8") || "{}");
  } catch {
    res.writeHead(400, { "content-type": "application/json" })
      .end(JSON.stringify({ error: "非法 JSON" }));
    return;
  }

  const text = (payload.text ?? "").trim();
  if (!text && !payload.attachments?.length) {
    res.writeHead(400, { "content-type": "application/json" })
      .end(JSON.stringify({ error: "text 与 attachments 不能同时为空" }));
    return;
  }

  // ── 用户身份派生（bearer hash → userId，隔离不同租户的会话） ──
  const authRaw = req.headers["authorization"];
  const bearer = typeof authRaw === "string" ? authRaw.replace(/^Bearer\s+/i, "").trim() : "";
  const teamRaw = req.headers["x-team-id"];
  const userId = bearer
    ? createHash("sha256").update(bearer).digest("hex").slice(0, 16)
    : "anon";

  const record = opts.sessions.getOrCreate(payload.projectId ?? "p_demo", payload.sessionId, userId);

  // ── 凭证注入（在 SSE 头之前，以便跨租户拒绝时返回 409 JSON） ──
  try {
    record.applyBffAuth(
      bearer ? { bearer, teamId: typeof teamRaw === "string" && teamRaw.trim() ? teamRaw.trim() : undefined } : undefined,
    );
  } catch (err) {
    if (err instanceof TaskSourceError) {
      const { code, message } = mapTaskSourceErrorToProtocol(err);
      res.writeHead(409, { "content-type": "application/json" })
        .end(JSON.stringify({ error: message, code }));
    } else {
      // 务必留下堆栈：凭证注入发生在 SSE 头写出之前，这里一旦吞掉错误，
      // 客户端只能拿到一句 "internal error"，服务端日志也空空如也——
      // 2026-08-29 的 P0-B（withUserAuth 带入 apiToken 撞构造期断言）
      // 正是靠这个盲区潜伏下来，表现为整条计费链路 500 却无迹可寻。
      log(
        `[bff] /chat 凭证注入失败: ${(err as Error)?.message ?? err}\n` +
          ((err as Error)?.stack ?? "(no stack)"),
      );
      res.writeHead(500, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "internal error" }));
    }
    return;
  }

  // ── SSE 头 ──
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });

  let finished = false;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let detach: (() => void) | undefined;

  const finish = (): void => {
    if (finished) return;
    finished = true;
    if (maxTimer) clearTimeout(maxTimer);
    detach?.();
    try {
      res.write("event: done\ndata: {}\n\n");
      res.end();
    } catch {
      /* 客户端已断开，忽略 */
    }
  };

  maxTimer = setTimeout(finish, BFF_CHAT_MAX_MS);

  detach = record.attach((m) => {
    if (finished) return;
    try {
      res.write(`data: ${JSON.stringify(m)}\n\n`);
    } catch {
      finish();
    }
  });

  try {
    await record.handleSend({
      type: "message.send",
      projectId: record.projectId,
      ...(payload.sessionId ? { sessionId: payload.sessionId } : {}),
      text,
      // HTTP 每轮都是新请求，用时间戳+随机数保证幂等键唯一
      clientId: `bff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      ...(payload.attachments?.length ? { attachments: payload.attachments } : {}),
      ...(payload.selectionRefs?.length ? { selectionRefs: payload.selectionRefs } : {}),
    });
    // handleSend 内部 await 了 pi 的 session.prompt（本轮 agent 执行完才 resolve），
    // 因此到这里即可收尾——不需要再静默观察一段时间。
    finish();
  } catch (err) {
    const message = (err as Error)?.message ?? "internal error";
    log(`[bff] /chat 处理失败: ${message}`);
    if (!finished) {
      // 走 record.emit 而非直接写帧：保证 seq 仍由会话统一分配、保持单调递增。
      // 硬编码 seq: 0 会让客户端的断线补发逻辑误判为"历史消息"。
      record.emit({ type: "error", sessionId: record.sessionId, code: "internal", message });
      finish();
    }
  }
}
