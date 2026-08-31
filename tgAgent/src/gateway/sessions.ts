/**
 * 会话记录与路由 —— 每个会话一份：seq 环形缓冲、brief、选区快照、视频任务轮询、Brain。
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { emptyBrief, mergeBrief, type DesignBrief, type DesignBriefPatch } from "../shared/brief.js";
import type { GenJob } from "../shared/assets.js";
import type {
  Downstream,
  DownstreamBody,
  MsgSend,
  SelectionRef,
  ServerMessage,
  ResyncBatch,
} from "../shared/protocol.js";
import { mapTaskSourceErrorToProtocol } from "../shared/protocol.js";
import type { AssetStore } from "../assets/store.js";
import { CARD_H, CARD_W, layoutCandidates, type Rect } from "../canvas/layout.js";
import type { PersistedSession, SessionStore } from "./sessionStore.js";
import { TaskSourceError } from "../tasks/types.js";
import type { GenerationTaskSource } from "../tasks/types.js";
import type { ToolContext, VideoJobRegistry } from "../agent/tools/context.js";
import type { Brain } from "../agent/brain.js";
import { ScriptedBrain } from "../agent/brain.js";
import { PiBrain, PiSetupError } from "../agent/piBrain.js";
import type { AppConfig } from "../config.js";

const RING_SIZE = 500;
const VIDEO_POLL_MS = 1500;
const MAX_POLL_ERRORS = 10; // 单任务连续错误上限，超出后标记失败
/** 落盘 debounce：一轮生图会触发几十次 emit，不能每次都写文件 */
const PERSIST_DEBOUNCE_MS = 500;

interface VideoJobEntry {
  job: GenJob;
  baseFrameAssetId: string;
  toolCallId: string;
  consecutiveErrors: number;
}

export class SessionRecord {
  readonly sessionId: string;
  readonly projectId: string;
  readonly userId: string;

  private seq = 0;
  private ring: Downstream[] = [];
  private senders = new Set<(m: ServerMessage) => void>();
  private brief: DesignBrief = emptyBrief();
  private selection: SelectionRef[] = [];
  /** 当前模式："chat" 对话 | "design" 设计（前端通过 mode.toggle 切换） */
  private mode: "chat" | "design" = "chat";
  private videoEntries = new Map<string, VideoJobEntry>();
  private pollTimer: NodeJS.Timeout | undefined;
  private brain: Brain | undefined;
  private ctxCache: ToolContext | undefined;
  private placedRects: Rect[] = [];
  /** 会话级 jwt 任务源（BFF 透传用户 JWT 时创建，见 applyBffAuth） */
  private jwtSource: GenerationTaskSource | undefined;
  private jwtAuth: { bearer: string; teamId?: string } | undefined;
  /** 状态变更后通知 GatewaySessions 落盘（持久化钩子，见 gateway/sessionStore.ts） */
  private readonly notifyDirty?: () => void;

  /** 当前生效的任务源：有会话级 jwt 源时优先，否则用共享源 */
  get effectiveTaskSource(): GenerationTaskSource {
    return this.jwtSource ?? this.taskSource;
  }

  constructor(
    readonly assets: AssetStore,
    readonly taskSource: GenerationTaskSource,
    private readonly cfg: AppConfig,
    private readonly log: (line: string) => void,
    projectId: string,
    sessionId?: string,
    userId = "anon",
    notifyDirty?: () => void,
  ) {
    this.projectId = projectId;
    this.sessionId = sessionId ?? `sess_${randomUUID().slice(0, 12)}`;
    this.userId = userId;
    this.notifyDirty = notifyDirty;
  }

  // ---------- ToolContext（惰性构建，避免字段初始化顺序问题） ----------

  get ctx(): ToolContext {
    if (!this.ctxCache) {
      const self = this;
      this.ctxCache = {
        projectId: this.projectId,
        sessionId: this.sessionId,
        getBrief: () => this.brief,
        applyBriefPatch: (patch, reason) => this.applyBriefPatch(patch, reason),
        assets: this.assets,
        // 活引用：BFF 透传用户 JWT 后会话级源才到位，工具执行时须读到当前生效的源
        get taskSource() {
          return self.effectiveTaskSource;
        },
        videoJobs: this.videoRegistry(),
        canvasOccupancy: {
          get: () => [...this.placedRects],
          add: (rects) => {
            this.placedRects.push(...rects);
          },
        },
        currentSelection: () =>
          this.selection.flatMap((s) => {
            const a = this.assets.get(s.assetId);
            return a && !a.deleted
              ? [{ assetId: a.id, x: s.x, y: s.y, width: s.width, url: a.url }]
              : [];
          }),
        emit: (body) => this.emit(body),
      };
    }
    return this.ctxCache;
  }

  // ---------- 生命周期 ----------

  async ensureBrain(): Promise<Brain> {
    if (this.brain) return this.brain;
    if (this.cfg.deepseek.apiKey) {
      try {
        this.brain = await PiBrain.create(this.ctx, {
          apiKey: this.cfg.deepseek.apiKey,
          baseUrl: this.cfg.deepseek.baseUrl,
          model: this.cfg.deepseek.model,
          dataDir: join(process.cwd(), ".pi-data"),
        });
        this.log(`[${this.sessionId}] PiBrain 已启用（${this.cfg.deepseek.model}）`);
        return this.brain;
      } catch (err) {
        this.log(
          `[${this.sessionId}] PiBrain 初始化失败，降级 ScriptedBrain：${err instanceof PiSetupError ? err.message : String(err)}`,
        );
      }
    } else {
      this.log(`[${this.sessionId}] 未配置 DEEPSEEK_API_KEY，使用 ScriptedBrain（全链路联调模式）`);
    }
    this.brain = new ScriptedBrain(this.ctx);
    return this.brain;
  }

  async dispose(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    await this.brain?.dispose();
  }

  // ---------- 下行 ----------

  attach(sender: (m: ServerMessage) => void): () => void {
    this.senders.add(sender);
    return () => this.senders.delete(sender);
  }

  emit(body: DownstreamBody): void {
    this.seq++;
    const msg: Downstream = { seq: this.seq, body };
    this.ring.push(msg);
    if (this.ring.length > RING_SIZE) this.ring.shift();
    const dead: Array<(m: ServerMessage) => void> = [];
    for (const send of this.senders) {
      try {
        send(msg);
      } catch {
        dead.push(send);
      }
    }
    for (const d of dead) this.senders.delete(d);
    // 状态已变（brief/画布/视频/选区变更都伴随下行事件）→ 标脏待落盘
    this.notifyDirty?.();
  }

  resync(lastSeq: number | undefined): ResyncBatch {
    if (lastSeq === undefined) return { type: "message.resync_batch", messages: [], truncated: false };
    const missed = this.ring.filter((m) => m.seq > lastSeq);
    return {
      type: "message.resync_batch",
      messages: missed,
      truncated: missed.length === 0 && this.seq - lastSeq > RING_SIZE,
    };
  }

  // ---------- 上行处理 ----------

  async handleSend(msg: MsgSend): Promise<void> {
    if (msg.clientId && this.isDuplicateClientId(msg.clientId)) return; // 幂等：滑动窗口去重
    if (msg.clientId) this.recordClientId(msg.clientId);
    if (msg.selectionRefs?.length) this.setSelection(msg.selectionRefs);
    const brain = await this.ensureBrain();
    await brain.handleUserMessage(msg);
  }

  /** 设置当前模式，变化时广播 mode.changed */
  setMode(mode: "chat" | "design"): void {
    if (this.mode !== mode) {
      this.mode = mode;
      this.emit({ type: "mode.changed", sessionId: this.sessionId, mode });
    }
  }

  /** 当前模式（工具执行时可用 self.mode 做条件分支） */
  get currentMode(): "chat" | "design" {
    return this.mode;
  }

  setSelection(refs: SelectionRef[]): void {
    this.selection = refs;
  }

  /**
   * BFF 入口（/chat）每轮透传用户 JWT（见 docs/TAI-INTEGRATION-PLAN.md §7）：
   * 为本会话建立 jwt 模式任务源，此后的生成回调（含本轮结束后的视频轮询）
   * 都携带 `Authorization`，积分计入用户账。
   *
   * 两个关键约束：
   * - 仅当网关挂的是 TAI 源时生效；mock / qianwen 联调无计费概念，静默忽略。
   * - 有 jwt 源后**绝不回退**共享源：共享源是 apiKey 模式，x-api-key 命中守卫
   *   优先判定会静默跳过扣费，会话级源的存在就是为了切断这条回退路径。
   */
  applyBffAuth(auth: { bearer: string; teamId?: string } | undefined): void {
    if (!auth || this.taskSource.name !== "tai") return;
    if (this.jwtSource && this.jwtAuth?.bearer === auth.bearer && this.jwtAuth?.teamId === auth.teamId) {
      return; // 凭证未变化（同一会话连续多轮），复用现有源
    }
    if (this.jwtSource) {
      // 同一会话记录上出现不同用户凭证：拒绝覆盖（跨租户串号防线）
      this.log(`[${this.sessionId}] 拒绝凭证切换：已有 jwt 源绑定其他用户，忽略新凭证`);
      throw new TaskSourceError(
        "该会话已绑定其他用户凭证，禁止在同一会话上切换用户（跨租户保护）",
        "auth_expired",
      );
    }
    this.jwtAuth = auth;
    this.jwtSource = this.taskSource.withUserAuth(auth.bearer, auth.teamId);
    // 持久化恢复场景：重启前挂起的视频任务等用户凭证到位后立即恢复轮询。
    // （restore() 里不自动轮询，就是为了避免无凭证时回退共享 apiKey 源 → 静默免单）
    if (this.videoEntries.size > 0) this.ensureVideoPoller();
  }

  // ---------- 持久化（见 gateway/sessionStore.ts） ----------

  /**
   * 导出可重建状态。
   * 不导出：pi 大脑上下文（重启后对话历史从空开始，属可接受降级——
   * 需求档案与资产都在，agent 仍知道"做什么"）；用户 JWT（凭证绝不落盘，
   * 恢复后由下一轮 BFF 重新注入，见 applyBffAuth）。
   */
  snapshot(): PersistedSession {
    return {
      version: 1,
      key: `${this.projectId}/${this.userId}/${this.sessionId}`,
      projectId: this.projectId,
      sessionId: this.sessionId,
      userId: this.userId,
      seq: this.seq,
      ring: [...this.ring],
      brief: this.brief,
      selection: [...this.selection],
      mode: this.mode,
      placedRects: this.placedRects.map((r) => ({ ...r })),
      pendingVideoJobs: [...this.videoEntries.values()].map((e) => ({
        job: { ...e.job },
        baseFrameAssetId: e.baseFrameAssetId,
        toolCallId: e.toolCallId,
      })),
      updatedAt: new Date().toISOString(),
    };
  }

  /** 从快照恢复（seq/ring/brief/selection/mode/画布占位/挂起的视频任务）。 */
  restore(snap: PersistedSession): void {
    this.seq = typeof snap.seq === "number" ? snap.seq : 0;
    this.ring = Array.isArray(snap.ring)
      ? snap.ring.filter((m) => m && typeof m.seq === "number")
      : [];
    this.brief = snap.brief ?? emptyBrief();
    this.selection = Array.isArray(snap.selection) ? snap.selection : [];
    this.mode = snap.mode === "design" ? "design" : "chat";
    this.placedRects = Array.isArray(snap.placedRects)
      ? snap.placedRects.map((r) => ({ ...r }))
      : [];
    for (const v of snap.pendingVideoJobs ?? []) {
      if (!v?.job?.id) continue;
      this.videoEntries.set(v.job.id, {
        job: v.job,
        baseFrameAssetId: String(v.baseFrameAssetId ?? ""),
        toolCallId: v.toolCallId ?? `tv_${v.job.id.slice(0, 8)}`,
        consecutiveErrors: 0,
      });
    }
    // 非 TAI 源（mock/qianwen）无计费风险，恢复后直接续上轮询；
    // TAI 源等下一轮 BFF 注入用户 JWT 后再续（见 applyBffAuth 末尾）。
    if (this.videoEntries.size > 0 && this.taskSource.name !== "tai") {
      this.ensureVideoPoller();
    }
  }

  /** 从选区中移除指定资产（删除卡片时使用） */
  removeSelection(assetId: string): void {
    this.selection = this.selection.filter((s) => s.assetId !== assetId);
  }

  /** 滑动窗口 clientId 去重（Map<id, timestamp>，定期清理过期条目） */
  private readonly clientIdMap = new Map<string, number>();
  private readonly CLIENT_ID_WINDOW_MS = 60_000;
  private readonly CLIENT_ID_MAX = 200;

  private isDuplicateClientId(id: string): boolean {
    this.purgeExpiredClientIds();
    return this.clientIdMap.has(id);
  }

  private recordClientId(id: string): void {
    this.purgeExpiredClientIds();
    this.clientIdMap.set(id, Date.now());
    if (this.clientIdMap.size > this.CLIENT_ID_MAX) {
      const entries = [...this.clientIdMap.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < entries.length / 2; i++) this.clientIdMap.delete(entries[i]![0]!);
    }
  }

  private purgeExpiredClientIds(): void {
    const cutoff = Date.now() - this.CLIENT_ID_WINDOW_MS;
    for (const [id, ts] of this.clientIdMap) {
      if (ts < cutoff) this.clientIdMap.delete(id);
    }
  }

  /**
   * 多候选择优（DESIGN.md §10 MVP）：标 final 时，同批兄弟中非 final 的自动转 weak；
   * 广播 canvas.update；选定卡自动成为当前选区（下一轮迭代自然以此为底）。
   */
  markCards(marks: {
    assetId: string;
    pick: "candidate" | "final" | "weak";
    rect?: { x: number; y: number; width: number };
  }[]): void {
    const updates: { assetId: string; patch: { pick: "candidate" | "final" | "weak" } }[] = [];
    for (const mark of marks) {
      const asset = this.assets.get(mark.assetId);
      if (!asset || asset.deleted) continue;
      if (mark.pick === "final" && asset.createdByJobId) {
        for (const sib of this.assets.listByJob(asset.createdByJobId)) {
          if (sib.id !== asset.id && sib.pick !== "final") {
            this.assets.patch(sib.id, { pick: "weak" });
            updates.push({ assetId: sib.id, patch: { pick: "weak" } });
          }
        }
      }
      this.assets.patch(asset.id, { pick: mark.pick });
      updates.push({ assetId: asset.id, patch: { pick: mark.pick } });
      if (mark.pick === "final" && mark.rect) {
        this.selection = [
          { assetId: asset.id, kind: asset.kind, x: mark.rect.x, y: mark.rect.y, width: mark.rect.width },
        ];
      }
    }
    if (updates.length) {
      this.emit({ type: "canvas.update", sessionId: this.sessionId, updates });
    }
  }

  /** 设计师手改档案：与 agent 的 patch 同一合并通道，广播 brief.updated */
  patchBrief(patch: DesignBriefPatch): DesignBrief {
    return this.applyBriefPatch(patch, "设计师手动修改");
  }

  steer(text: string): Promise<void> {
    return this.ensureBrain().then((b) => b.steer(text));
  }

  async interrupt(): Promise<void> {
    await (await this.ensureBrain()).interrupt();
  }

  async cancelVideo(jobId: string): Promise<void> {
    const entry = this.videoEntries.get(jobId);
    if (!entry) return;
    await this.effectiveTaskSource.cancelTask(entry.job.remoteTaskId ?? "").catch(() => undefined);
    entry.job.status = "cancelled";
    this.videoEntries.delete(jobId);
  }

  // ---------- 内部 ----------

  private applyBriefPatch(patch: DesignBriefPatch, reason: string): DesignBrief {
    this.brief = mergeBrief(this.brief, { ...patch });
    this.brief.lastReason = reason;
    this.emit({ type: "brief.updated", sessionId: this.sessionId, brief: this.brief });
    return this.brief;
  }

  private videoRegistry(): VideoJobRegistry {
    const self = this;
    return {
      register(job: GenJob) {
        const toolCallId = `tv_${job.id.slice(0, 8)}`;
        self.videoEntries.set(job.id, {
          job,
          baseFrameAssetId: String(job.params.baseFrameAssetId ?? ""),
          toolCallId,
          consecutiveErrors: 0,
        });
        // 立即推送 tool.status(running)，让前端显示进度卡
        self.emit({
          type: "tool.status",
          sessionId: self.sessionId,
          callId: toolCallId,
          name: "generate_video",
          state: "running",
          progress: { stage: job.stage ?? "submitted", percent: job.progress ?? 5 },
        });
        self.ensureVideoPoller();
      },
      get(jobId: string) {
        return self.videoEntries.get(jobId)?.job;
      },
    };
  }

  private ensureVideoPoller(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => void this.pollVideos(), VIDEO_POLL_MS);
  }

  private async pollVideos(): Promise<void> {
    if (this.videoEntries.size === 0) {
      if (this.pollTimer) clearInterval(this.pollTimer);
      this.pollTimer = undefined;
      return;
    }
    for (const [jobId, entry] of this.videoEntries) {
      if (!entry.job.remoteTaskId) continue;
      try {
        // 用 effectiveTaskSource：轮询可能发生在 BFF 本轮结束之后，
        // 仍需携带会话级 jwt 凭证（共享 apiKey 源会静默免单）
        const st = await this.effectiveTaskSource.getVideoTask(entry.job.remoteTaskId);
        const prevProgress = entry.job.progress;
        entry.job.progress = st.progress;
        entry.job.stage = st.stage;
        // 进度变化时推送 tool.status（前台进度条实时更新）
        if (st.status === "processing" && st.progress !== prevProgress) {
          this.emit({
            type: "tool.status",
            sessionId: this.sessionId,
            callId: entry.toolCallId,
            name: "generate_video",
            state: "running",
            progress: { stage: st.stage ?? "processing", percent: st.progress },
          });
          continue;
        }
        if (st.status === "processing") continue;

        if (st.status === "done" && st.url) {
          const asset = this.assets.register({
            projectId: this.projectId,
            kind: "video",
            url: st.url,
            parentIds: entry.baseFrameAssetId ? [entry.baseFrameAssetId] : [],
            operation: "video",
            meta: { ...entry.job.params },
            createdByJobId: jobId,
          });
          entry.job.status = "done";
          entry.job.resultAssetIds = [asset.id];
          // 视频卡落在首个空位（占用避让），不再硬编码 (0,0)
          const [videoPlacement] = layoutCandidates({ candidateCount: 1 }, this.placedRects);
          this.placedRects.push({ x: videoPlacement!.pos.x, y: videoPlacement!.pos.y, w: CARD_W, h: CARD_H });
          this.emit({
            type: "canvas.place",
            sessionId: this.sessionId,
            cards: [
              {
                assetId: asset.id,
                url: asset.url,
                pos: videoPlacement!.pos,
                parentIds: asset.parentIds,
                operation: "video",
                style: "final",
              },
            ],
          });
          this.emit({ type: "asset.video_completed", sessionId: this.sessionId, jobId, asset });
          // 通知前端：视频工具执行完毕，清除进度卡
          this.emit({
            type: "tool.status",
            sessionId: this.sessionId,
            callId: entry.toolCallId,
            name: "generate_video",
            state: "done",
            progress: { stage: "completed", percent: 100 },
          });
          this.videoEntries.delete(jobId);
        } else if (st.status === "failed" || st.status === "cancelled") {
          entry.job.status = st.status;
          entry.job.error = st.error;
          this.emit({
            type: "error",
            sessionId: this.sessionId,
            code: "generation_failed",
            message: `视频任务失败: ${st.error ?? st.status}`,
          });
          // 通知前端：视频工具执行失败，清除进度卡并标红
          this.emit({
            type: "tool.status",
            sessionId: this.sessionId,
            callId: entry.toolCallId,
            name: "generate_video",
            state: "error",
            progress: { stage: st.status, percent: 100 },
          });
          this.videoEntries.delete(jobId);
        } else {
          entry.job.status = st.status;
          entry.consecutiveErrors = 0; // 成功后重置
        }
      } catch (err) {
        // 鉴权/计费类错误不可恢复：立即标记失败并 emit 映射后的协议码，不浪费轮询
        if (err instanceof TaskSourceError &&
            (err.code === "auth_expired" || err.code === "insufficient_credits")) {
          const { code, message } = mapTaskSourceErrorToProtocol(err);
          entry.job.status = "failed";
          entry.job.error = message;
          this.emit({
            type: "error",
            sessionId: this.sessionId,
            code,
            message: `视频任务失败：${message}`,
          });
          this.emit({
            type: "tool.status",
            sessionId: this.sessionId,
            callId: entry.toolCallId,
            name: "generate_video",
            state: "error",
            progress: { stage: "auth_failed", percent: 100 },
          });
          this.videoEntries.delete(jobId);
          continue;
        }
        entry.consecutiveErrors++;
        this.log(`[${this.sessionId}] 视频轮询异常 (${entry.consecutiveErrors}/${MAX_POLL_ERRORS}): ${(err as Error).message}`);
        if (entry.consecutiveErrors >= MAX_POLL_ERRORS) {
          entry.job.status = "failed";
          entry.job.error = `轮询失败（连续 ${MAX_POLL_ERRORS} 次异常）`;
          this.emit({
            type: "error",
            sessionId: this.sessionId,
            code: "generation_failed",
            message: `视频任务轮询失败: ${entry.job.error}`,
          });
          this.emit({
            type: "tool.status",
            sessionId: this.sessionId,
            callId: entry.toolCallId,
            name: "generate_video",
            state: "error",
            progress: { stage: "poll_exhausted", percent: 100 },
          });
          this.videoEntries.delete(jobId);
        }
      }
    }
  }
}

export class GatewaySessions {
  private records = new Map<string, SessionRecord>();
  /** 启动时加载的快照，getOrCreate 命中时才恢复成 SessionRecord（惰性） */
  private snapshots = new Map<string, PersistedSession>();
  /** 脏会话 → debounce 落盘句柄 */
  private dirtyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private store: SessionStore | undefined;

  constructor(
    private readonly cfg: AppConfig,
    private readonly assets: AssetStore,
    private readonly taskSource: GenerationTaskSource,
    private readonly log: (line: string) => void = console.log,
  ) {}

  /**
   * 注入持久化存储并加载既有快照（进程启动时调用一次；不调用 = 纯内存模式，
   * 既有测试与本地联调均属此类，行为不变）。
   */
  async init(store: SessionStore): Promise<void> {
    this.store = store;
    if (!store.enabled) return;
    const [snaps, assets] = await Promise.all([store.loadSessions(), store.loadAssets()]);
    for (const s of snaps) {
      if (s && typeof s.key === "string") this.snapshots.set(s.key, s);
    }
    const restoredAssets = this.assets.restore(assets);
    if (snaps.length > 0 || restoredAssets > 0) {
      this.log(
        `[session] 持久化恢复：${snaps.length} 个会话、${restoredAssets} 个资产` +
          `（快照在会话被再次访问时惰性激活）`,
      );
    }
  }

  get(projectId: string, sessionId: string, userId = "anon"): SessionRecord | undefined {
    return this.records.get(this.key(projectId, userId, sessionId));
  }

  getOrCreate(projectId: string, sessionId?: string, userId = "anon"): SessionRecord {
    const id = sessionId ?? `sess_${randomUUID().slice(0, 12)}`;
    const k = this.key(projectId, userId, id);
    let rec = this.records.get(k);
    if (!rec) {
      rec = new SessionRecord(
        this.assets,
        this.taskSource,
        this.cfg,
        this.log,
        projectId,
        id,
        userId,
        () => this.markDirty(k),
      );
      const snap = this.snapshots.get(k);
      if (snap) {
        rec.restore(snap);
        this.snapshots.delete(k);
        this.log(
          `[session] 恢复 ${id} (project=${projectId}, user=${userId}, seq=${snap.seq}, 缓存事件 ${snap.ring?.length ?? 0} 条)`,
        );
      } else {
        this.log(`[session] 创建 ${id} (project=${projectId}, user=${userId})`);
      }
      this.records.set(k, rec);
    }
    return rec;
  }

  /** 会话状态变更（emit 触发）→ debounce 后落盘该会话快照 + 该项目资产表 */
  private markDirty(sessionKey: string): void {
    if (!this.store?.enabled) return;
    if (this.dirtyTimers.has(sessionKey)) return; // 已排队，合并期间的全部变更
    const timer = setTimeout(() => {
      this.dirtyTimers.delete(sessionKey);
      void this.persistSession(sessionKey);
    }, PERSIST_DEBOUNCE_MS);
    this.dirtyTimers.set(sessionKey, timer);
  }

  private async persistSession(sessionKey: string): Promise<void> {
    if (!this.store?.enabled) return;
    const rec = this.records.get(sessionKey);
    if (!rec) return;
    try {
      await this.store.saveSession(rec.snapshot());
      // 资产按项目存一份全集：会话快照之间可能互相引用对方的资产
      await this.store.saveAssets(rec.projectId, this.assets.serialize(rec.projectId));
    } catch (err) {
      this.log(`[session] 落盘失败 ${sessionKey}: ${(err as Error)?.message ?? err}`);
    }
  }

  /** 立即落盘全部活跃会话（进程退出前调用，见 index.ts 的 shutdown） */
  async persistNow(): Promise<void> {
    for (const [k, t] of this.dirtyTimers) {
      clearTimeout(t);
      this.dirtyTimers.delete(k);
    }
    await Promise.all([...this.records.keys()].map((k) => this.persistSession(k)));
  }

  async disposeAll(): Promise<void> {
    await this.persistNow().catch(() => undefined);
    for (const r of this.records.values()) await r.dispose();
    this.records.clear();
  }

  private key(projectId: string, userId: string, sessionId: string): string {
    return `${projectId}/${userId}/${sessionId}`;
  }
}
