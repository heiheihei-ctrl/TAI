'use client'

/**
 * tgagent 网关 ws 客户端 —— 对接 src/shared/protocol.ts 契约（前端侧最小拷贝，字段以服务端为基准）。
 *
 * 可靠性：自动重连 + 断线期间出站消息排队；下行按 seq 去重（断线重连后用 message.resync 补发可选，v0 未启用）。
 * 环境变量: NEXT_PUBLIC_GATEWAY_WS（默认 ws://localhost:8712/ws）、NEXT_PUBLIC_GATEWAY_HTTP（默认 http://localhost:8712）
 */

// ---------- 协议类型（与服务端 src/shared/protocol.ts 保持同步） ----------

/** 需求档案（服务端 src/shared/brief.ts DesignBrief 的前端拷贝） */
export interface Brief {
  projectType?: string
  styleKeywords: string[]
  massing?: string
  materials: string[]
  context?: string
  camera?: string
  lighting?: string
  mood?: string
  negative: string[]
  freeText: string
  completeness: 'ready' | 'needMoreInfo'
  lastReason?: string
  updatedAt: string
}

/** 随消息上传的图片附件（base64，≤3张，≤1024px） */
export interface Attachment {
  mediaType: string
  data: string
}

export interface CanvasCard {
  assetId: string
  url: string
  thumbUrl?: string
  pos: { x: number; y: number }
  parentIds: string[]
  operation: string
  style: 'candidate' | 'final' | 'weak'
  pick?: 'candidate' | 'final' | 'weak'
}

export type DownstreamBody =
  | { type: 'conversation.delta'; sessionId: string; delta: string }
  | {
      type: 'tool.status'
      sessionId: string
      callId: string
      name: string
      state: 'running' | 'done' | 'error'
      progress?: { stage: string; percent: number }
    }
  | { type: 'canvas.place'; sessionId: string; cards: CanvasCard[] }
  | { type: 'brief.updated'; sessionId: string; brief: Brief }
  | { type: 'mode.changed'; sessionId: string; mode: 'chat' | 'design' }
  | { type: 'error'; sessionId?: string; code: string; message: string }
  | { type: 'asset.video_completed'; sessionId: string; jobId: string; asset: Record<string, unknown> }
  | { type: 'presentation.ready'; sessionId: string; presentationId: string; url: string; totalPages: number }
  | { type: 'canvas.update'; sessionId: string; updates: { assetId: string; patch: Partial<Pick<CanvasCard, 'url' | 'thumbUrl' | 'pick'>> & { markedWeak?: boolean } }[] }
  | { type: 'job.accepted'; sessionId: string; job: Record<string, unknown> }

export interface ServerMessage {
  seq: number
  body: DownstreamBody
}

  export type BodyHandler = (body: DownstreamBody) => void
  export type StatusHandler = (status: 'connecting' | 'open' | 'closed') => void
  export interface ResyncBatchMsg {
    body: DownstreamBody
  }
  export type ResyncHandler = (batch: { messages: ResyncBatchMsg[]; truncated: boolean }) => void
  export type CanvasPlaceHandler = (cards: CanvasCard[]) => void

const WS_URL = process.env.NEXT_PUBLIC_GATEWAY_WS ?? 'ws://localhost:8712/ws'

/** 相对资产地址（/mock-assets/…）→ 网关 HTTP 绝对地址 */
export function assetHttpUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || /^data:/i.test(url)) return url
  const origin = (process.env.NEXT_PUBLIC_GATEWAY_HTTP ?? 'http://localhost:8712').replace(/\/$/, '')
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`
}

class GatewayClient {
  private socket: WebSocket | null = null
  private outbound: string[] = []
  private bodyHandlers = new Set<BodyHandler>()
  private statusHandlers = new Set<StatusHandler>()
  private resyncHandlers = new Set<ResyncHandler>()
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private closedByUser = false
  private canvasPlaceHandlers = new Set<CanvasPlaceHandler>()
  /** 最近收到的下行 seq（全局，用于 backward compat） */
  private _lastSeq = 0
  get lastSeq(): number { return this._lastSeq }
  /** 按 sessionId 隔离的 lastSeq（避免跨会话串味） */
  private _lastSeqBySession = new Map<string, number>()
  getLastSeq(sessionId?: string): number {
    if (!sessionId) return this._lastSeq
    return this._lastSeqBySession.get(sessionId) ?? 0
  }
  setLastSeq(sessionId: string | undefined, seq: number): void {
    this._lastSeq = Math.max(this._lastSeq, seq)
    if (sessionId) this._lastSeqBySession.set(sessionId, seq)
  }

  connect(): void {
    if (typeof window === 'undefined') return
    this.closedByUser = false
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return
    this.emitStatus('connecting')
    const socket = new WebSocket(WS_URL)
    this.socket = socket

    socket.onopen = () => {
      this.emitStatus('open')
      const queue = this.outbound.splice(0)
      for (const raw of queue) socket.send(raw)
    }
    socket.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.data)) as ServerMessage | { type: 'message.resync_batch'; messages: ServerMessage[]; truncated: boolean }
        if ('seq' in parsed) {
          const msg = parsed as ServerMessage
          const sid = ('body' in msg && msg.body && typeof msg.body === 'object' && 'sessionId' in msg.body) ? (msg.body as { sessionId?: string }).sessionId : undefined
          this.setLastSeq(sid, msg.seq)
          // 直接发射 canvas.place 事件（供撤销栈追踪，不依赖 cards diff）
          if (msg.body.type === 'canvas.place') {
            this.canvasPlaceHandlers.forEach((h) => h((msg.body as { cards: CanvasCard[] }).cards))
          }
          this.bodyHandlers.forEach((h) => h(msg.body))
        } else if (parsed.type === 'message.resync_batch') {
          // resync 补发的历史 canvas.place 不推入撤销栈（它们是旧操作）
          for (const m of parsed.messages) {
            const sid = ('body' in m && m.body && typeof m.body === 'object' && 'sessionId' in m.body) ? (m.body as { sessionId?: string }).sessionId : undefined
            this.setLastSeq(sid, m.seq)
          }
          this.resyncHandlers.forEach((h) => h({ messages: parsed.messages.map(m => ({ body: m.body })), truncated: parsed.truncated }))
        }
      } catch {
        /* 忽略非法帧 */
      }
    }
    socket.onclose = () => {
      this.socket = null
      this.emitStatus(this.closedByUser ? 'closed' : 'connecting')
      if (!this.closedByUser) this.scheduleRetry()
    }
    socket.onerror = () => socket.close()
  }

  close(): void {
    this.closedByUser = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.socket?.close()
    this.socket = null
  }

  /** 上行发送；未连上时排队，重连成功后按序补发 */
  send(msg: Record<string, unknown>): void {
    const raw = JSON.stringify(msg)
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(raw)
    else {
      this.outbound.push(raw)
      this.connect()
    }
  }

  /** 多候选择优标记 */
  markCard(projectId: string, sessionId: string | undefined, assetId: string, pick: 'candidate' | 'final' | 'weak', rect?: { x: number; y: number; width: number }): void {
    this.send({
      type: 'card.mark',
      projectId,
      ...(sessionId ? { sessionId } : {}),
      marks: [{ assetId, pick, ...(rect ? { rect } : {}) }],
    })
  }

  onBody(h: BodyHandler): () => void {
    this.bodyHandlers.add(h)
    return () => this.bodyHandlers.delete(h)
  }

  onStatus(h: StatusHandler): () => void {
    this.statusHandlers.add(h)
    h(this.socket?.readyState === WebSocket.OPEN ? 'open' : 'connecting')
    return () => this.statusHandlers.delete(h)
  }

  onResync(h: ResyncHandler): () => void {
    this.resyncHandlers.add(h)
    return () => this.resyncHandlers.delete(h)
  }

  onCanvasPlace(h: CanvasPlaceHandler): () => void {
    this.canvasPlaceHandlers.add(h)
    return () => this.canvasPlaceHandlers.delete(h)
  }

  private scheduleRetry(): void {
    if (this.retryTimer || typeof window === 'undefined') return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, 2000)
  }

  private emitStatus(s: 'connecting' | 'open' | 'closed'): void {
    this.statusHandlers.forEach((h) => h(s))
  }
}

/** 页面级单例：整个工作台共享一条网关连接 */
export const gateway = new GatewayClient()

let clientIdSeed = 0
export function newClientId(): string {
  clientIdSeed += 1
  return `fe_${Date.now().toString(36)}_${clientIdSeed}_${Math.random().toString(36).slice(2, 8)}`
}
