/**
 * System prompt 装载器 —— 读取 prompts/system-prompt.md 代码块内的 prompt 本体，
 * 注入 {{BRIEF_JSON}} 与 {{RECENT_ASSETS}} 动态占位符（DESIGN.md §7.1）。
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { DesignBrief } from "../shared/brief.js";
import type { Asset } from "../shared/assets.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPT_FILE = join(HERE, "..", "..", "prompts", "system-prompt.md");

/** 提取 markdown 中第一个 ``` 围栏内的 prompt 本体 */
export function loadSystemPromptTemplate(): string {
  const raw = readFileSync(PROMPT_FILE, "utf-8");
  const m = raw.match(/```[a-z]*\r?\n([\s\S]*?)\r?\n```/);
  if (!m) throw new Error(`system prompt 文件格式错误：未找到围栏代码块 (${PROMPT_FILE})`);
  return m[1]!;
}

export function buildSystemPrompt(template: string, brief: DesignBrief, recentAssets: Asset[]): string {
  const briefJson = JSON.stringify(brief, null, 0);
  const assetsText =
    recentAssets.length === 0
      ? "（暂无）"
      : recentAssets
          .map(
            (a) =>
              `- ${a.id} | ${a.kind} | ${a.operation} | ${a.url}` +
              (a.parentIds.length ? ` | 源自 ${a.parentIds.join(",")}` : ""),
          )
          .join("\n");
  return template
    .replaceAll("{{BRIEF_JSON}}", briefJson)
    .replaceAll("{{RECENT_ASSETS}}", assetsText);
}
