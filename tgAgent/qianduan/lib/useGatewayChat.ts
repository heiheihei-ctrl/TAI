'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  gateway,
  newClientId,
  assetHttpUrl,
  type Attachment,
  type Brief,
  type CanvasCard,
  type DownstreamBody,
} from './gateway'

export interface ChatEntry {
  id: number
  role: 'user' | 'assistant' | 'error'
  text: string
}

export interface ToolProgress {
  callId: string
  name: string
  state: 'running' | 'done' | 'error'
  stage?: string
  percent?: number
}

const TOOL_LABELS: Record<string, string> = {
  update_design_brief: '整理需求档案',
  generate_rendering: '生成效果图',
  generate_video: '生成视频',
  analyze_reference: '分析参考图',
}

let entrySeq = 0
const nextId = () => ++entrySeq
const LIVE_CARD_W = 300

/** 工作台 ↔ 网关会话状态 */
export function useGatewayChat(projectId = 'p_demo') {
  const [entries, setEntries] = useState<ChatEntry[]>([])
  const [cards, setCards] = useState<CanvasCard[]>([])
  const [brief, setBrief] = useState<Brief | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [progressMap, setProgressMap] = useState<Record<string, ToolProgress>>({})
  const [connection, setConnection] = useState<'connecting' | 'open' | 'closed'>('connecting')
  const [mode, setMode] = useState<'chat' | 'design'>('chat')
  const sessionIdRef = useRef<string | null>(null)
  const cardsRef = useRef(new Map<string, CanvasCard>())
  const handlersRef = useRef<(body: DownstreamBody, updateSessionId: boolean) => void>(() => {})

  // 每次渲染更新 handler 实现（引用不变，通过 .current 访问最新闭包）
  handlersRef.current = (body: DownstreamBody, updateSessionId: boolean) => {
    if (updateSessionId && (body as { sessionId?: string }).sessionId) {
      sessionIdRef.current = (body as { sessionId: string }).sessionId
    }
    switch (body.type) {
      case 'conversation.delta': {
        setEntries((list) => {
          const last = list[list.length - 1]
          if (last && last.role === 'assistant') {
            return [...list.slice(0, -1), { ...last, text: last.text + (body as { delta: string }).delta }]
          }
          return [...list, { id: nextId(), role: 'assistant', text: (body as { delta: string }).delta }]
        })
        break
      }
      case 'tool.status': {
        const callId = (body as { callId: string }).callId
        setProgressMap((m) => {
          const entry: ToolProgress = {
            callId,
            name: (body as { name: string }).name,
            state: (body as { state: ToolProgress['state'] }).state,
            stage: (body as { progress?: { stage?: string } }).progress?.stage,
            percent: (body as { progress?: { percent?: number } }).progress?.percent,
          }
          return { ...m, [callId]: entry }
        })
        break
      }
      case 'canvas.place': {
        setCards((cur) => [
          ...cur.filter((c) => !(body as { cards: CanvasCard[] }).cards.some((n) => n.assetId === c.assetId)),
          ...(body as { cards: CanvasCard[] }).cards,
        ])
        break
      }
      case 'canvas.update': {
        setCards((cur) => cur.filter((c) => {
          const updates = (body as { updates: { assetId: string; patch: { deleted?: boolean } }[] }).updates
          const del = updates.find((u) => u.assetId === c.assetId)
          if (del?.patch.deleted) return false
          return true
        }).map((c) => {
          const updates = (body as { updates: { assetId: string; patch: { pick?: 'candidate' | 'final' | 'weak' } }[] }).updates
          const update = updates.find((u) => u.assetId === c.assetId)
          if (!update) return c
          const newPick = update.patch.pick
          const newStyle = (newPick ?? c.style) as 'candidate' | 'final' | 'weak'
          return { ...c, style: newStyle, pick: newPick }
        }))
        break
      }
      case 'brief.updated': {
        setBrief((body as { brief: Brief }).brief)
        break
      }
      case 'mode.changed': {
        setMode((body as { mode: 'chat' | 'design' }).mode)
        break
      }
      case 'asset.video_completed': {
        const asset = (body as { asset?: { url?: string } }).asset
        setEntries((list) => [
          ...list,
          {
            id: nextId(),
            role: 'assistant',
            text: `\u{1F3AC} 视频已生成完成${asset?.url ? `\uff1a${asset.url}` : ''}`,
          },
        ])
        break
      }
      case 'presentation.ready': {
        const pres = body as { presentationId?: string; url?: string; totalPages?: number }
        setEntries((list) => [
          ...list,
          {
            id: nextId(),
            role: 'assistant',
            text: `\u{1F4CA} 汇报 PPT 已生成（${pres.totalPages ?? '?'} 页）${pres.url ? `：${assetHttpUrl(pres.url)}` : ''}`,
          },
        ])
        break
      }
      case 'job.accepted': {
        if ((body as { job?: { kind?: string } }).job?.kind === 'video') {
          setEntries((list) => [...list, {
            id: nextId(), role: 'assistant' as const,
            text: '\u{1F3AC} 视频任务已提交',
          }])
        }
        break
      }
      case 'error': {
        setEntries((list) => [...list, {
          id: nextId(), role: 'error' as const,
          text: `[${(body as { code: string }).code}] ${(body as { message: string }).message}`,
        }])
        break
      }
    }
  }

  useEffect(() => {
    cardsRef.current = new Map(cards.map((c) => [c.assetId, c] as const))
  }, [cards])

  useEffect(() => {
    gateway.connect()
    const offStatus = gateway.onStatus(setConnection)
    const offBody = gateway.onBody((body) => handlersRef.current(body, true))
    const offResync = gateway.onResync((batch) => {
      for (const msg of batch.messages) {
        handlersRef.current(msg.body, false) // resync 不更新 sessionIdRef
      }
    })
    return () => {
      offStatus()
      offBody()
      offResync()
    }
  }, [])

  const send = useCallback(
    (text: string, attachments?: Attachment[]) => {
      const trimmed = text.trim()
      if (!trimmed && !attachments?.length) return
      setEntries((list) => [
        ...list,
        { id: nextId(), role: 'user', text: trimmed || '（发送了参考图）' },
      ])
      setProgressMap((m) =>
        Object.fromEntries(Object.entries(m).filter(([, p]) => p.state === 'running')),
      )
      const selectionRefs = selectedIds.map((id) => {
        const card = cardsRef.current.get(id)
        return card
          ? { assetId: id, kind: 'image' as const, x: card.pos.x, y: card.pos.y, width: LIVE_CARD_W }
          : { assetId: id, kind: 'image' as const }
      })
      gateway.send({
        type: 'message.send',
        projectId,
        ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
        text: trimmed,
        clientId: newClientId(),
        ...(attachments?.length ? { attachments } : {}),
        ...(selectionRefs.length > 0 ? { selectionRefs } : {}),
        ...(gateway.getLastSeq(sessionIdRef.current ?? undefined) > 0 ? { lastSeq: gateway.getLastSeq(sessionIdRef.current ?? undefined) } : {}),
      })
    },
    [projectId, selectedIds],
  )

  const patchBrief = useCallback(
    (patch: Record<string, unknown>) => {
      gateway.send({
        type: 'brief.patch',
        projectId,
        ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
        patch,
      })
    },
    [projectId],
  )

  const markCard = useCallback(
    (assetId: string, pick: 'candidate' | 'final' | 'weak', rect?: { x: number; y: number; width: number }) => {
      gateway.markCard(projectId, sessionIdRef.current ?? undefined, assetId, pick, rect)
    },
    [projectId],
  )

  const deleteCard = useCallback(
    (assetId: string) => {
      gateway.send({
        type: 'card.delete',
        projectId,
        ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
        assetId,
      })
      setCards((cur) => cur.filter((c) => c.assetId !== assetId))
      setSelectedIds((cur) => cur.filter((id) => id !== assetId))
    },
    [projectId],
  )

  const selectCard = useCallback(
    (assetId: string) => {
      setSelectedIds((cur) => {
        const next = assetId === '' ? [] : cur.includes(assetId) ? cur.filter((id) => id !== assetId) : [...cur, assetId]
        gateway.send({
          type: 'selection.changed',
          projectId,
          selectionIds: next,
          selectionRefs: next.map((id) => {
            const card = cardsRef.current.get(id)
            return card
              ? { assetId: id, kind: 'image' as const, x: card.pos.x, y: card.pos.y, width: LIVE_CARD_W }
              : { assetId: id, kind: 'image' as const }
          }),
        })
        return next
      })
    },
    [projectId],
  )

  const toggleMode = useCallback(
    (nextMode: 'chat' | 'design') => {
      // 不乐观更新——等服务端 mode.changed 广播再切换（避免连接断开时两端状态不一致）
      gateway.send({
        type: 'mode.toggle',
        projectId,
        ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
        mode: nextMode,
      })
    },
    [projectId],
  )

  const activeProgress = Object.values(progressMap).filter((p) => p.state === 'running')

  // 定期清理已完成/失败的进度条（保留 5 秒后移除，防止长会话内存泄漏）
  useEffect(() => {
    const timestamps = new Map<string, number>()
    const timer = setInterval(() => {
      const cutoff = Date.now() - 5000
      setProgressMap((m) => {
        const next: Record<string, ToolProgress> = {}
        for (const [k, p] of Object.entries(m)) {
          if (p.state === 'running') { next[k] = p; continue }
          const ts = timestamps.get(k)
          if (ts === undefined || ts > cutoff) {
            if (ts === undefined) timestamps.set(k, Date.now())
            next[k] = p
          } else {
            timestamps.delete(k)
          }
        }
        return next
      })
    }, 5000)
    return () => clearInterval(timer)
  }, [])

  return { entries, cards, brief, selectedIds, activeProgress, connection, mode, send, selectCard, patchBrief, markCard, deleteCard, toggleMode, progressMap }
}
