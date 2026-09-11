import React from "react";
import { ArrowLeft, Download, FileDown, Loader2 } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import SmartImage from "@/components/ui/SmartImage";
import { downloadImage } from "@/utils/downloadHelper";
import { getPptImageJob, runPptImageJob } from "@/services/pptImageService";
import type { PptOutlinePageInput } from "@/services/pptOutlineService";
import { exportPptImagesToPdf } from "@/utils/pptPdf";

export default function PptCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const pages = React.useMemo(() => {
    const input = (location.state as { pages?: PptOutlinePageInput[] } | null)?.pages;
    return Array.isArray(input) ? input.filter((page) =>
      typeof page?.title === "string" && typeof page?.content === "string" && (page.title.trim() || page.content.trim()),
    ) : [];
  }, [location.state]);
  const [selected, setSelected] = React.useState(0);
  const [, refresh] = React.useReducer((value: number) => value + 1, 0);
  const [downloading, setDownloading] = React.useState(false);
  const [exportingPdf, setExportingPdf] = React.useState(false);
  const job = getPptImageJob(location.key, pages.length);

  React.useEffect(() => {
    if (!pages.length) return;
    // In-flight jobs survive StrictMode/remounts without resubmitting requests.
    void runPptImageJob(location.key, pages);
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
  }, [location.key, pages]);

  if (!pages.length) return <Navigate to="/ppt/outline/oneshot" replace />;
  const current = job.pages[selected];
  const completed = job.pages.filter((page) => page.status === "success").length;
  const canExportPdf = completed === pages.length;
  const generating = job.pages.findIndex((page) => page.status === "generating");
  const retry = () => {
    if (!window.confirm("重试会提交新的付费生图请求。若上次超时或网络中断，请先核对图片历史和积分记录。是否继续？")) return;
    void runPptImageJob(location.key, pages, selected).then(refresh);
    refresh();
  };
  return (
    <div className="min-h-dvh bg-[#f3f4f6] px-5 py-6 text-[#1f2430] sm:px-10">
      <header className="mx-auto flex max-w-[1200px] items-center justify-between">
        <button onClick={() => {
          if (job.running && !window.confirm("生成会在当前浏览器会话中继续，重新生成将产生新费用。继续返回？")) return;
          navigate("/ppt/outline/edit", { state: { pages } });
        }} className="inline-flex items-center gap-2 text-sm text-slate-600"><ArrowLeft className="h-4 w-4" />返回编辑</button>
        <div className="flex gap-2"><button disabled={!canExportPdf || exportingPdf} onClick={async () => {
          setExportingPdf(true);
          try { await exportPptImagesToPdf(job.pages.map((page) => page.url!).filter(Boolean), "PPT.pdf"); }
          catch (error) { window.alert(error instanceof Error ? error.message : "PDF 导出失败，请重试"); }
          finally { setExportingPdf(false); }
        }} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white disabled:opacity-40"><FileDown className="h-4 w-4" />{exportingPdf ? "导出中…" : "导出 PDF"}</button><button disabled={!current?.url || downloading} onClick={async () => {
          if (!current?.url) return;
          setDownloading(true);
          try { await downloadImage(current.url, `PPT-${selected + 1}.png`); }
          finally { setDownloading(false); }
        }} className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm disabled:opacity-40"><Download className="h-4 w-4" />下载当前页</button></div>
      </header>
      <div className="mx-auto mt-8 max-w-[1200px]">
        <h1 className="text-2xl font-bold">{completed === pages.length ? "你的 PPT 图片已生成" : "PPT 图片生成"}</h1>
        <p aria-live="polite" className="mt-2 text-sm text-slate-600">{generating >= 0 ? `第 ${generating + 1}/${pages.length} 页生成中` : `已生成 ${completed}/${pages.length} 页`}</p>
        <div className="mt-6 grid gap-6 md:grid-cols-[200px_1fr]">
          <nav aria-label="幻灯片页面" className="flex gap-3 overflow-auto md:max-h-[70vh] md:flex-col">
            {pages.map((page, index) => <button key={index} onClick={() => setSelected(index)} aria-current={selected === index ? "page" : undefined} className={`min-w-[160px] rounded-lg border-2 p-2 text-left ${selected === index ? "border-blue-500" : "border-transparent bg-white"}`}>
              {job.pages[index]?.url && <SmartImage src={job.pages[index].url} alt={`第${index + 1}页缩略图`} className="aspect-video w-full object-contain" />}
              <span className="block truncate text-sm">{index + 1}. {page.title || "未命名页面"}</span>
              <span className="text-xs text-slate-500">{{ pending: "等待生成", generating: "生成中", success: "已完成", failed: "生成失败", unknown: "待核对" }[job.pages[index].status]}</span>
            </button>)}
          </nav>
          <section className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg">
            {current?.url ? <SmartImage src={current.url} alt={pages[selected].title || `第${selected + 1}页`} className="h-full w-full object-contain" /> : <div className="p-8 text-center">
              {current?.status === "generating" && <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin" />}
              <p role={current?.error ? "alert" : undefined}>{current?.error || (current?.status === "generating" ? "AI 正在生成此页图片，请稍候…" : "此页等待生成")}</p>
              {(current?.status === "failed" || current?.status === "unknown") && <button disabled={job.running} onClick={retry} className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-white disabled:opacity-40">重试此页</button>}
            </div>}
          </section>
        </div>
      </div>
    </div>
  );
}