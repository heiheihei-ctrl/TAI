'use client'

import { useState, useEffect, useRef } from 'react'
import { assetHttpUrl } from '@/lib/gateway'
import type { Attachment, Brief, CanvasCard } from '@/lib/gateway'
import { useGatewayChat, type ChatEntry, type ToolProgress } from '@/lib/useGatewayChat'
import { attachmentPreviewUrl, fileToAttachment } from '@/lib/attachments'
import {
  ArrowLeft, Atom, BookOpen, ChevronDown, Coins, FileText, Globe, HelpCircle,
  ImageIcon, Layers, Menu, MessageSquare, Mic, Pencil, Play, Plus, RectangleHorizontal,
  Save, Sparkles, Type, Undo2, Video, X, ZoomIn, ZoomOut
} from 'lucide-react'
import {
  LIVE_CARD_W, LIVE_CARD_H, IMAGE, houseModels, paidModels, templateGroups,
  OP_LABELS, MOTION_PRESETS, colors
} from './constants'
import { IconButton } from './fixture-components'

const FIXTURES = process.env.NEXT_PUBLIC_DEMO_FIXTURES === '1'

// ───────── Video Confirm Dialog ─────────

function VideoConfirmDialog({ cards, onConfirm, onClose }: {
  cards: CanvasCard[]
  onConfirm: (preset: string, duration: number) => void
  onClose: () => void
}) {
  const [preset, setPreset] = useState('orbit-left')
  const [duration, setDuration] = useState(10)
  const preview = cards.find(c => c.operation === 'image') ?? cards[0]
  return (
    <div className="video-confirm-backdrop" onClick={onClose}>
      <section className="video-confirm-dialog" onClick={e => e.stopPropagation()}>
        <header><strong>生成视频</strong><button className="dialog-close" onClick={onClose}><X size={16} /></button></header>
        <div className="video-confirm-body">
          {preview && (<div className="video-confirm-preview"><img src={assetHttpUrl(preview.url)} alt="首帧预览" /><small>首帧效果图</small></div>)}
          <div className="video-confirm-opts">
            <label><span>运镜模式</span><select value={preset} onChange={e => setPreset(e.target.value)}>{MOTION_PRESETS.map(m => <option key={m.id} value={m.id}>{m.label} — {m.desc}</option>)}</select></label>
            <label><span>时长</span><select value={duration} onChange={e => setDuration(Number(e.target.value))}><option value={5}>5 秒</option><option value={10}>10 秒</option><option value={15}>15 秒</option></select></label>
          </div>
        </div>
        <footer>
          <button className="dialog-cancel" onClick={onClose}>取消</button>
          <button className="dialog-confirm" onClick={() => onConfirm(preset, duration)}><Video size={16} /> 提交生成</button>
        </footer>
      </section>
    </div>
  )
}

// ───────── Card Context Menu ─────────

function CardContextMenu({ x, y, assetId, onPick, onDelete, onClose }: {
  x: number; y: number; assetId: string
  onPick: (pick: 'final' | 'weak' | 'candidate') => void
  onDelete: () => void
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => { if (menuRef.current && e.target instanceof Node && !menuRef.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])
  return (
    <div className="card-context-menu" style={{ left: x, top: y }} ref={menuRef}>
      <button onClick={() => onPick('final')} className="ctx-final">选定为方案</button>
      <button onClick={() => onPick('weak')} className="ctx-weak">弃用（弱化）</button>
      <button onClick={() => onPick('candidate')} className="ctx-candidate">恢复候选</button>
      <div className="ctx-separator" />
      <button onClick={() => { onDelete(); onClose() }} className="ctx-delete">从画布移除</button>
    </div>
  )
}

// ───────── Live Card ─────────

function LiveCard({ card, selected, onSelect, onContextMenu, className }: {
  card: CanvasCard; selected: boolean
  onSelect: () => void
  onContextMenu: (e: React.MouseEvent, assetId: string) => void
  className?: string
}) {
  const isVideo = card.operation === 'video'
  const weak = card.style === 'weak' || card.pick === 'weak'
  const isFinal = card.style === 'final' || card.pick === 'final'
  return (
    <section
      className={`live-card${selected ? ' is-selected' : ''}${weak ? ' is-weak' : ''}${isFinal ? ' is-final' : ''}${className ? ` ${className}` : ''}`}
      style={{ left: card.pos.x, top: card.pos.y }}
      onPointerDown={e => e.stopPropagation()}
      onClick={onSelect}
      onContextMenu={e => { e.preventDefault(); onContextMenu(e, card.assetId) }}
      title={isVideo ? '点击播放视频' : '点击设为选区，右键更多操作'}
    >
      <div className="live-card-head"><span>{OP_LABELS[card.operation] ?? card.operation}</span><i className={`style-dot ${card.style}`} />{isVideo && <span className="video-badge">VIDEO</span>}</div>
      {isVideo ? (<div className="video-wrapper"><video src={assetHttpUrl(card.url)} controls preload="metadata" /></div>) : (<img src={assetHttpUrl(card.url)} alt="生成的效果图" />)}
      {card.parentIds.length > 0 && <small>继承 {card.parentIds.length} 个父版本</small>}
    </section>
  )
}

// ───────── Brief Panel ─────────

function BriefPanel({ brief, onPatch }: { brief: Brief; onPatch: (patch: Record<string, unknown>) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})

  const startEdit = () => {
    setDraft({
      projectType: brief.projectType ?? '', massing: brief.massing ?? '',
      context: brief.context ?? '', camera: brief.camera ?? '',
      lighting: brief.lighting ?? '', mood: brief.mood ?? '',
      styleKeywords: [...brief.styleKeywords], materials: [...brief.materials],
      negative: [...brief.negative], freeText: brief.freeText,
      completeness: brief.completeness,
    })
    setEditing(true)
  }

  const commit = () => {
    const patch: Record<string, unknown> = {}
    if (String(draft.projectType ?? '').trim() !== (brief.projectType ?? '')) patch.projectType = String(draft.projectType).trim() || undefined
    if (String(draft.massing ?? '').trim() !== (brief.massing ?? '')) patch.massing = String(draft.massing).trim() || undefined
    if (String(draft.context ?? '').trim() !== (brief.context ?? '')) patch.context = String(draft.context).trim() || undefined
    if (String(draft.camera ?? '').trim() !== (brief.camera ?? '')) patch.camera = String(draft.camera).trim() || undefined
    if (String(draft.lighting ?? '').trim() !== (brief.lighting ?? '')) patch.lighting = String(draft.lighting).trim() || undefined
    if (String(draft.mood ?? '').trim() !== (brief.mood ?? '')) patch.mood = String(draft.mood).trim() || undefined
    if (String(draft.freeText ?? '').trim() !== (brief.freeText ?? '')) patch.freeText = String(draft.freeText).trim()
    const sk = Array.isArray(draft.styleKeywords) ? draft.styleKeywords : brief.styleKeywords
    if (sk.join('|') !== brief.styleKeywords.join('|')) patch.styleKeywords = sk
    const mt = Array.isArray(draft.materials) ? draft.materials : brief.materials
    if (mt.join('|') !== brief.materials.join('|')) patch.materials = mt
    const ng = Array.isArray(draft.negative) ? draft.negative : brief.negative
    if (ng.join('|') !== brief.negative.join('|')) patch.negative = ng
    if (Object.keys(patch).length > 0) onPatch(patch)
    setEditing(false)
  }

  const updateDraft = (key: string, value: unknown) => setDraft(d => ({ ...d, [key]: value }))
  const addTag = (key: 'styleKeywords' | 'materials' | 'negative') => { const val = window.prompt('添加条目：'); if (!val) return; const cur = (draft[key] as string[]) ?? (brief[key] as string[]); updateDraft(key, [...cur, val]) }
  const removeTag = (key: 'styleKeywords' | 'materials' | 'negative', idx: number) => { const cur = (draft[key] as string[]) ?? (brief[key] as string[]); updateDraft(key, cur.filter((_, i) => i !== idx)) }

  const scalarFields: [string, string, string?][] = [
    ['projectType', '项目类型', '住宅/办公/文化/商业'], ['massing', '体量', '几层/密度/尺度'],
    ['context', '环境', '滨海/山地/街区'], ['camera', '视角', '人视/鸟瞰/室内'],
    ['lighting', '光照', '黄昏/清晨/夜景'], ['mood', '氛围', '极简/未来感/在地'],
  ]
  const listFields: [keyof Brief, string][] = [['styleKeywords', '风格'], ['materials', '材质'], ['negative', '排除']]

  return (
    <section className="brief-panel" aria-label="设计需求档案">
      <header><Layers /> 需求档案<em className={brief.completeness}>{brief.completeness === 'ready' ? '可出图' : '待补充'}</em>{editing ? <button className="brief-edit-btn" onMouseDown={e => e.preventDefault()} onClick={commit} title="保存修改">保存</button> : <button className="brief-edit-btn" onClick={startEdit} title="编辑档案"><Pencil size={14} /></button>}</header>
      {editing ? (
        <div className="brief-edit-form">
          {scalarFields.map(([key, label, placeholder]) => (<label key={key}><span>{label}</span><input value={String(draft[key] ?? '')} placeholder={placeholder} onChange={e => updateDraft(key, e.target.value)} onBlur={commit} /></label>))}
          <div className="brief-completeness-row"><span>完备度</span><button className={`brief-comp-btn ${draft.completeness === 'ready' ? 'is-ready' : 'is-pending'}`} onClick={() => updateDraft('completeness', 'ready')}>可出图</button><button className="brief-comp-btn" onClick={() => updateDraft('completeness', 'needMoreInfo')}>待补充</button></div>
          <label><span>补充说明</span><textarea value={String(draft.freeText ?? '')} placeholder="自由补充…" rows={2} onChange={e => updateDraft('freeText', e.target.value)} onBlur={commit} /></label>
          {listFields.map(([key, label]) => (<div key={key} className="brief-tag-edit"><span>{label}</span><div className="brief-tags">{(draft[key] as string[] ?? []).map((v, i) => (<span key={i} className="brief-tag is-editable">{v}<button onClick={() => removeTag(key as 'styleKeywords' | 'materials', i)}><X size={12} /></button></span>))}<button className="brief-tag-add" onClick={() => addTag(key as 'styleKeywords' | 'materials')}>+</button></div></div>))}
        </div>
      ) : (
        <dl className="brief-rows">
          {scalarFields.map(([k, label]) => (brief as unknown as Record<string, string | string[]>)[k] ? <div key={k}><dt>{label}</dt><dd>{String((brief as unknown as Record<string, string | string[]>)[k])}</dd></div> : null)}
          {listFields.map(([k, label]) => (brief[k] as string[]).length > 0 ? <div key={k}><dt>{label}</dt><dd className="brief-chips">{(brief[k] as string[]).map(v => <span key={v}>{v}</span>)}</dd></div> : null)}
        </dl>
      )}
    </section>
  )
}

// ───────── Chat Panel ─────────

function ChatPanel({ entries, progress, connection }: {
  entries: ChatEntry[]; progress: ToolProgress[]; connection: 'connecting' | 'open' | 'closed'
}) {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [entries, progress])
  return (
    <aside className="chat-panel" aria-label="AI 对话面板">
      <header><MessageSquare /> <strong>AI 设计合伙人</strong><span className={`conn-dot ${connection}`}>{connection === 'open' ? '已连接' : connection === 'connecting' ? '连接中…' : '已断开'}</span></header>
      {progress.map((p) => (<div key={p.callId} className="progress-row"><span>{p.name}</span><div className="progress-bar"><i style={{ width: `${p.percent ?? 8}%` }} /></div><small>{p.stage ?? ''}</small></div>))}
      <div className="chat-entries" ref={listRef}>
        {entries.length === 0 && <div className="chat-empty">描述你的建筑需求开始对话，例如："我想做一个西湖边的美术馆"</div>}
        {entries.map((e) => <div key={e.id} className={`chat-entry ${e.role}`}>{e.text}</div>)}
      </div>
      <div className="chat-hint">点击画布卡片设为选区，再说"把这张改成…"即可迭代；带图提问用 ＋ 上传参考图</div>
    </aside>
  )
}

// ───────── Live Composer ─────────

function LiveComposer({ onSend, connection, hasSelection, onVideoDialog }: {
  onSend: (text: string, attachments: Attachment[]) => void
  connection: 'connecting' | 'open' | 'closed'
  hasSelection: boolean
  onVideoDialog: () => void
}) {
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const attach = (file: File) => { fileToAttachment(file).then((a) => setAttachments(cur => (cur.length >= 3 ? cur : [...cur, a]))).catch(() => undefined) }
  const doSend = () => { if (!draft.trim() && attachments.length === 0) return; onSend(draft, attachments); setDraft(''); setAttachments([]) }
  const doVideo = () => { if (!hasSelection) return; onVideoDialog() }
  return (
    <section className="ai-composer" onPointerDown={e => e.stopPropagation()} aria-label="AI 对话生成">
      <textarea placeholder="描述需求或对选中的图提修改意见，例如：滨江办公楼黄昏人视效果图" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend() } }} />
      {attachments.length > 0 && (<div className="attach-row">{attachments.map((a, i) => (<span key={i} className="attach-chip"><img src={attachmentPreviewUrl(a)} alt={`参考图 ${i + 1}`} /><button aria-label="移除参考图" onClick={() => setAttachments(cur => cur.filter((_, j) => j !== i))}><X /></button></span>))}</div>)}
      <footer className="composer-bar">
        <button className="bar-icon plus" aria-label="上传参考图" onClick={() => fileRef.current?.click()}><Plus /></button>
        <span className="composer-status">{connection === 'connecting' ? '连接中…' : connection === 'closed' ? '未连接' : ''}</span>
        <span className="bar-gap" />
        {hasSelection && (<button className="bar-icon bar-video" aria-label="将选中效果图转为视频" onClick={doVideo} title="选中图片 → 生成视频"><Video size={18} /></button>)}
        <button className="bar-send" aria-label="发送" onClick={doSend}><Play /></button>
      </footer>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden-input" onChange={e => { for (const f of e.target.files ?? []) attach(f); e.target.value = '' }} />
    </section>
  )
}

// ───────── AiComposer (fixtures mode) ─────────

function AiComposer({ value, onChange, onSend, onUpload, onOtherModels }: {
  value: string; onChange: (v: string) => void; onSend: () => void
  onUpload: (kind: 'image' | 'pdf') => void; onOtherModels: () => void
}) {
  const [tab, setTab] = useState<'house' | 'paid'>('house')
  const [model, setModel] = useState(houseModels[2])
  const [variant, setVariant] = useState('Kling 3.0-Omni')
  const [panel, setPanel] = useState<'' | 'model' | 'plus' | 'template' | 'ratio' | 'size' | 'think'>('')
  const [size, setSize] = useState('自动'), [ratio, setRatio] = useState('自动'), [think, setThink] = useState('自动')
  const [group, setGroup] = useState('all')
  const [template, setTemplate] = useState(value)
  useEffect(() => { setTemplate(value) }, [value])
  const list = tab === 'house' ? houseModels : paidModels
  const toggle = (next: typeof panel) => setPanel(p => p === next ? '' : next)
  const pick = (item: typeof houseModels[number] & { variants?: string[] }) => { if (item.id === 'other') { setPanel(''); onOtherModels(); return } setModel(item); if (!item.variants) setPanel('') }
  const label = model.id === 'kling' ? variant : model.name
  return <section className="ai-composer" onPointerDown={e => e.stopPropagation()} aria-label="AI 对话生成">
    <textarea placeholder="输入任何内容，AI会智能判断是生图、对话或视频…" value={template} onChange={e => { setTemplate(e.target.value); onChange(e.target.value) }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }} />
    {panel === 'plus' && <div className="composer-pop plus-pop"><button onClick={() => { onUpload('image'); setPanel('') }}><ImageIcon />上传图片</button><button onClick={() => { onUpload('pdf'); setPanel('') }}><FileText />上传 PDF</button></div>}
    {panel === 'model' && <div className="composer-pop model-pop"><div className="pop-tabs"><button className={tab === 'house' ? 'is-on' : ''} onClick={() => setTab('house')}>常用模型</button><button className={tab === 'paid' ? 'is-on' : ''} onClick={() => setTab('paid')}>其它模型<HelpCircle /><i className="dot" /></button></div>
      {list.map(item => <div key={item.id} className="pop-row"><button className={`pop-item ${model.id === item.id ? 'is-on' : ''}`} onClick={() => pick(item)}><Sparkles />{item.name}{'tag' in item && item.tag && <em>new</em>}{item.kind && <small title={item.kind === 'video' ? '生成视频' : '生成图像'}>{item.kind === 'video' ? <Video /> : <ImageIcon />}</small>}</button>{'variants' in item && item.variants && model.id === item.id && <div className="pop-variants">{item.variants.map(v => <button key={v} className={variant === v ? 'is-on' : ''} onClick={() => { setVariant(v); setPanel('') }}>{v}</button>)}</div>}</div>)}
    </div>}
    {panel === 'ratio' && <div className="composer-pop pill-pop ratio-pop">{['自动', '1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'].map(r => <button key={r} className={ratio === r ? 'is-on' : ''} onClick={() => { setRatio(r); setPanel('') }}>{r}</button>)}</div>}
    {panel === 'size' && <div className="composer-pop pill-pop size-pop">{['自动', '1K', '2K'].map(s => <button key={s} className={size === s ? 'is-on' : ''} onClick={() => { setSize(s); setPanel('') }}>{s}</button>)}</div>}
    {panel === 'think' && <div className="composer-pop pill-pop think-pop">{['自动', '高', '低'].map(t => <button key={t} className={think === t ? 'is-on' : ''} onClick={() => { setThink(t); setPanel('') }}>{t}</button>)}</div>}
    {panel === 'template' && <div className="composer-pop template-pop"><nav className="template-rail">{templateGroups.map(g => <button key={g.id} className={group === g.id ? 'is-on' : ''} onClick={() => setGroup(g.id)}>{g.name}</button>)}<button className="template-more">进入公共模板</button></nav><div className="template-grid">{(templateGroups.find(g => g.id === group) || templateGroups[0]).items.map(t => <button key={t} className={template === t ? 'is-on' : ''} onClick={() => { setTemplate(t); setPanel('') }}>{t}</button>)}</div></div>}
    <footer className="composer-bar">
      <button className={`bar-icon plus ${panel === 'plus' ? 'is-open' : ''}`} aria-label="上传图片或 PDF" onClick={() => toggle('plus')}><Plus /></button>
      <button className={`bar-chip ${panel === 'model' ? 'is-open' : ''}`} onClick={() => toggle('model')}>{label}<ChevronDown /></button>
      <button className={`bar-icon ${panel === 'ratio' ? 'is-open' : ''}`} aria-label="画幅比例" onClick={() => toggle('ratio')}><RectangleHorizontal /></button>
      <button className={`bar-icon ${panel === 'size' ? 'is-open' : ''}`} aria-label="分辨率" onClick={() => toggle('size')}>HD</button>
      <button className={`bar-icon ${panel === 'think' ? 'is-open' : ''}`} aria-label="思考模式" onClick={() => toggle('think')}><Atom /></button>
      <button className="bar-icon" aria-label="联网参考"><Globe /></button>
      <button className={`bar-icon ${panel === 'template' ? 'is-open' : ''}`} aria-label="提示词模板" onClick={() => toggle('template')}><BookOpen /></button>
      <span className="bar-gap" /><span className="composer-credit"><Coins />{30 * (model.cost || 1)}积分</span>
      <button className="bar-icon" aria-label="语音输入"><Mic /></button>
      <button className="bar-send" aria-label="发送生成"><Play /></button>
    </footer>
  </section>
}

export { VideoConfirmDialog, CardContextMenu, LiveCard, BriefPanel, ChatPanel, LiveComposer, AiComposer }
