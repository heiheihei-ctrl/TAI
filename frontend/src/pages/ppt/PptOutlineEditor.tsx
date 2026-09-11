import React from "react";
import {
  ChevronUp,
  GripVertical,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import PptWizardLayout from "./PptWizardLayout";

export type OutlinePage = {
  id: string;
  title: string;
  content: string;
  collapsed: boolean;
};

export function createOutlinePage(
  seed?: Partial<Pick<OutlinePage, "title" | "content">>,
): OutlinePage {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: seed?.title || "",
    content: seed?.content || "",
    collapsed: false,
  };
}

type Props = {
  title: string;
  subtitle?: string;
  initialPages?: Array<{ title: string; content: string }>;
  showImageAction?: boolean;
  onBack: () => void;
  onNext: (pages: OutlinePage[]) => void;
  nextLabel?: string;
};

export default function PptOutlineEditor({
  title,
  subtitle,
  initialPages,
  showImageAction = true,
  onBack,
  onNext,
  nextLabel = "生成",
}: Props) {
  const [pages, setPages] = React.useState<OutlinePage[]>(() => {
    if (initialPages?.length) {
      return initialPages.map((p) =>
        createOutlinePage({ title: p.title, content: p.content }),
      );
    }
    return [createOutlinePage()];
  });

  const updatePage = (id: string, patch: Partial<OutlinePage>) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );
  };

  const removePage = (id: string) => {
    setPages((prev) => {
      if (prev.length <= 1) {
        return [createOutlinePage()];
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const validPages = pages.filter((p) => p.title.trim() || p.content.trim());
  const canNext = validPages.length > 0;

  return (
    <PptWizardLayout
      title={title}
      subtitle={subtitle}
      onBack={onBack}
      onNext={() => onNext(validPages)}
      nextDisabled={!canNext}
      nextLabel={nextLabel}
      nextCost={validPages.length * 200}
      contentClassName="max-w-[720px]"
    >
      <p className="mb-3 text-xs text-slate-500">每页 200 积分为预估报价，实际按后端图片模型计费；失败重试会提交新的生成请求。</p>
      <div className="mb-3">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-[#1f2430] transition hover:bg-slate-50"
          onClick={() => setPages((prev) => [...prev, createOutlinePage()])}
        >
          添加页面
        </button>
      </div>

      <div className="space-y-4">
        {pages.map((page, index) => (
          <div
            key={page.id}
            className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_4px_16px_rgba(15,23,42,0.04)] sm:p-4"
          >
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="mt-2 flex shrink-0 items-center gap-1 text-slate-400">
                <GripVertical className="h-4 w-4" />
                <span className="hidden text-xs font-medium text-slate-500 sm:inline">
                  第{index + 1}页
                </span>
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-medium text-slate-500 sm:hidden">
                    第{index + 1}页
                  </span>
                  <input
                    value={page.title}
                    onChange={(e) =>
                      updatePage(page.id, { title: e.target.value })
                    }
                    placeholder="请输入标题"
                    className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#1f2430] outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                    onClick={() =>
                      updatePage(page.id, { collapsed: !page.collapsed })
                    }
                    aria-label={page.collapsed ? "展开" : "收起"}
                  >
                    <ChevronUp
                      className={cn(
                        "h-4 w-4 transition",
                        page.collapsed && "rotate-180",
                      )}
                    />
                  </button>
                  {showImageAction ? (
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600"
                      aria-label="添加图片"
                      title="添加图片（即将开放）"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500"
                    onClick={() => removePage(page.id)}
                    aria-label="删除页面"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {!page.collapsed ? (
                  <textarea
                    value={page.content}
                    onChange={(e) =>
                      updatePage(page.id, { content: e.target.value })
                    }
                    placeholder="请输入内容"
                    rows={5}
                    className="min-h-[120px] w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 text-[#1f2430] outline-none placeholder:text-slate-400 focus:border-slate-400"
                  />
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </PptWizardLayout>
  );
}
