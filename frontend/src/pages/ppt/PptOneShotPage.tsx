import React from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Sparkles } from "lucide-react";
import PptWizardLayout from "./PptWizardLayout";
import { generatePptOutline } from "@/services/pptOutlineService";
import { persistPptOutlineDraft } from "./pptOutlineDraft";

export default function PptOneShotPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleNext = async () => {
    const text = prompt.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { pages } = await generatePptOutline(text);
      persistPptOutlineDraft(pages, text);
      navigate("/ppt/outline/edit", {
        state: { pages, prompt: text },
      });
    } catch (e: any) {
      setError(e?.message || "大纲生成失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PptWizardLayout
      title="一句话生成大纲"
      subtitle="用一句话描述你的想法，AI将为你自动生成结构清晰的大纲"
      onBack={() => navigate("/ppt/outline")}
      onNext={() => {
        void handleNext();
      }}
      nextDisabled={!prompt.trim() || loading}
      nextLabel={loading ? "生成中…" : "下一步"}
    >
      <div className="relative rounded-2xl border border-slate-200 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={8}
          disabled={loading}
          placeholder="一句话描述你想要的PPT，例如‘生成一个介绍建筑师及其作品的PPT’"
          className="min-h-[220px] w-full resize-none rounded-2xl bg-transparent px-5 pb-14 pt-5 text-sm leading-7 text-[#1f2430] outline-none placeholder:text-slate-400 disabled:opacity-60 sm:min-h-[260px] sm:text-[15px]"
        />
        <button
          type="button"
          disabled={loading}
          className="absolute bottom-4 left-4 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-[#2f3540] disabled:opacity-50"
          title="智能润色"
          onClick={() => {
            if (!prompt.trim()) {
              setPrompt("生成一个介绍建筑师及其作品的PPT");
            }
          }}
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-center text-sm text-red-500">{error}</p>
      ) : null}

      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在用 DeepSeek 生成大纲…
        </div>
      ) : null}
    </PptWizardLayout>
  );
}
