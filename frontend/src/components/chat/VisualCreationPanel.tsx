import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ImagePlus, Loader2, Plus, RefreshCw, Send, Square, Trash2, X } from 'lucide-react';
import SmartImage from '@/components/ui/SmartImage';
import { visualAgentApi, type VisualArtifact, type VisualConfig, type VisualSession, type VisualSessionSummary } from '@/services/visualAgentApi';
import { imageUploadService } from '@/services/imageUploadService';
import { useAIChatStore } from '@/stores/aiChatStore';
import { useProjectStore } from '@/stores/projectStore';
import { visualStatusLabel } from '@/utils/visualAgentEvents';
import { notifyCreditsChanged } from '@/utils/creditsEvents';

const toolLabels: Record<string, string> = {
  image_generate: '生成图片', video_generate: '生成视频', visual_search: '搜索视觉素材',
  general_search: '检索资料', compose_video: '合成视频',
};
const buttonClass = 'rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';

export default function VisualCreationPanel({ projectId, onExit }: { projectId: string; onExit: () => void }) {
  const [config, setConfig] = useState<VisualConfig | null>(null);
  const [sessions, setSessions] = useState<VisualSessionSummary[]>([]);
  const [session, setSession] = useState<VisualSession | null>(null);
  const [prompt, setPrompt] = useState('');
  const [references, setReferences] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeId = useRef<string | null>(null);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const selection = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingRequest = useRef<{ fingerprint: string; requestId: string } | null>(null);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const settings = await visualAgentApi.config();
        if (cancelled) return;
        setConfig(settings);
        if (!projectId) { setError('请先打开一个画布项目'); return; }
        const history = await visualAgentApi.list(projectId);
        if (cancelled) return;
        setSessions(history);
        if (history[0]) {
          const snapshot = await visualAgentApi.get(history[0].id);
          if (!cancelled) { activeId.current = snapshot.id; setSession(snapshot); }
        }
      } catch (e: unknown) { if (!cancelled) setError(e instanceof Error ? e.message : '无法加载创作记录'); }
      finally { if (!cancelled) setInitializing(false); }
    })();
    return () => { cancelled = true; mounted.current = false; };
  }, [projectId]);

  const sessionId = session?.id;
  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = async () => {
      if (controller.signal.aborted) return;
      setConnecting(true);
      try {
        await visualAgentApi.subscribe(sessionId, controller.signal, snapshot => {
          if (controller.signal.aborted || activeId.current !== sessionId) return;
          setSession(snapshot); setConnecting(false);
        });
      } catch {
        if (!controller.signal.aborted) setConnecting(true);
      }
      if (!controller.signal.aborted) timer = setTimeout(() => { void connect(); }, 3000);
    };
    void connect();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId]);

  const activeTurn = session?.turns.find(turn => turn.id === session.activeTurnId);
  const running = Boolean(session?.activeTurnId);
  const latestStatus = session?.turns[session.turns.length - 1]?.status;
  useEffect(() => { if (latestStatus) notifyCreditsChanged(); }, [latestStatus]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [activeTurn?.events.length, latestStatus]);

  async function chooseSession(id: string) {
    const version = ++selection.current;
    activeId.current = null;
    setBusy(true); setError(null);
    try {
      const snapshot = await visualAgentApi.get(id);
      if (mounted.current && version === selection.current) {
        activeId.current = id; setSession(snapshot); pendingRequest.current = null;
      }
    } catch (e: unknown) { if (mounted.current) setError(e instanceof Error ? e.message : '无法读取会话'); }
    finally { if (mounted.current && version === selection.current) setBusy(false); }
  }

  async function send() {
    if (inFlight.current || initializing || running || session?.closing || !projectId || !prompt.trim() || !config?.available || uploading) return;
    inFlight.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      let current = session;
      if (!current) {
        current = await visualAgentApi.create(projectId, prompt.trim().slice(0, 40));
        if (!mounted.current) return;
        activeId.current = current.id; setSession(current);
        setSessions(history => [current!, ...history]);
      }
      const fingerprint = JSON.stringify([current.id, prompt.trim(), references]);
      if (pendingRequest.current?.fingerprint !== fingerprint) pendingRequest.current = { fingerprint, requestId: crypto.randomUUID() };
      const turn = await visualAgentApi.send(current.id, { prompt: prompt.trim(), referenceUrls: references, requestId: pendingRequest.current.requestId });
      if (!mounted.current) return;
      setSession(previous => previous?.id === current!.id ? { ...previous, activeTurnId: turn.id, turns: [...previous.turns.filter(item => item.id !== turn.id), turn] } : previous);
      setPrompt(''); setReferences([]); pendingRequest.current = null;
    } catch (e: unknown) { if (mounted.current) setError(e instanceof Error ? e.message : '任务提交失败，可重试同一需求'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }

  async function uploadSources(sources: (File | string)[]) {
    if (uploading || references.length + sources.length > 8) { setError('最多支持 8 张参考图'); return; }
    setUploading(true); setError(null);
    try {
      const urls: string[] = [];
      for (const source of sources) {
        const result = typeof source === 'string'
          ? await imageUploadService.uploadImageSource(source, { projectId })
          : await imageUploadService.uploadImageFile(source, { projectId, maxFileSize: 10 * 1024 * 1024 });
        if (!result.success || !result.asset?.url) throw new Error(result.error || '参考图上传失败');
        const url = new URL(result.asset.url, window.location.origin);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('参考图必须上传为远程资源');
        urls.push(url.href);
      }
      if (mounted.current) setReferences(previous => [...new Set([...previous, ...urls])].slice(0, 8));
    } catch (e: unknown) { if (mounted.current) setError(e instanceof Error ? e.message : '参考图上传失败'); }
    finally { if (mounted.current) setUploading(false); }
  }

  function useSelectedImages() {
    const chat = useAIChatStore.getState();
    const sources = [chat.preciseEditContext?.targetImageSource || chat.sourceImageForEditing, chat.sourceImageForAnalysis, ...chat.sourceImagesForBlending].filter((url): url is string => Boolean(url));
    if (!sources.length) { setNotice('请先在画布中选取图片，再添加为参考图。'); return; }
    void uploadSources([...new Set(sources)]);
  }

  function importArtifact(asset: VisualArtifact) {
    if (useProjectStore.getState().currentProjectId !== projectId || /^(data:|blob:)/i.test(asset.url)) {
      setError('请回到当前创作项目后再导入'); return;
    }
    // Reuse existing media insertion paths, with durable remote sources only.
    if (asset.mimeType.startsWith('video/')) {
      window.dispatchEvent(new CustomEvent('flow:insert-video-from-library', { detail: { videoUrl: asset.url, videoName: asset.filename } }));
    } else {
      window.dispatchEvent(new CustomEvent('triggerQuickImageUpload', { detail: { imageData: asset.url, fileName: asset.filename, operationType: 'generate' } }));
    }
    setNotice('已发送到画布');
  }

  async function interrupt() {
    if (!session || busy) return;
    setBusy(true); setError(null);
    try { await visualAgentApi.interrupt(session.id); setNotice('已请求停止，正在等待云端确认。'); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '停止请求失败'); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function closeSession() {
    if (!session || running || busy) return;
    setBusy(true); setError(null);
    try {
      await visualAgentApi.remove(session.id);
      if (!mounted.current) return;
      setSessions(history => history.filter(item => item.id !== session.id));
      activeId.current = null; setSession(null); setNotice('会话已关闭；已转存的画布资源保留。');
    } catch (e: unknown) { if (mounted.current) setError(e instanceof Error ? e.message : '关闭会话失败'); }
    finally { if (mounted.current) setBusy(false); }
  }

  async function refreshSession() {
    if (!session || busy || initializing) return;
    setBusy(true); setError(null);
    try {
      if (!session.closing) await visualAgentApi.sync(session.id);
      if (mounted.current) await chooseSession(session.id);
    } catch (e: unknown) { if (mounted.current) setError(e instanceof Error ? e.message : '刷新失败'); }
    finally { if (mounted.current) setBusy(false); }
  }

  return (
    <section className='order-1 flex min-h-[360px] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-3 text-slate-800' data-history-ignore-toggle>
      <header className='mb-3 flex flex-wrap items-center gap-2'>
        <button type='button' className={buttonClass} onClick={onExit}><ArrowLeft size={14} className='mr-1 inline' />返回对话</button>
        <strong className='text-sm'>视觉创作</strong>
        <span className='ml-auto text-xs text-slate-500'>{config?.creditsPerTurn ? `${config.creditsPerTurn} 积分 / 轮` : '加载配置中'}</span>
      </header>
      <div className='mb-3 flex gap-2'>
        <select aria-label='创作会话' className='min-w-0 flex-1 rounded-lg border bg-white px-2 text-xs' value={session?.id || ''} disabled={busy || initializing} onChange={event => { void chooseSession(event.target.value); }}>
          <option value='' disabled>新创作</option>
          {sessions.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
        <button type='button' title='新建创作' className={buttonClass} disabled={busy || initializing} onClick={() => { ++selection.current; activeId.current = null; setSession(null); pendingRequest.current = null; setError(null); }}><Plus size={14} /></button>
        <button type='button' title='刷新状态并重新同步产物' className={buttonClass} disabled={!session || busy || initializing} onClick={() => { void refreshSession(); }}><RefreshCw size={14} /></button>
        <button type='button' title='关闭会话并清理云端资源；未同步的产物将被删除' className={buttonClass} disabled={!session || running || busy || initializing} onClick={() => { void closeSession(); }}><Trash2 size={14} /></button>
      </div>
      {!config?.available && <p role='status' className='mb-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800'>{config?.reason || '正在检查视觉创作服务配置…'}</p>}
      <div ref={scrollRef} className='min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain' style={{ maxHeight: '50vh' }}>
        {!session?.turns.length && <p className='py-5 text-sm leading-6 text-slate-500'>描述你想制作的素材，例如“为咖啡新品生成一张 16:9 主视觉，再制作一段宣传视频”。可以附上参考图，或在同一会话中继续修改。</p>}
        {session?.turns.map(turn => (
          <article key={turn.id} className='space-y-2 rounded-lg border border-slate-100 p-2'>
            <p className='whitespace-pre-wrap break-words text-sm font-medium'>{turn.prompt}</p>
            <div className='flex flex-wrap gap-1'>{turn.referenceUrls.map((url, i) => <SmartImage key={url} src={url} alt={`参考图 ${i + 1}`} className='h-12 w-12 rounded object-cover' />)}</div>
            <span className='inline-flex items-center gap-1 text-xs text-slate-500'>{['queued', 'running', 'collecting', 'settling', 'uncertain'].includes(turn.status) && <Loader2 size={12} className='animate-spin' />}{visualStatusLabel(turn.status)}</span>
            {turn.events.filter(event => event.type === 'agent.message' || event.type === 'agent.tool_use' || event.isError).map((event, i) => (
              <div key={event.id || i} className={event.isError ? 'text-xs text-red-600' : 'whitespace-pre-wrap break-words text-xs leading-5 text-slate-600'}>
                {event.text || (event.isError ? '工具执行失败' : toolLabels[event.name || ''] || '正在处理创作任务')}
              </div>
            ))}
            {turn.error && <p role='alert' className='text-xs text-red-600'>{turn.error}</p>}
            {turn.artifacts.map(asset => (
              <div key={asset.id} className='rounded-lg border p-2'>
                {asset.mimeType.startsWith('video/') ? <video src={asset.url} controls preload='metadata' className='max-h-64 w-full rounded' /> : <SmartImage src={asset.url} alt={asset.filename} className='max-h-64 w-full rounded object-contain' />}
                <div className='mt-2 flex items-center gap-2 text-xs'>
                  <span className='min-w-0 flex-1 truncate'>{asset.filename}</span>
                  <a className={buttonClass} href={asset.url} download={asset.filename} target='_blank' rel='noreferrer'>下载</a>
                  <button type='button' className={buttonClass} onClick={() => importArtifact(asset)}>加入画布</button>
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>
      {connecting && session && <p role='status' className='mt-2 text-xs text-slate-500'>正在连接进度，断线后会自动恢复…</p>}
      {session?.closing && <p role='status' className='mt-2 text-xs text-amber-700'>该会话正在关闭。若清理失败，可再次点击关闭；开始创作请新建会话。</p>}
      {error && <p role='alert' className='mt-2 text-xs text-red-600'>{error}</p>}
      {notice && <p role='status' className='mt-2 text-xs text-emerald-700'>{notice}</p>}
      <div className='mt-3 space-y-2 border-t pt-3'>
        <div className='flex flex-wrap gap-2'>{references.map((url, i) => <div key={url} className='relative'><SmartImage src={url} alt={`参考图 ${i + 1}`} className='h-12 w-12 rounded object-cover' /><button type='button' aria-label={`移除参考图 ${i + 1}`} disabled={busy || running} className='absolute -right-1 -top-1 rounded-full bg-white' onClick={() => setReferences(previous => previous.filter(ref => ref !== url))}><X size={12} /></button></div>)}</div>
        <textarea aria-label='视觉创作需求' rows={3} maxLength={12000} value={prompt} disabled={running || busy} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void send(); } }} className='w-full resize-none rounded-lg border border-slate-200 bg-transparent p-2 text-sm focus:border-blue-400 focus:outline-none' placeholder='描述图片、视频或素材合成需求…' />
        <div className='flex flex-wrap items-center gap-2'>
          <input ref={fileInput} type='file' multiple accept='image/png,image/jpeg,image/webp,image/gif' className='hidden' onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; void uploadSources(files); }} />
          <button type='button' className={buttonClass} disabled={running || busy || uploading} onClick={() => fileInput.current?.click()}><ImagePlus size={14} className='mr-1 inline' />参考图</button>
          <button type='button' className={buttonClass} disabled={running || busy || uploading} onClick={useSelectedImages}>使用当前选图</button>
          {uploading && <Loader2 size={14} className='animate-spin' />}
          {running ? <button type='button' className={`${buttonClass} ml-auto`} disabled={busy || activeTurn?.status === 'collecting'} onClick={() => { void interrupt(); }}><Square size={12} className='mr-1 inline' />停止</button> : <button type='button' className={`${buttonClass} ml-auto bg-blue-600 text-white hover:bg-blue-700`} disabled={busy || initializing || session?.closing || !projectId || uploading || !prompt.trim() || !config?.available} onClick={() => { void send(); }}>{busy ? <Loader2 size={14} className='inline animate-spin' /> : <Send size={14} className='mr-1 inline' />}开始创作</button>}
        </div>
      </div>
    </section>
  );
}
