export type ImageMentionItem = {
  id: string;
  label: string;
  url: string;
  thumbnailUrl?: string;
};

export type ImageMentionQuery = {
  start: number;
  end: number;
  query: string;
};

export type ImageMentionReference = {
  id: string;
  label: string;
  item?: ImageMentionItem;
};

export type ImageMentionSegment =
  | { type: "text"; text: string; start: number; end: number }
  | {
      type: "mention";
      id: string;
      label: string;
      item?: ImageMentionItem;
      start: number;
      end: number;
    };

const IMAGE_MENTION_PREFIX = "tai-image:";
const IMAGE_MENTION_PREFIX_RE = "(?:tai|tanva)-image:";
const IMAGE_MENTION_RE = new RegExp(
  `@\\[([^\\]]+)\\]\\(${IMAGE_MENTION_PREFIX_RE}([^)]+)\\)`,
  "g"
);

const normalizeLabel = (value: string): string => {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 0 ? trimmed : "图片";
};

export const createImageMentionToken = (item: Pick<ImageMentionItem, "id" | "label">): string =>
  `@[${normalizeLabel(item.label)}](${IMAGE_MENTION_PREFIX}${encodeURIComponent(item.id)})`;

export const stripImageMentionTokens = (text: string): string =>
  text.replace(IMAGE_MENTION_RE, (_full, label) => `@${normalizeLabel(String(label))}`).trim();

export const removeImageMentionTokens = (text: string): string =>
  text
    .replace(/\s*@\[[^\]]+\]\((?:tai|tanva)-image:[^)]+\)\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();

export const parseImageMentionIds = (text: string): string[] => {
  const ids: string[] = [];
  for (const match of text.matchAll(IMAGE_MENTION_RE)) {
    const raw = match[2];
    if (!raw) continue;
    try {
      ids.push(decodeURIComponent(raw));
    } catch {
      ids.push(raw);
    }
  }
  return Array.from(new Set(ids));
};

export const resolveImageMentionUrls = (
  text: string,
  items: ImageMentionItem[]
): string[] => {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return parseImageMentionIds(text)
    .map((id) => itemById.get(id)?.url?.trim())
    .filter((url): url is string => Boolean(url));
};

export const getImageMentionReferences = (
  text: string,
  items: ImageMentionItem[]
): ImageMentionReference[] =>
  getImageMentionSegments(text, items)
    .filter(
      (segment): segment is Extract<ImageMentionSegment, { type: "mention" }> =>
        segment.type === "mention"
    )
    .map((segment) => ({
      id: segment.id,
      label: segment.label,
      item: segment.item,
    }));

export const getImageMentionSegments = (
  text: string,
  items: ImageMentionItem[]
): ImageMentionSegment[] => {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const segments: ImageMentionSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(IMAGE_MENTION_RE)) {
    const full = match[0];
    const label = normalizeLabel(String(match[1] || ""));
    const rawId = String(match[2] || "");
    const start = match.index ?? -1;
    if (start < 0) continue;
    if (start > lastIndex) {
      segments.push({
        type: "text",
        text: text.slice(lastIndex, start),
        start: lastIndex,
        end: start,
      });
    }
    let id = rawId;
    try {
      id = decodeURIComponent(rawId);
    } catch {
      id = rawId;
    }
    segments.push({
      type: "mention",
      id,
      label,
      item: itemById.get(id),
      start,
      end: start + full.length,
    });
    lastIndex = start + full.length;
  }

  if (lastIndex < text.length) {
    segments.push({
      type: "text",
      text: text.slice(lastIndex),
      start: lastIndex,
      end: text.length,
    });
  }

  return segments.length
    ? segments
    : [{ type: "text", text, start: 0, end: text.length }];
};

const getMentionSegmentsFromText = (
  text: string
): Extract<ImageMentionSegment, { type: "mention" }>[] =>
  getImageMentionSegments(text, []).filter(
    (segment): segment is Extract<ImageMentionSegment, { type: "mention" }> =>
      segment.type === "mention"
  );

export const getImageMentionQuery = (
  value: string,
  cursor: number | null | undefined
): ImageMentionQuery | null => {
  if (typeof cursor !== "number" || cursor < 0) return null;
  const beforeCursor = value.slice(0, cursor);
  let searchFrom = beforeCursor.length - 1;
  while (searchFrom >= 0) {
    const at = beforeCursor.lastIndexOf("@", searchFrom);
    if (at < 0) return null;
    const query = beforeCursor.slice(at + 1);
    if (
      query.length <= 40 &&
      !/[\r\n()[\]{}]/.test(query) &&
      !/\s/.test(query)
    ) {
      return { start: at, end: cursor, query: query.trim() };
    }
    searchFrom = at - 1;
  }
  return null;
};

export const insertImageMentionToken = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  query: ImageMentionQuery | null,
  item: ImageMentionItem
): { value: string; cursor: number } => {
  const token = `${createImageMentionToken(item)} `;
  const start = query?.start ?? selectionStart;
  const end = query?.end ?? selectionEnd;
  const nextValue = `${value.slice(0, start)}${token}${value.slice(end)}`;
  return { value: nextValue, cursor: start + token.length };
};

export const removeImageMentionQueryText = (
  value: string,
  query: ImageMentionQuery | null,
  selectionStart: number,
  selectionEnd: number
): { value: string; cursor: number } => {
  const start = query?.start ?? selectionStart;
  const end = query?.end ?? selectionEnd;
  return {
    value: `${value.slice(0, start)}${value.slice(end)}`,
    cursor: start,
  };
};

export const composeTextWithImageMentions = (
  text: string,
  mentions: Array<Pick<ImageMentionReference, "id" | "label">>
): string => {
  const normalizedText = text.trim();
  const uniqueMentions = Array.from(
    new Map(
      mentions
        .filter((mention) => mention.id && mention.label)
        .map((mention) => [
          mention.id,
          { id: mention.id, label: normalizeLabel(mention.label) },
        ])
    ).values()
  );
  const mentionText = uniqueMentions
    .map((mention) => createImageMentionToken(mention))
    .join(" ");
  if (!normalizedText) return mentionText;
  if (!mentionText) return normalizedText;
  return `${normalizedText}\n${mentionText}`;
};

export const removeImageMentionToken = (
  value: string,
  mention: Pick<ImageMentionSegment & { type: "mention" }, "start" | "end">
): { value: string; cursor: number } => {
  let start = mention.start;
  let end = mention.end;

  if (value[end] === " ") {
    end += 1;
  } else if (start > 0 && value[start - 1] === " " && (end >= value.length || /\s/.test(value[end] || ""))) {
    start -= 1;
  }

  return {
    value: `${value.slice(0, start)}${value.slice(end)}`,
    cursor: start,
  };
};

export const snapImageMentionCursor = (
  value: string,
  cursor: number | null | undefined
): number | null => {
  if (typeof cursor !== "number" || cursor < 0) return null;
  const mention = getMentionSegmentsFromText(value).find(
    (segment) => cursor > segment.start && cursor < segment.end
  );
  return mention ? mention.end : cursor;
};

export const normalizeImageMentionSelection = (
  value: string,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined
): { start: number; end: number } | null => {
  if (typeof selectionStart !== "number" || typeof selectionEnd !== "number") {
    return null;
  }
  const mentions = getMentionSegmentsFromText(value);
  if (selectionStart === selectionEnd) {
    const safeCursor = snapImageMentionCursor(value, selectionStart);
    return {
      start: safeCursor ?? selectionStart,
      end: safeCursor ?? selectionEnd,
    };
  }

  const blockedMention = mentions.find(
    (segment) => selectionStart < segment.end && selectionEnd > segment.start
  );
  if (blockedMention) {
    const cursor =
      selectionStart <= blockedMention.start
        ? blockedMention.start
        : blockedMention.end;
    return { start: cursor, end: cursor };
  }

  return { start: selectionStart, end: selectionEnd };
};

export const doesSelectionTouchImageMention = (
  value: string,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined
): boolean => {
  if (typeof selectionStart !== "number" || typeof selectionEnd !== "number") {
    return false;
  }
  return getMentionSegmentsFromText(value).some(
    (segment) => selectionStart < segment.end && selectionEnd > segment.start
  );
};

export const shouldBlockImageMentionDeletion = (
  value: string,
  selectionStart: number | null | undefined,
  selectionEnd: number | null | undefined,
  key: "Backspace" | "Delete"
): boolean => {
  if (typeof selectionStart !== "number" || typeof selectionEnd !== "number") {
    return false;
  }
  const mentions = getMentionSegmentsFromText(value);
  if (!mentions.length) return false;

  if (selectionStart !== selectionEnd) {
    return mentions.some(
      (segment) => selectionStart < segment.end && selectionEnd > segment.start
    );
  }

  if (key === "Backspace") {
    return mentions.some(
      (segment) =>
        selectionStart > segment.start && selectionStart <= segment.end
    );
  }

  return mentions.some(
    (segment) =>
      selectionStart >= segment.start && selectionStart < segment.end
  );
};

export const filterImageMentionItems = (
  items: ImageMentionItem[],
  query: string,
  limit = 8
): ImageMentionItem[] => {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? items.filter((item) => item.label.toLowerCase().includes(normalizedQuery))
    : items;
  return filtered.slice(0, limit);
};

export const dedupeImageMentionItems = (items: ImageMentionItem[]): ImageMentionItem[] => {
  const seen = new Set<string>();
  const out: ImageMentionItem[] = [];
  for (const item of items) {
    const id = item.id?.trim();
    const url = item.url?.trim();
    if (!id || !url || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...item, id, url, label: normalizeLabel(item.label) });
  }
  return out;
};
