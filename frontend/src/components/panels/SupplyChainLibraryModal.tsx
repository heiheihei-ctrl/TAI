import React from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  Search,
  X,
} from "lucide-react";
import { useUIStore } from "@/stores";
import { isLinglongRestrictedPalette } from "@/config/linglongPalette";
import { useLocaleText } from "@/utils/localeText";
import { cn } from "@/lib/utils";

type GalleryTab = "public" | "personal";

type SupplyChainGalleryItem = {
  id: string;
  name: string;
  scene: string;
  scope: GalleryTab;
};

const SCENE_OPTIONS = ["场景1", "场景2", "场景3", "场景4", "场景5"] as const;
const PAGE_SIZE_OPTIONS = [9, 18, 27] as const;
const TOTAL_MOCK_ITEMS = 128;

function buildMockGalleries(): SupplyChainGalleryItem[] {
  return Array.from({ length: TOTAL_MOCK_ITEMS }, (_, index) => {
    const n = index + 1;
    const scene = SCENE_OPTIONS[index % SCENE_OPTIONS.length];
    return {
      id: `supply-chain-gallery-${n}`,
      name: `供应商风景图库 ${String(n).padStart(2, "0")}`,
      scene,
      scope: index % 7 === 0 ? "personal" : "public",
    };
  });
}

const ALL_GALLERIES = buildMockGalleries();

function pageNumbers(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("ellipsis");
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

const SupplyChainLibraryModal: React.FC = () => {
  const { lt } = useLocaleText();
  const isOpen = useUIStore((s) => s.showSupplyChainLibrary);
  const setOpen = useUIStore((s) => s.setShowSupplyChainLibrary);

  const [tab, setTab] = React.useState<GalleryTab>("public");
  const [scene, setScene] = React.useState<string>(SCENE_OPTIONS[0]);
  const [keywordInput, setKeywordInput] = React.useState("");
  const [keyword, setKeyword] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState<(typeof PAGE_SIZE_OPTIONS)[number]>(9);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const isLinglong = isLinglongRestrictedPalette();
  // 与入口按钮同步：临时关闭时强制收起弹窗
  const entryEnabled = false;

  React.useEffect(() => {
    if ((!isLinglong || !entryEnabled) && isOpen) setOpen(false);
  }, [isLinglong, entryEnabled, isOpen, setOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, setOpen]);

  React.useEffect(() => {
    setPage(1);
  }, [tab, scene, keyword, pageSize]);

  const filtered = React.useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return ALL_GALLERIES.filter((item) => {
      if (item.scope !== tab) return false;
      if (scene && item.scene !== scene) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tab, scene, keyword]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSearch = () => {
    setKeyword(keywordInput.trim());
  };

  const handleReset = () => {
    setKeywordInput("");
    setKeyword("");
    setScene(SCENE_OPTIONS[0]);
    setPage(1);
  };

  const handleSelect = (item: SupplyChainGalleryItem) => {
    setSelectedId(item.id);
    try {
      window.dispatchEvent(
        new CustomEvent("toast", {
          detail: {
            message: lt(`已选择：${item.name}`, `Selected: ${item.name}`),
            type: "success",
          },
        })
      );
    } catch {
      // ignore
    }
  };

  if (!entryEnabled || !isLinglong || !isOpen) return null;

  const content = (
    <div className="pointer-events-none fixed inset-0 z-[1100] flex items-start justify-end p-4 pt-[72px] pb-6 sm:p-6 sm:pt-[80px]">
      <div
        className="pointer-events-auto flex h-full max-h-[calc(100vh-96px)] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-[#E8EBF0] bg-white shadow-[0_18px_48px_rgba(15,23,42,0.14)]"
        role="dialog"
        aria-modal="true"
        aria-label={lt("供应链图库", "Supply Chain Gallery")}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#EEF1F5] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[18px] font-semibold text-[#1F2937]">
                {lt("供应链图库", "Supply Chain Gallery")}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF8E8] px-2 py-0.5 text-[11px] font-medium text-[#B7791F]">
                <Crown className="h-3 w-3" />
                {lt("玲珑生态会员专属", "Linglong members only")}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#6B7280] transition hover:bg-[#F3F4F6] hover:text-[#111827]"
            onClick={() => setOpen(false)}
            aria-label={lt("关闭", "Close")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-6 border-b border-[#EEF1F5]">
            {(
              [
                { id: "public" as const, label: lt("公共图库", "Public Gallery") },
                {
                  id: "personal" as const,
                  label: lt("玲珑个人图库", "Linglong Personal Gallery"),
                },
              ] as const
            ).map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={cn(
                    "-mb-px border-b-2 pb-2 text-sm font-medium transition",
                    active
                      ? "border-[#2563EB] text-[#2563EB]"
                      : "border-transparent text-[#6B7280] hover:text-[#374151]"
                  )}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            {SCENE_OPTIONS.map((option) => {
              const active = scene === option;
              return (
                <button
                  key={option}
                  type="button"
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                    active
                      ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]"
                      : "border-[#E5E7EB] bg-white text-[#4B5563] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"
                  )}
                  onClick={() => setScene(option)}
                >
                  {option}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9CA3AF]" />
              <input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSearch();
                }}
                placeholder={lt("搜索图库名称", "Search gallery name")}
                className="h-10 w-full rounded-lg border border-[#E5E7EB] bg-white pl-9 pr-3 text-sm text-[#111827] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-10 rounded-lg px-3 text-sm text-[#6B7280] transition hover:bg-[#F3F4F6] hover:text-[#111827]"
                onClick={handleReset}
              >
                {lt("重置", "Reset")}
              </button>
              <button
                type="button"
                className="h-10 rounded-lg bg-[#2563EB] px-4 text-sm font-medium text-white transition hover:bg-[#1D4ED8]"
                onClick={handleSearch}
              >
                {lt("搜索", "Search")}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pageItems.map((item) => {
              const selected = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item)}
                  className={cn(
                    "overflow-hidden rounded-xl border bg-white text-left transition",
                    selected
                      ? "border-[#2563EB] shadow-[0_0_0_1px_#2563EB]"
                      : "border-[#E5E7EB] hover:border-[#93C5FD] hover:shadow-md"
                  )}
                >
                  <div className="aspect-[4/3] bg-gradient-to-br from-[#DBEAFE] via-[#E0F2FE] to-[#F0F9FF]" />
                  <div className="truncate px-3 py-2.5 text-sm font-medium text-[#1F2937]">
                    {item.name}
                  </div>
                </button>
              );
            })}
            {pageItems.length === 0 && (
              <div className="col-span-full rounded-xl border border-dashed border-[#E5E7EB] px-4 py-12 text-center text-sm text-[#9CA3AF]">
                {lt("暂无匹配的图库", "No matching galleries")}
              </div>
            )}
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-3 border-t border-[#EEF1F5] px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-[#6B7280]">
            {lt(`共 ${total} 条`, `${total} items`)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E7EB] text-[#6B7280] disabled:opacity-40"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label={lt("上一页", "Previous page")}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            {pageNumbers(safePage, totalPages).map((item, index) =>
              item === "ellipsis" ? (
                <span key={`e-${index}`} className="px-1 text-xs text-[#9CA3AF]">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 text-xs font-medium",
                    item === safePage
                      ? "bg-[#2563EB] text-white"
                      : "border border-[#E5E7EB] text-[#4B5563] hover:bg-[#F9FAFB]"
                  )}
                  onClick={() => setPage(item)}
                >
                  {item}
                </button>
              )
            )}
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#E5E7EB] text-[#6B7280] disabled:opacity-40"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label={lt("下一页", "Next page")}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <select
              value={pageSize}
              onChange={(e) =>
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
              }
              className="h-8 rounded-md border border-[#E5E7EB] bg-white px-2 text-xs text-[#4B5563] outline-none"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {lt(`${size}条/页`, `${size} / page`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
};

export default SupplyChainLibraryModal;
