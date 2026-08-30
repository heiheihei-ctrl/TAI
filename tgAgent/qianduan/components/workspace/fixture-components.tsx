'use client'

import { useRef, useState } from 'react'
import type { Mark } from './types'
import { colors, drawTools, editorTools, IMAGE } from './constants'
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, Circle, Eraser, FileText, Folder, Globe, HelpCircle, ImageIcon, LassoSelect, Layers, LineChart, Menu, MessageSquare, Mic, MousePointer2, Pencil, Plus, RectangleHorizontal, Redo2, Save, Scan, Sparkles, Atom, Video, Coins, Play, Square, Trash2, Type, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'

export type { Mark } from './types'

function IconButton({ label, active, onClick, children, className }: { label: string; active?: boolean; onClick?: () => void; children: React.ReactNode; className?: string }) {
  return <button title={label} aria-label={label} onClick={onClick} className={`tool-button${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}>{children}</button>
}

function MainTools({ tool, setTool, setColor, fill, setFill, chatOpen, onToggleChat, mode, onToggleMode }: { tool: string; setTool: (v: string) => void; setColor: (v: string) => void; fill: boolean; setFill: (v: boolean) => void; chatOpen: boolean; onToggleChat: () => void; mode: 'chat' | 'design'; onToggleMode: () => void }) {
  const [drawOpen, setDrawOpen] = useState(false)
  const main: { id: string; label: string; icon: typeof Sparkles; action?: () => void }[] = [
    { id: 'chat', label: mode === 'design' ? '设计模式' : 'AI 对话', icon: mode === 'design' ? Pencil : Sparkles, action: () => { onToggleChat(); setDrawOpen(false) } },
    { id: 'mode', label: '模式切换', icon: mode === 'design' ? Sparkles : Pencil, action: onToggleMode },
    { id: 'select', label: '框选', icon: Scan }, { id: 'add', label: '添加节点', icon: Plus },
    { id: 'draw', label: '绘图工具', icon: Pencil, action: () => setDrawOpen(v => !v) }, { id: 'eraser', label: '橡皮', icon: Eraser },
    { id: 'text', label: '文字', icon: Type }, { id: 'comment', label: '评论', icon: MessageSquare }, { id: 'layers', label: '图层', icon: Layers },
    { id: 'file', label: '文件', icon: Folder }, { id: 'help', label: '帮助', icon: HelpCircle },
  ]
  return (
    <>
      <aside className="main-tools">{main.map((item) => {
        const isActive = item.id === 'chat' ? chatOpen : item.id === 'draw' ? drawOpen : item.id === 'mode' ? mode === 'design' : false
        return <IconButton key={item.id} label={item.label} active={isActive} onClick={item.action} className={item.id === 'mode' && mode === 'design' ? 'is-mode-active' : undefined}><item.icon /></IconButton>
      })}</aside>
      {drawOpen && <aside className="draw-popover">
        <IconButton label={mode === 'design' ? '回到对话' : '切到设计'} active={false} onClick={onToggleMode}><Pencil /></IconButton>
        <div className="tool-separator" />
        {drawTools.map(t => <IconButton key={t.id} label={t.label} active={tool === t.id} onClick={() => setTool(t.id)}><t.icon /></IconButton>)}
        {['lasso', 'rect', 'circle'].includes(tool) && <button className={`fill-toggle ${fill ? 'is-on' : ''}`} aria-pressed={fill} onClick={() => setFill(!fill)}>{fill ? '填充' : '不填充'}</button>}
        <div className="tool-separator" /><span>画笔</span><IconButton label="笔刷"><Pencil /></IconButton>
        <div className="tool-separator" /><span>线条</span><label className="color-label"><input aria-label="线条与填充颜色" type="color" defaultValue="#ff4d55" onChange={e => setColor(e.target.value)} /></label>
      </aside>}
    </>
  )
}

function AnalysisNode() {
  const [mode, setMode] = useState<'idle' | 'result' | 'edit'>('result')
  const [text, setText] = useState('画面呈现温暖自然的室内空间。落地窗引入柔和日光，木质窗台与织物形成舒适、宁静的建筑氛围。建议强化窗框材质与室内外景观关系。')
  const [draft, setDraft] = useState(text)
  return <section className="node analysis-node">
    <div className="node-head"><strong>Analysis</strong><span className="badge">Ultra</span><button onClick={() => setMode('result')}>运行分析</button></div>
    <label>分析指令</label><textarea defaultValue="从空间、材质、光影和建筑氛围分析图片" />
    <label>分析结果</label>
    {mode === 'edit' ? <textarea className="analysis-result editing" value={draft} onChange={e => setDraft(e.target.value)} /> : <button className="analysis-result" onClick={() => { setDraft(text); setMode('edit') }}>{mode === 'idle' ? '等待分析…' : text}<span>点击直接编辑</span></button>}
    {mode === 'edit' && <div className="node-actions"><button onClick={() => setMode('result')}>取消</button><button className="primary" onClick={() => { setText(draft); setMode('result') }}>确认结果</button></div>}
    <i className="port left" /><i className="port right green" />
  </section>
}

function ModelNode({ node }: { node: { id: number; type: string; x: number; y: number } }) {
  return <section className="node model-node" style={{ left: node.x, top: node.y }}>
    <div className="node-head"><strong>{node.type}</strong><span className="badge">Ultra</span><button>运行</button></div>
    <label>提示词</label><textarea placeholder="描述建筑空间、材质和氛围…" />
    <div className="model-preview"><ImageIcon /><span>{node.type === 'Seedance' ? '图生视频' : '图像生成'}</span></div>
    <i className="port left" /><i className="port right green" />
  </section>
}

function ImageNode({ edited, savedMarks, onEdit, onUpload, onPortDown }: { edited: boolean; savedMarks: Mark[]; onEdit: () => void; onUpload: () => void; onPortDown: (e: React.PointerEvent) => void }) {
  return <section className="node image-node">
    <div className="node-head"><strong>Image</strong>{edited && <span className="badge blue">已编辑副本</span>}<div><IconButton label="编辑图片" onClick={onEdit}><Pencil /></IconButton></div></div>
    <button className="image-preview" onDoubleClick={onUpload} title="双击上传或替换图片"><img src={IMAGE} alt="上传的窗边猫咪建筑空间参考图" />{savedMarks.length > 0 && <DrawLayer tool="select" color={colors[0]} fill={false} marks={savedMarks} setMarks={() => {}} compact readonly />}</button>
    <p>双击上传/替换 · 右上角编辑</p>
    <i className="port left" /><button aria-label="拖拽创建下游节点" className="port right output-port" onPointerDown={onPortDown} />
  </section>
}

function GeneratedImageNode({ savedMarks, onPreview, onEdit }: { savedMarks: Mark[]; onPreview: () => void; onEdit: () => void }) {
  return <section className="node generated-image-node">
    <div className="node-head"><strong>GPT-Image-2</strong><span className="badge">Ultra</span><button>运行</button><IconButton label="编辑生成图片" onClick={onEdit}><Pencil /></IconButton></div>
    <label>预设提示词</label><input className="node-input" placeholder="生成时自动拼接在提示词前" />
    <div className="node-options"><span>宽高比 <b>16:9</b></span><span>分辨率 <b>1K</b></span></div>
    <button className="image-preview generated-preview" onDoubleClick={onPreview} title="双击预览生成图片"><img src={IMAGE} alt="GPT-Image-2 生成的建筑空间图片" />{savedMarks.length > 0 && <DrawLayer tool="select" color={colors[0]} fill={false} marks={savedMarks} setMarks={() => {}} compact readonly />}</button>
    <p>双击预览 · 点击编辑按钮进入编辑</p><i className="port left green" /><i className="port right" />
  </section>
}

function DrawLayer({ tool, color, fill, marks, setMarks, compact = false, readonly = false }: { tool: string; color: string; fill: boolean; marks: Mark[]; setMarks: React.Dispatch<React.SetStateAction<Mark[]>>; compact?: boolean; readonly?: boolean }) {
  const start = useRef<{ x: number; y: number } | null>(null)
  const poly = useRef<{ x: number; y: number }[]>([])
  const pos = (e: React.PointerEvent<SVGSVGElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e: React.PointerEvent<SVGSVGElement>) => { if (tool === 'select') return; const p = pos(e); if (tool === 'lasso') { poly.current.push(p); setMarks(m => [...m.filter(x => x.type !== 'draft'), { type: 'draft', color, x1: 0, y1: 0, x2: 0, y2: 0, points: poly.current.map(q => `${q.x},${q.y}`).join(' ') }]); if (e.detail === 2 && poly.current.length > 2) { setMarks(m => [...m.filter(x => x.type !== 'draft'), { type: 'lasso', color, filled: fill, x1: 0, y1: 0, x2: 0, y2: 0, points: poly.current.map(q => `${q.x},${q.y}`).join(' ') }]); poly.current = [] } return } start.current = p; e.currentTarget.setPointerCapture(e.pointerId) }
  const up = (e: React.PointerEvent<SVGSVGElement>) => { if (!start.current || tool === 'select') return; const p = pos(e); const s = start.current; start.current = null; if (tool === 'text') { const text = window.prompt('输入文字', '建筑标注'); if (text) setMarks(m => [...m, { type: 'text', color, x1: p.x, y1: p.y, x2: p.x, y2: p.y, text }]); return } setMarks(m => [...m, { type: tool, color, filled: ['rect', 'circle'].includes(tool) ? fill : undefined, x1: s.x, y1: s.y, x2: p.x, y2: p.y }]) }
  return <svg className={`draw-layer tool-${tool}`} viewBox={compact ? '0 0 1100 600' : undefined} preserveAspectRatio={compact ? 'none' : undefined} onPointerDown={readonly ? undefined : down} onPointerUp={readonly ? undefined : up}>
    <defs><marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="context-stroke" /></marker></defs>
    {marks.map((m, i) => m.type === 'rect' ? <rect key={i} x={Math.min(m.x1, m.x2)} y={Math.min(m.y1, m.y2)} width={Math.abs(m.x2 - m.x1)} height={Math.abs(m.y2 - m.y1)} fill={m.filled ? m.color : 'transparent'} fillOpacity={m.filled ? '.68' : '0'} stroke={m.color} strokeWidth="3" /> : m.type === 'circle' ? <ellipse key={i} cx={(m.x1 + m.x2) / 2} cy={(m.y1 + m.y2) / 2} rx={Math.abs(m.x2 - m.x1) / 2} ry={Math.abs(m.y2 - m.y1) / 2} fill={m.filled ? m.color : 'transparent'} fillOpacity={m.filled ? '.68' : '0'} stroke={m.color} strokeWidth="3" /> : m.type === 'lasso' ? <g key={i}><polygon points={m.points} fill={m.filled ? m.color : 'transparent'} fillOpacity={m.filled ? '.72' : '0'} stroke={m.color} strokeWidth="3" />{m.points?.split(' ').map((point, j) => { const [cx, cy] = point.split(','); return <circle key={j} cx={cx} cy={cy} r="3.5" fill="white" stroke={m.color} strokeWidth="2" /> })}</g> : m.type === 'draft' ? <polyline key={i} points={m.points} fill="none" stroke={m.color} strokeWidth="2.5" strokeLinejoin="round" /> : m.type === 'text' ? <text key={i} x={m.x1} y={m.y1} fill={m.color} fontSize="20" fontWeight="600">{m.text}</text> : <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={m.color} strokeWidth={m.type === 'pen' ? 6 : 3} strokeLinecap="round" markerEnd={m.type === 'arrow' ? 'url(#arrowhead)' : undefined} />)}
  </svg>
}

function ImageEditor({ onClose, onSave, initialEditing = false, initialMarks = [] }: { onClose: () => void; onSave: (marks: Mark[]) => void; initialEditing?: boolean; initialMarks?: Mark[] }) {
  const [editing, setEditing] = useState(initialEditing), [tool, setTool] = useState('pen'), [color, setColor] = useState(colors[0]), [fill, setFill] = useState(true), [marks, setMarks] = useState<Mark[]>(initialMarks)
  const beginEdit = () => setEditing(true)
  const toggleFill = () => { const next = !fill; setFill(next); setMarks(current => { const index = current.findLastIndex(mark => ['lasso', 'rect', 'circle'].includes(mark.type)); return index < 0 ? current : current.map((mark, i) => i === index ? { ...mark, filled: next } : mark) }) }
  return <div className={`editor-overlay ${editing ? 'is-editing' : 'is-viewing'}`} role="dialog" aria-modal="true" aria-label="图片查看与编辑">
    <header className="editor-header"><div><button onClick={onClose}><ArrowLeft />返回画布</button><strong>{editing ? '编辑图片副本' : '查看图片'}</strong><span>{editing ? '原图已保护 · 修改仅应用于副本' : '当前仅预览原图，尚未创建副本'}</span></div><div>{editing ? <><button onClick={() => setMarks(m => m.slice(0, -1))}><Undo2 />撤销</button><button><Redo2 />重做</button><button className="save-button" onClick={() => onSave(marks)}><Save />保存到节点</button></> : <button className="save-button" onClick={beginEdit}><Pencil />编辑副本</button>}</div></header>
    {editing && <aside className="editor-tools">{editorTools.map(t => <IconButton key={t.id} label={t.label} active={tool === t.id} onClick={() => t.id === 'eraser' ? setMarks([]) : setTool(t.id)}><t.icon /></IconButton>)}{['lasso', 'rect', 'circle'].includes(tool) && <button className={`fill-toggle ${fill ? 'is-on' : ''}`} aria-pressed={fill} onClick={toggleFill}>{fill ? '填充' : '不填充'}</button>}<div className="tool-separator" />{colors.map(c => <button key={c} aria-label={`使用颜色 ${c}`} className={`swatch ${color === c ? 'selected' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}<IconButton label="清除全部" onClick={() => setMarks([])}><Trash2 /></IconButton></aside>}
    <main className="editor-stage"><div className="editor-image"><img src={IMAGE} alt="窗边猫咪的建筑空间生成图" />{editing && <DrawLayer tool={tool} color={color} fill={fill} marks={marks} setMarks={setMarks} />}</div><p>{editing ? '套索：依次单击设置控制点，双击闭合；可切换填充或仅保留轮廓' : '点击"编辑副本"后才会创建副本并展开完整编辑工具栏'}</p></main>
    <aside className="history-panel"><div className="history-head"><strong>历史记录</strong><button onClick={onClose}><X /></button></div><div className={`history-card ${editing ? '' : 'current'}`}><span>1</span><img src={IMAGE} alt="原始版本缩略图" /><div><strong>原始版本</strong><small>保持不变</small></div></div>{editing && <div className="history-card current"><span>2</span><div className="draft-thumb"><Pencil /></div><div><strong>编辑副本</strong><small>{marks.length} 个修改</small></div></div>}</aside>
  </div>
}

function Header() {
  return <header className="project-bar"><Sparkles className="brand-mark" /><strong>Design Canvas</strong><span className="divider" /><span>p_demo · 画布工作区</span></header>
}

export { Header, IconButton, MainTools, AnalysisNode, ModelNode, ImageNode, GeneratedImageNode, DrawLayer, ImageEditor }
