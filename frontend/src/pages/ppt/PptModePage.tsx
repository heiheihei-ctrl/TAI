import React from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight, Play } from "lucide-react";
import { cn } from "@/lib/utils";

type PptMode = "scheme" | "outline";

function SchemePreview() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#eef1f4]">
      <div className="absolute inset-3 rounded-md bg-white shadow-sm">
        <div className="flex h-full gap-2 p-3">
          <div className="flex w-[42%] flex-col gap-2">
            <div className="h-2 w-16 rounded bg-[#2f3540]" />
            <div className="h-1.5 w-full rounded bg-slate-200" />
            <div className="h-1.5 w-[85%] rounded bg-slate-200" />
            <div className="mt-2 grid flex-1 grid-cols-2 gap-1.5">
              <div className="rounded bg-gradient-to-br from-slate-300 to-slate-400" />
              <div className="rounded bg-gradient-to-br from-amber-200 to-stone-400" />
              <div className="rounded bg-gradient-to-br from-stone-300 to-slate-500" />
              <div className="rounded bg-gradient-to-br from-sky-200 to-slate-400" />
            </div>
          </div>
          <div className="relative flex-1 overflow-hidden rounded bg-gradient-to-br from-[#d9dee6] via-[#b8c0cb] to-[#8a93a1]">
            <div className="absolute bottom-3 left-3 right-3 h-[55%] rounded-t-lg bg-gradient-to-t from-[#5b6574] to-[#9aa3b0] opacity-90" />
            <div className="absolute bottom-[42%] left-[18%] h-10 w-10 rotate-12 rounded-sm bg-[#6d7788]" />
            <div className="absolute bottom-[38%] right-[22%] h-14 w-8 -rotate-6 rounded-sm bg-[#4f5866]" />
            <div className="absolute right-2 top-2 rounded bg-white/80 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
              Functional Zoning
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OutlinePreview() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#eef1f4]">
      <div className="absolute inset-3 rounded-md bg-white shadow-sm">
        <div className="flex h-full flex-col gap-2 p-3">
          <div className="flex items-center justify-between">
            <div className="h-2 w-24 rounded bg-[#2f3540]" />
            <div className="h-1.5 w-14 rounded bg-slate-200" />
          </div>
          <div className="relative min-h-0 flex-1 overflow-hidden rounded border border-slate-100 bg-[#f7f8fa]">
            <svg viewBox="0 0 240 140" className="h-full w-full" aria-hidden>
              <rect x="20" y="18" width="90" height="50" rx="3" fill="#dbe3ec" stroke="#94a3b8" />
              <rect x="130" y="18" width="70" height="35" rx="3" fill="#cfd8e3" stroke="#94a3b8" />
              <rect x="20" y="80" width="55" height="40" rx="3" fill="#e2e8f0" stroke="#94a3b8" />
              <rect x="90" y="72" width="110" height="48" rx="3" fill="#cbd5e1" stroke="#64748b" />
              <path
                d="M65 43 C 95 43, 105 36, 130 36"
                fill="none"
                stroke="#334155"
                strokeWidth="1.5"
                strokeDasharray="3 2"
              />
              <path
                d="M47 80 C 47 70, 100 68, 145 72"
                fill="none"
                stroke="#0f172a"
                strokeWidth="1.6"
              />
              <circle cx="145" cy="72" r="2.5" fill="#0f172a" />
            </svg>
            <div className="absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-medium text-slate-600">
              Spatial Flow Analysis
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const MODES: Array<{
  id: PptMode;
  title: string;
  description: string;
  Preview: React.FC;
}> = [
  {
    id: "scheme",
    title: "基于方案生成",
    description:
      "上传方案效果图，灵活勾选所需内容，一键生成专业排版PPT，让设计成果快速呈现",
    Preview: SchemePreview,
  },
  {
    id: "outline",
    title: "基于大纲生成",
    description:
      "智能生成可编辑大纲，按需调整大纲内容，输出逻辑清晰、内容精准的PPT",
    Preview: OutlinePreview,
  },
];

export default function PptModePage() {
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<PptMode>("scheme");

  return (
    <div className="relative flex min-h-screen flex-col bg-[#f3f4f6] text-slate-900">

      <div className="mx-auto flex w-full max-w-[980px] flex-1 flex-col px-5 pb-10 pt-14 sm:px-8 sm:pt-16">
        <header className="mb-10 text-center sm:mb-12">
          <h1 className="text-[28px] font-bold tracking-tight text-[#1f2430] sm:text-[32px]">
            PPT生成模式
          </h1>
          <p className="mt-2 text-sm text-slate-500 sm:text-base">
            选择你想要的生成模式，开启创作之旅
          </p>
        </header>

        <div className="mx-auto grid w-full max-w-[760px] grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
          {MODES.map((item) => {
            const selected = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                className={cn(
                  "flex flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-[0_8px_28px_rgba(15,23,42,0.06)] transition",
                  selected
                    ? "border-[#2f3540] ring-1 ring-[#2f3540]/40"
                    : "border-transparent hover:border-slate-200",
                )}
              >
                <div className="aspect-[4/3] w-full border-b border-slate-100">
                  <item.Preview />
                </div>
                <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-4">
                  <div>
                    <h2 className="text-base font-semibold text-[#1f2430]">
                      {item.title}
                    </h2>
                    <p className="mt-2 text-[13px] leading-6 text-slate-500">
                      {item.description}
                    </p>
                  </div>
                  <div className="mt-auto pt-1">
                    {selected ? (
                      <span className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#2f3540] text-white">
                        <Check className="h-5 w-5" strokeWidth={2.5} />
                      </span>
                    ) : (
                      <span className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#2f3540] bg-white text-sm font-medium text-[#2f3540]">
                        选择
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mx-auto mt-auto flex w-full max-w-[760px] gap-4 pt-12 sm:pt-14">
          <button
            type="button"
            className="h-12 flex-1 rounded-xl border border-[#2f3540] bg-white text-sm font-medium text-[#2f3540] transition hover:bg-slate-50"
            onClick={() => navigate("/ppt/history")}
          >
            创作记录
          </button>
          <button
            type="button"
            className="h-12 flex-1 rounded-xl bg-[#2f3540] text-sm font-medium text-white transition hover:bg-[#252a33]"
            onClick={() =>
              navigate(`/ppt/create?mode=${encodeURIComponent(mode)}`)
            }
          >
            下一步
          </button>
        </div>
      </div>
    </div>
  );
}
