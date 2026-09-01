/**
 * 会话与资产持久化 —— 零依赖文件存储。
 *
 * 背景：BFF 形态下进程重启 = 会话全灭（内存 Map），表现为用户回到 TAI 对话框后
 * agent"失忆"、上一轮的图与需求档案消失；多副本部署时请求打到不同实例也会静默
 * 新建空会话。此模块把会话快照与资产表落到本地文件，进程重启后按需恢复。
 *
 * 设计取舍：
 * - **只存可重建的状态**（seq/ring/brief/selection/mode/placedRects/资产/未完成的视频任务），
 *   不存 pi 大脑上下文（重启后对话历史从空开始，属可接受降级）与用户 JWT（凭证绝不落盘）。
 * - 文件名用 `sha256(key)` 前缀：键里含用户提供的 projectId/sessionId，
 *   直接拼路径会有穿越风险。
 * - 原子写：先写临时文件再 rename，避免半截 JSON 被当快照加载。
 * - 写失败只记日志不打断会话：持久化是韧性手段，不能反过来杀死服务。
 */

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Asset, GenJob } from "../shared/assets.js";
import type { Rect } from "../canvas/layout.js";
import type { DesignBrief } from "../shared/brief.js";
import type { Downstream, SelectionRef } from "../shared/protocol.js";

/** 落盘时 ring 只保留最近这么多条（内存里是 500，快照砍半） */
const PERSIST_RING_LIMIT = 250;

export interface PersistedVideoJob {
  job: GenJob;
  baseFrameAssetId: string;
  toolCallId: string;
}

export interface PersistedSession {
  version: 1;
  /** 会话键 `${projectId}/${userId}/${sessionId}`（冗余存一份，便于排查） */
  key: string;
  projectId: string;
  sessionId: string;
  userId: string;
  /** 下行 seq（断线补发游标，恢复后继续单调递增） */
  seq: number;
  ring: Downstream[];
  brief: DesignBrief;
  selection: SelectionRef[];
  mode: "chat" | "design";
  placedRects: Rect[];
  /** 未完成的视频任务（重启后待用户凭证注入再恢复轮询） */
  pendingVideoJobs: PersistedVideoJob[];
  updatedAt: string;
}

function hashName(kind: "sessions" | "assets", key: string): string {
  const h = createHash("sha256").update(`${kind}:${key}`).digest("hex").slice(0, 24);
  return `${h}.json`;
}

export class SessionStore {
  readonly enabled: boolean;
  private readonly dir: string;

  /**
   * @param rawDir 存储目录。空串 / "off" / "memory" = 关闭持久化（测试与本地联调用）。
   *               相对路径相对 process.cwd()。
   */
  constructor(rawDir: string | undefined, private readonly log: (line: string) => void = console.log) {
    const d = (rawDir ?? "").trim();
    this.enabled = d !== "" && d.toLowerCase() !== "off" && d.toLowerCase() !== "memory";
    this.dir = this.enabled ? d : "";
  }

  // ---------- 会话快照 ----------

  async saveSession(snap: PersistedSession): Promise<void> {
    if (!this.enabled) return;
    const trimmed: PersistedSession = {
      ...snap,
      ring: snap.ring.slice(-PERSIST_RING_LIMIT),
    };
    await this.atomicWrite(
      join(this.dir, "sessions", hashName("sessions", snap.key)),
      JSON.stringify(trimmed),
    );
  }

  /** 启动时加载全部会话快照（目录不存在视为空） */
  async loadSessions(): Promise<PersistedSession[]> {
    return this.loadDir<PersistedSession>(join(this.dir, "sessions"));
  }

  async deleteSession(key: string): Promise<void> {
    if (!this.enabled) return;
    await rm(join(this.dir, "sessions", hashName("sessions", key)), { force: true }).catch(() => undefined);
  }

  // ---------- 资产表（按 projectId 分文件） ----------

  async saveAssets(projectId: string, assets: Asset[]): Promise<void> {
    if (!this.enabled) return;
    await this.atomicWrite(
      join(this.dir, "assets", hashName("assets", projectId)),
      JSON.stringify(assets),
    );
  }

  /** 启动时加载全部项目的资产（跨项目合并进同一个 AssetStore） */
  async loadAssets(): Promise<Asset[]> {
    const groups = await this.loadDir<Asset[]>(join(this.dir, "assets"));
    return groups.flat();
  }

  // ---------- 内部 ----------

  private async atomicWrite(path: string, content: string): Promise<void> {
    try {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp-${randomUUID().slice(0, 8)}`;
      await writeFile(tmp, content, "utf-8");
      await rename(tmp, path);
    } catch (err) {
      // 持久化失败绝不打断会话，但必须留日志（否则又是"静默降级"）
      this.log(`[store] 写入失败 ${path}: ${(err as Error)?.message ?? err}`);
    }
  }

  private async loadDir<T>(dir: string): Promise<T[]> {
    if (!this.enabled) return [];
    try {
      const names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
      const out: T[] = [];
      for (const n of names) {
        try {
          const raw = await readFile(join(dir, n), "utf-8");
          const parsed = JSON.parse(raw) as T;
          if (parsed) out.push(parsed);
        } catch (err) {
          this.log(`[store] 快照损坏，跳过 ${n}: ${(err as Error)?.message ?? err}`);
        }
      }
      return out;
    } catch {
      // 目录不存在（首次启动）或不可读：视为空
      return [];
    }
  }
}
