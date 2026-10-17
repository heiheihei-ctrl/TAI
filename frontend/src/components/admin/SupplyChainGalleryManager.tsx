import React from 'react';
import { Button } from '@/components/ui/button';
import SmartImage from '@/components/ui/SmartImage';
import { imageUploadService } from '@/services/imageUploadService';
import { supplyChainGalleryApi, type SupplyChainGalleryItem } from '@/services/supplyChainGalleryApi';

export default function SupplyChainGalleryManager() {
  const [items, setItems] = React.useState<SupplyChainGalleryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [ready, setReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [name, setName] = React.useState('');
  const [scene, setScene] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);
  const mounted = React.useRef(false);
  const load = React.useCallback(async () => {
    setLoading(true);
    setReady(false);
    setError('');
    try {
      const data = await supplyChainGalleryApi.listForAdmin();
      if (mounted.current) { setItems(data); setReady(true); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : '加载失败');
    } finally { if (mounted.current) setLoading(false); }
  }, []);
  React.useEffect(() => { mounted.current = true; void load(); return () => { mounted.current = false; }; }, [load]);

  const reset = () => {
    setName(''); setScene(''); setFile(null); setEditing(null);
    if (fileInput.current) fileInput.current.value = '';
  };
  const save = async (next: SupplyChainGalleryItem[]) => {
    const saved = await supplyChainGalleryApi.save(next);
    setItems(saved);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || loading || !ready) return;
    setBusy(true); setError('');
    try {
      const existing = items.find((item) => item.id === editing);
      let imageUrl = existing?.imageUrl;
      if (file) {
        const result = await imageUploadService.uploadImageFile(file);
        if (!result.success || !result.asset?.url) throw new Error(result.error || '图片上传失败');
        imageUrl = result.asset.url;
      }
      if (!imageUrl) throw new Error('请选择要上传的图片');
      const entry = { id: existing?.id || crypto.randomUUID(), name: name.trim(), scene: scene.trim(), imageUrl, isActive: existing?.isActive ?? true };
      await save(existing ? items.map((item) => item.id === existing.id ? entry : item) : [entry, ...items]);
      reset();
    } catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  };
  const change = async (next: SupplyChainGalleryItem[]) => {
    if (busy || loading || !ready) return;
    setBusy(true); setError('');
    try { await save(next); }
    catch (e) { setError(e instanceof Error ? e.message : '保存失败'); }
    finally { setBusy(false); }
  };

  return <section className="space-y-5 rounded-xl border bg-white p-6">
    <div className="flex items-center justify-between"><div>
      <h2 className="text-lg font-semibold">供应链公共图库</h2>
      <p className="mt-1 text-sm text-gray-500">在此上传和管理图片，已上架的图片会显示在玲珑供应链公共图库中。</p>
    </div><Button variant="outline" onClick={() => void load()} disabled={busy || loading}>刷新</Button></div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <form onSubmit={(event) => void submit(event)} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">图片名称<input required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="rounded border px-3 py-2" disabled={busy || loading} /></label>
      <label className="flex flex-col gap-1 text-sm">场景分类<input required maxLength={100} list="supply-chain-scenes" value={scene} onChange={(e) => setScene(e.target.value)} className="rounded border px-3 py-2" disabled={busy || loading} /></label>
      <datalist id="supply-chain-scenes">{Array.from(new Set(items.map((item) => item.scene))).map((value) => <option key={value} value={value} />)}</datalist>
      <label className="flex flex-col gap-1 text-sm">{editing ? '替换图片（可选）' : '上传图片'}<input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" required={!editing} onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={busy || loading} /></label>
      <Button type="submit" disabled={busy || loading || !ready}>{busy ? '保存中…' : editing ? '保存修改' : '上传并上架'}</Button>
      {editing && <Button type="button" variant="outline" onClick={reset} disabled={busy}>取消编辑</Button>}
    </form>
    {loading ? <p className="py-8 text-center text-gray-500">正在加载图库…</p> : <>
      <p className="text-sm text-gray-500">共 {items.length} 张图片，已上架 {items.filter((item) => item.isActive).length} 张</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{items.map((item) => <article key={item.id} className="overflow-hidden rounded-lg border">
        <SmartImage src={item.imageUrl} alt={item.name} className="aspect-[4/3] w-full bg-gray-50 object-contain" />
        <div className="space-y-2 p-3"><p className="truncate font-medium" title={item.name}>{item.name}</p><p className="text-sm text-gray-500">{item.scene} · {item.isActive ? '已上架' : '已下架'}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || loading || !ready} onClick={() => { setEditing(item.id); setName(item.name); setScene(item.scene); setFile(null); if (fileInput.current) fileInput.current.value = ''; }}>编辑</Button>
            <Button size="sm" variant="outline" disabled={busy || loading || !ready} onClick={() => void change(items.map((row) => row.id === item.id ? { ...row, isActive: !row.isActive } : row))}>{item.isActive ? '下架' : '上架'}</Button>
            <Button size="sm" variant="outline" disabled={busy || loading || !ready} onClick={() => { if (window.confirm(`删除“${item.name}”？`)) { if (editing === item.id) reset(); void change(items.filter((row) => row.id !== item.id)); } }}>删除</Button>
          </div>
        </div></article>)}</div>
      {!items.length && !error && <p className="py-8 text-center text-gray-500">尚未上传公共图库图片</p>}
    </>}
  </section>;
}
