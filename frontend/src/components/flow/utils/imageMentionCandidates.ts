import type { Edge, Node } from "reactflow";
import { dedupeImageMentionItems, type ImageMentionItem } from "@/utils/imageMentions";

type GetNode = (id: string) => Node | undefined;

const normalizeString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const getStringAt = (value: unknown, index: number): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  return normalizeString(value[index]);
};

export const isFlowImageInputHandle = (handle?: string | null): boolean => {
  if (!handle) return false;
  return (
    handle === "img" ||
    handle === "image" ||
    handle === "image-2" ||
    /^img\d+$/.test(handle) ||
    /^image\d+$/.test(handle)
  );
};

const isFlowTextPromptInputHandle = (handle?: string | null): boolean =>
  handle === "text" || handle === "prompt";

export const readFlowNodeImageForMention = (
  node: Node | undefined,
  sourceHandle?: string | null
): string | undefined => {
  if (!node) return undefined;
  const data = (node.data ?? {}) as Record<string, unknown>;
  const handle = typeof sourceHandle === "string" ? sourceHandle : "";

  if (
    node.type === "generate4" ||
    node.type === "generatePro4" ||
    node.type === "midjourneyV7" ||
    node.type === "niji7"
  ) {
    const match = /^img(\d+)$/.exec(handle);
    const index = match ? Math.max(0, Number(match[1]) - 1) : 0;
    return (
      getStringAt(data.imageUrls, index) ||
      getStringAt(data.images, index) ||
      getStringAt(data.thumbnails, index) ||
      normalizeString(data.imageUrl) ||
      normalizeString(data.imageData)
    );
  }

  if (node.type === "imageSplit") {
    const match = /^image(\d+)$/.exec(handle);
    const index = match ? Math.max(0, Number(match[1]) - 1) : 0;
    const splitImages = Array.isArray(data.splitImages) ? data.splitImages : [];
    const legacy = splitImages[index];
    if (legacy && typeof legacy === "object") {
      const legacyRecord = legacy as Record<string, unknown>;
      const legacyValue =
        normalizeString(legacyRecord.imageUrl) ||
        normalizeString(legacyRecord.imageData);
      if (legacyValue) return legacyValue;
    }
    return normalizeString(data.inputImageUrl) || normalizeString(data.inputImage);
  }

  return (
    normalizeString(data.imageUrl) ||
    normalizeString(data.imageData) ||
    normalizeString(data.outputImage) ||
    normalizeString(data.inputImageUrl) ||
    normalizeString(data.inputImage) ||
    normalizeString(data.thumbnail)
  );
};

const getEdgeLabel = (node: Node | undefined, edge: Edge, index: number): string => {
  const data = (node?.data ?? {}) as Record<string, unknown>;
  const title =
    normalizeString(data.title) ||
    normalizeString(data.fileName) ||
    normalizeString(data.prompt) ||
    node?.type ||
    "图片";
  const handle = edge.sourceHandle ? ` ${edge.sourceHandle}` : "";
  return `${title}${handle || ` ${index + 1}`}`;
};

export const collectTargetNodeImageMentionItems = (
  targetNodeId: string,
  edges: Edge[],
  getNode: GetNode
): ImageMentionItem[] => {
  const imageEdges = edges.filter(
    (edge) => edge.target === targetNodeId && isFlowImageInputHandle(edge.targetHandle)
  );

  const items: ImageMentionItem[] = [];
  imageEdges.forEach((edge, index) => {
    const sourceNode = getNode(edge.source);
    const url = readFlowNodeImageForMention(sourceNode, edge.sourceHandle);
    if (!url) return;
    items.push({
      id: `flow-edge:${edge.id}`,
      label: getEdgeLabel(sourceNode, edge, index),
      url,
      thumbnailUrl: url,
    });
  });

  return dedupeImageMentionItems(items);
};

export const collectPromptNodeImageMentionItems = (
  promptNodeId: string,
  edges: Edge[],
  getNode: GetNode
): ImageMentionItem[] => {
  const downstreamTargets = new Set(
    edges
      .filter(
        (edge) =>
          edge.source === promptNodeId &&
          isFlowTextPromptInputHandle(edge.targetHandle)
      )
      .map((edge) => edge.target)
  );
  const items: ImageMentionItem[] = [];
  downstreamTargets.forEach((targetId) => {
    items.push(...collectTargetNodeImageMentionItems(targetId, edges, getNode));
  });
  return dedupeImageMentionItems(items);
};
