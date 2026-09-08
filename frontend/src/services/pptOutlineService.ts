import { fetchWithAuth } from "./authFetch";

export type PptOutlinePageInput = {
  title: string;
  content: string;
};

export type PptOutlineGenerateResult = {
  pages: PptOutlinePageInput[];
};

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL &&
  import.meta.env.VITE_API_BASE_URL.trim().length > 0
    ? import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "")
    : "http://localhost:4000") + "/api";

export async function generatePptOutline(
  prompt: string,
): Promise<PptOutlineGenerateResult> {
  const response = await fetchWithAuth(`${API_BASE_URL}/ai/ppt/outline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: prompt.trim() }),
  });

  if (!response.ok) {
    let message = `大纲生成失败 (${response.status})`;
    try {
      const data = await response.json();
      const raw = data?.message || data?.error || data?.detail;
      if (typeof raw === "string" && raw.trim()) message = raw.trim();
      else if (Array.isArray(raw) && raw[0]) message = String(raw[0]);
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = (await response.json()) as PptOutlineGenerateResult;
  const pages = Array.isArray(data?.pages)
    ? data.pages
        .map((p) => ({
          title: String(p?.title || "").trim(),
          content: String(p?.content || "").trim(),
        }))
        .filter((p) => p.title || p.content)
    : [];

  if (!pages.length) {
    throw new Error("未生成有效大纲，请重试");
  }

  return { pages };
}
