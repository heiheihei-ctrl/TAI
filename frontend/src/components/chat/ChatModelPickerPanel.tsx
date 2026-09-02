import React, { useMemo, useState } from "react";
import { HelpCircle, Image as ImageIcon, Sparkles, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getVisibleChatModelOptions,
  type ChatModelKey,
  type ChatModelOption,
} from "@/config/chatModelOptions";

type Props = {
  value: ChatModelKey;
  onSelect: (option: ChatModelOption) => void;
  locale?: "zh" | "en";
  className?: string;
};

function ModelMediaIcon({ type }: { type: "image" | "video" }) {
  if (type === "video") {
    return <Video className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />;
  }
  return (
    <ImageIcon className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} />
  );
}

export default function ChatModelPickerPanel({
  value,
  onSelect,
  locale = "zh",
  className,
}: Props) {
  const [tab, setTab] = useState<"common" | "other">("common");
  const options = useMemo(() => getVisibleChatModelOptions(), []);
  const commonOptions = options.filter((opt) => opt.tab === "common");
  const otherOptions = options.filter((opt) => opt.tab === "other");
  const visibleOptions = tab === "common" ? commonOptions : otherOptions;
  const hasOtherNew = otherOptions.some((opt) => opt.isNew);
  const lt = (zh: string, en: string) => (locale === "en" ? en : zh);

  return (
    <div
      className={cn(
        "w-[280px] rounded-2xl border border-slate-200/90 bg-white p-2 shadow-xl",
        className
      )}
    >
      <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setTab("common")}
          className={cn(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            tab === "common"
              ? "bg-slate-900 text-white shadow-sm"
              : "text-slate-600 hover:bg-white"
          )}
        >
          {lt("常用模型", "Common")}
        </button>
        <button
          type="button"
          onClick={() => setTab("other")}
          className={cn(
            "relative rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            tab === "other"
              ? "border-slate-900 bg-slate-900 text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          )}
        >
          <span className="inline-flex items-center gap-1">
            {lt("其它模型", "Other")}
            <HelpCircle className="h-3.5 w-3.5 opacity-70" />
          </span>
          {hasOtherNew && tab !== "other" ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
          ) : null}
        </button>
      </div>

      <div className="space-y-1">
        {visibleOptions.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-slate-400">
            {lt("暂无其它模型", "No other models")}
          </div>
        ) : (
          visibleOptions.map((option) => {
            const active = value === option.key;
            const label = locale === "en" ? option.labelEn : option.label;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onSelect(option)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-800 hover:bg-slate-50"
                )}
              >
                <Sparkles
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-white" : "text-slate-700"
                  )}
                  strokeWidth={1.75}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
                {option.isNew ? (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
                    new
                  </span>
                ) : null}
                <ModelMediaIcon type={option.mediaType} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
