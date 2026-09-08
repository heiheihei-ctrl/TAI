import type { PptOutlinePageInput } from "@/services/pptOutlineService";

const STORAGE_KEY = "tanva.ppt.outline.draft";

export function persistPptOutlineDraft(
  pages: PptOutlinePageInput[],
  prompt?: string,
) {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ pages, prompt: prompt || "" }),
    );
  } catch {
    // ignore quota
  }
}

export function readPptOutlineDraft(): {
  pages: PptOutlinePageInput[];
  prompt?: string;
} | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      pages?: PptOutlinePageInput[];
      prompt?: string;
    };
    if (!Array.isArray(parsed?.pages) || !parsed.pages.length) return null;
    return { pages: parsed.pages, prompt: parsed.prompt };
  } catch {
    return null;
  }
}
