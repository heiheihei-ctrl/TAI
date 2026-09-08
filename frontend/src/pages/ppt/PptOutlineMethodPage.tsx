import React from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import PptWizardLayout from "./PptWizardLayout";

type OutlineMethod = "custom" | "oneshot";

function CustomOutlinePreview() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a1d24]">
      <div className="absolute inset-4 flex flex-col gap-2 rounded-md bg-[#23262e] p-3 shadow-inner">
        {[
          { w: "72%", indent: 0 },
          { w: "58%", indent: 1 },
          { w: "64%", indent: 1 },
          { w: "48%", indent: 2 },
          { w: "54%", indent: 1 },
          { w: "40%", indent: 2 },
        ].map((row, i) => (
          <div
            key={i}
            className="flex items-center gap-2"
            style={{ paddingLeft: row.indent * 12 }}
          >
            <div className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            <div
              className="h-2 rounded bg-slate-500/80"
              style={{ width: row.w }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function OneShotPreview() {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#1a1d24]">
      <div className="absolute inset-4 flex flex-col rounded-md border border-slate-600/80 bg-[#2a2e38] p-3">
        <div className="space-y-1.5">
          <div className="h-1.5 w-[92%] rounded bg-slate-500/70" />
          <div className="h-1.5 w-[78%] rounded bg-slate-500/50" />
          <div className="h-1.5 w-[64%] rounded bg-slate-500/40" />
        </div>
        <div className="mt-auto flex items-end justify-between pt-3">
          <div className="h-6 w-6 rounded border border-slate-500/60 bg-[#1f232b]" />
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/90">
            <span className="text-[10px] text-[#2f3540]">✦</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const METHODS: Array<{
  id: OutlineMethod;
  title: string;
  description: string;
  Preview: React.FC;
}> = [
  {
    id: "custom",
    title: "自定义大纲",
    description:
      "手动输入或编辑详细大纲内容，精准把控内容层级，结构清晰、内容可控",
    Preview: CustomOutlinePreview,
  },
  {
    id: "oneshot",
    title: "一句话生成",
    description:
      "输入一句话描述需求，智能解析并自动生成符合设计逻辑的专业PPT大纲",
    Preview: OneShotPreview,
  },
];

export default function PptOutlineMethodPage() {
  const navigate = useNavigate();
  const [method, setMethod] = React.useState<OutlineMethod>("custom");

  return (
    <PptWizardLayout
      title="大纲生成方式"
      subtitle="选择适合你的方式，快速生成演示大纲"
      onBack={() => navigate("/ppt")}
      onNext={() => {
        if (method === "custom") {
          navigate("/ppt/outline/custom");
        } else {
          navigate("/ppt/outline/oneshot");
        }
      }}
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
        {METHODS.map((item) => {
          const selected = method === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setMethod(item.id)}
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
    </PptWizardLayout>
  );
}
