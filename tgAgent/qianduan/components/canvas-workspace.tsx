'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, ImageIcon, Plus, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useGatewayChat } from '@/lib/useGatewayChat'
import { gateway } from '@/lib/gateway'
import type { CanvasCard } from '@/lib/gateway'
import {
  Header, MainTools, IconButton,
  DrawLayer, ImageNode, AnalysisNode, GeneratedImageNode, ModelNode, ImageEditor,
} from './workspace/fixture-components'
import {
  LiveCard, BriefPanel, ChatPanel, LiveComposer,
  VideoConfirmDialog, CardContextMenu, AiComposer,
} from './workspace/live-components'
import {
  drawTools, models, colors, houseModels, paidModels, templateGroups,
  LIVE_CARD_W, LIVE_CARD_H, OP_LABELS, MOTION_PRESETS
} from './workspace/constants'
import type { Mark, Node } from './workspace/types'

const FIXTURES = process.env.NEXT_PUBLIC_DEMO_FIXTURES === '1'

export default function CanvasWorkspace() {
  const [tool, setTool] = useState('select')
  const [color, setColor] = useState(colors[0])
  const [fill, setFill] = useState(true)
  const [editor, setEditor] = useState<{ open: boolean; editing: boolean }>({ open: false, editing: false })
  const [uploadOpen, setUploadOpen] = useState<false | 'image' | 'pdf'>(false)
  const [chatOpen, setChatOpen] = useState(true)
  const [edited, setEdited] = useState(false)
  const [savedMarks, setSavedMarks] = useState<Mark[]>([])
  const [marks, setMarks] = useState<Mark[]>([])
  const [nodes, setNodes] = useState<Node[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; assetId: string } | null>(null)
  const [videoDialog, setVideoDialog] = useState(false)
  const [fixTemplate, setFixTemplate] = useState('') // FIXTURES 保留
  const canvasUndo = useRef<Array<{ type: 'place'; cards: CanvasCard[] }>>([])
  const nodeIdRef = useRef(1)

  const chat = useGatewayChat()
  const canvasRef = useRef<HTMLDivElement>(null)
  const cardById = useMemo(() => new Map(chat.cards.map((c) => [c.assetId, c] as const)), [chat.cards])

  const mode = chat.mode
  const toggleMode = useCallback((nextMode: 'chat' | 'design') => {
    chat.toggleMode(nextMode)
  }, [chat])

  const dragCleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => () => { dragCleanupRef.current?.() }, [])

  const portDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    setDrag({ x: e.clientX, y: e.clientY })
    const move = (p: PointerEvent) => setDrag({ x: p.clientX, y: p.clientY })
    const cleanup = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); dragCleanupRef.current = null }
    const up = (p: PointerEvent) => { cleanup(); setDrag(null); setMenu({ x: p.clientX, y: p.clientY }) }
    dragCleanupRef.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const { selectedIds, deleteCard, selectCard } = chat

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0 && document.activeElement === document.body) { e.preventDefault(); for (const id of selectedIds) deleteCard(id); selectCard('') }
      if (e.key === 'Escape') { setCtxMenu(null); setMenu(null); setVideoDialog(false) }
      // Ctrl+Z 撤销最近一次 canvas.place
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && canvasUndo.current.length > 0 && document.activeElement === document.body) {
        e.preventDefault()
        const op = canvasUndo.current.pop()!
        for (const c of op.cards) deleteCard(c.assetId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, deleteCard, selectCard])

  // canvas.place 进入动画：新卡片短暂高亮
  const [newlyPlacedState, setNewlyPlacedState] = useState<Set<string>>(new Set())
  const placeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 直接消费 gateway 的 canvas.place 事件（不依赖 cards diff，避免 resync 串味）
  useEffect(() => {
    const off = gateway.onCanvasPlace((cards) => {
      // 推入撤销栈
      canvasUndo.current.push({ type: 'place', cards })
      if (canvasUndo.current.length > 50) canvasUndo.current.shift()
      // 触发进入动画
      const ids = new Set(cards.map((c) => c.assetId))
      setNewlyPlacedState(ids)
      if (placeTimerRef.current) clearTimeout(placeTimerRef.current)
      placeTimerRef.current = setTimeout(() => {
        setNewlyPlacedState(new Set())
        placeTimerRef.current = null
      }, 600)
    })
    return () => {
      off()
      if (placeTimerRef.current) clearTimeout(placeTimerRef.current)
    }
  }, [])

  const addNode = (type: string) => { if (!menu) return; const r = canvasRef.current!.getBoundingClientRect(); setNodes(n => [...n, { id: nodeIdRef.current++, type, x: menu.x - r.left, y: menu.y - r.top }]); setMenu(null) }
  const setCanvasFill = (next: boolean) => { setFill(next) }

  return (
    <main className="workspace" ref={canvasRef} onPointerDown={() => menu && setMenu(null)}>
      <Header />
      <MainTools tool={tool} setTool={setTool} setColor={setColor} fill={fill} setFill={setCanvasFill} chatOpen={chatOpen} onToggleChat={() => setChatOpen(v => !v)} mode={mode} onToggleMode={() => toggleMode(mode === 'chat' ? 'design' : 'chat')} />
      {FIXTURES && (
        <>
          <svg className="connections"><path d="M488 379 C560 379 585 316 655 316" />{drag && <path className="temp-line" d={`M488 379 C600 379 ${drag.x - 70} ${drag.y} ${drag.x} ${drag.y}`} />}</svg>
          <div className="canvas-mark-layer"><DrawLayer tool={tool} color={color} fill={fill} marks={marks} setMarks={setMarks} /></div>
          <ImageNode edited={edited} savedMarks={savedMarks} onEdit={() => setEditor({ open: true, editing: false })} onUpload={() => setUploadOpen('image')} onPortDown={portDown} />
          <AnalysisNode />
          <GeneratedImageNode savedMarks={savedMarks} onPreview={() => setEditor({ open: true, editing: false })} onEdit={() => setEditor({ open: true, editing: false })} />
          {nodes.map(n => <ModelNode key={n.id} node={n} />)}
          {menu && <div className="node-menu" style={{ left: menu.x, top: menu.y }} onPointerDown={e => e.stopPropagation()}><strong>可连接节点</strong><small>选择后自动创建并连接</small>{models.map(m => <button key={m} onClick={() => addNode(m)}><span>{m === 'Analysis' ? '分析' : '模型'}</span>{m}<Plus /></button>)}</div>}
        </>
      )}
      {/* live：Brief 侧边栏 */}
      {!FIXTURES && chat.brief && (<aside className="brief-sidebar" aria-label="设计需求档案"><BriefPanel brief={chat.brief} onPatch={chat.patchBrief} /></aside>)}
      {/* live：主画布区 */}
      <section className="canvas-area">
        {/* live：版本血缘连线 */}
        <svg className="connections live-connections">
          {chat.cards.flatMap((card) => card.parentIds.map((pid) => {
            const p = cardById.get(pid)
            if (!p) return null
            const x1 = p.pos.x + LIVE_CARD_W, y1 = p.pos.y + LIVE_CARD_H / 2, x2 = card.pos.x, y2 = card.pos.y + LIVE_CARD_H / 2
            return <path key={`${pid}>${card.assetId}`} d={`M ${x1} ${y1} C ${x1 + 50} ${y1} ${x2 - 50} ${y2} ${x2} ${y2}`} />
          }))}
        </svg>
        {/* live：生成卡片 */}
        {chat.cards.map((card) => (<LiveCard key={card.assetId} card={card} selected={chat.selectedIds.includes(card.assetId)} onSelect={() => chat.selectCard(card.assetId)} onContextMenu={(e, id) => setCtxMenu({ x: e.clientX, y: e.clientY, assetId: id })} className={newlyPlacedState.has(card.assetId) ? 'card-enter' : ''} />))}
        {/* 视频确认弹窗 */}
        {videoDialog && (<VideoConfirmDialog cards={chat.selectedIds.map(id => cardById.get(id)!).filter(Boolean)} onConfirm={(preset, duration) => { setVideoDialog(false); const sel = chat.selectedIds[0]; if (sel) chat.send(`生成视频 运镜: ${preset} 时长: ${duration}s 首帧: ${sel}`, []) }} onClose={() => setVideoDialog(false)} />)}
        {/* AI 输入面板 */}
        {FIXTURES ? <AiComposer value={fixTemplate} onChange={setFixTemplate} onSend={() => undefined} onUpload={kind => setUploadOpen(kind)} onOtherModels={() => setMenu({ x: window.innerWidth / 2 - 130, y: window.innerHeight / 2 })} /> : <LiveComposer onSend={chat.send} connection={chat.connection} hasSelection={chat.selectedIds.length > 0} onVideoDialog={() => setVideoDialog(true)} />}
        {/* 对话面板 */}
        {!FIXTURES && chatOpen && <ChatPanel entries={chat.entries} progress={chat.activeProgress} connection={chat.connection} />}
      </section>
      <div className="zoom-controls"><IconButton label="放大"><ZoomIn /></IconButton><span>100%</span><IconButton label="缩小"><ZoomOut /></IconButton></div>
      {FIXTURES && <div className="minimap"><div /><span /><i /></div>}
      {FIXTURES && uploadOpen && <div className="upload-backdrop" role="dialog" aria-modal="true" aria-label="上传文件"><section className="upload-dialog"><button className="dialog-close" aria-label="关闭上传" onClick={() => setUploadOpen(false)}><X /></button>{uploadOpen === 'pdf' ? <FileText /> : <ImageIcon />}<strong>{uploadOpen === 'pdf' ? '上传 PDF 文件' : '上传或替换图片'}</strong><p>{uploadOpen === 'pdf' ? '拖放方案文本或图册 PDF 到这里，或从设备中选择' : '拖放建筑参考图到这里，或从设备中选择文件'}</p><label className="upload-button">{uploadOpen === 'pdf' ? '选择 PDF' : '选择图片'}<input type="file" accept={uploadOpen === 'pdf' ? 'application/pdf' : 'image/*'} onChange={() => setUploadOpen(false)} /></label></section></div>}
      {FIXTURES && editor.open && <ImageEditor initialEditing={editor.editing} initialMarks={savedMarks} onClose={() => setEditor({ open: false, editing: false })} onSave={(nextMarks) => { setSavedMarks(nextMarks); setEdited(true); setEditor({ open: false, editing: false }) }} />}
      {/* live：卡片右键菜单 */}
      {ctxMenu && (<CardContextMenu x={ctxMenu.x} y={ctxMenu.y} assetId={ctxMenu.assetId} onPick={(pick) => { const card = chat.cards.find((c) => c.assetId === ctxMenu.assetId); chat.markCard(ctxMenu.assetId, pick, card ? { x: card.pos.x, y: card.pos.y, width: LIVE_CARD_W } : undefined); setCtxMenu(null) }} onDelete={() => chat.deleteCard(ctxMenu.assetId)} onClose={() => setCtxMenu(null)} />)}
    </main>
  )
}
