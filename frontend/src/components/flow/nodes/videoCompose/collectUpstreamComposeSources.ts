import type { Edge, Node, ReactFlowState } from "reactflow";

import { proxifyRemoteAssetUrl, resolvePublicAssetUrlFromKey } from "@/utils/assetProxy";
import { isAssetKeyRef, isRemoteUrl } from "@/utils/imageSource";

import type {
  VideoComposeAudioTrack,
  VideoComposeSource,
  VideoComposeUpstream,
} from "./types";

type FlowNodeLike = Node<Record<string, any>>;
type FlowStateLike = Pick<ReactFlowState, "edges"> & {
  getNodes?: () => FlowNodeLike[];
  nodes?: FlowNodeLike[];
  nodeLookup?: Map<string, FlowNodeLike>;
};

const VIDEO_SOURCE_NODE_TYPES = new Set([
  "video",
  "sora2Video",
  "happyhorseR2V",
  "wan27Video",
  "klingVideo",
  "kling26Video",
  "kling30Video",
  "klingO1Video",
  "viduVideo",
  "viduQ3",
  "doubaoVideo",
  "seedance20Video",
  "omniFlashExtVideo",
]);

const AUDIO_SOURCE_NODE_TYPES = new Set(["audioUpload"]);

const sanitize = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const sanitizeNumber = (value: unknown): number | undefined => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const toPreviewableMediaUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (isRemoteUrl(value)) {
    return proxifyRemoteAssetUrl(value);
  }
  if (isAssetKeyRef(value)) {
    const key = value.replace(/^\/+/, "");
    return (
      resolvePublicAssetUrlFromKey(key) ??
      proxifyRemoteAssetUrl(`/api/assets/proxy?key=${encodeURIComponent(key)}`, {
        forceProxy: true,
      })
    );
  }
  if (value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return value;
  }
  return undefined;
};

const pickNodeLabel = (node?: FlowNodeLike | null): string | undefined => {
  if (!node) return undefined;
  return (
    sanitize(node.data?.label) ??
    sanitize(node.data?.title) ??
    sanitize(node.data?.videoName) ??
    sanitize(node.data?.audioName)
  );
};

const pickThumbnailUrl = (node?: FlowNodeLike | null): string | undefined => {
  if (!node) return undefined;
  const data = node.data ?? {};
  const candidates = [
    data.thumbnail,
    data.thumbnailUrl,
    data.poster,
    data.coverUrl,
    data.result?.thumbnailUrl,
    data.output?.thumbnailUrl,
  ];
  for (const candidate of candidates) {
    const trimmed = sanitize(candidate);
    if (!trimmed) continue;
    const previewable = toPreviewableMediaUrl(trimmed);
    if (previewable) return previewable;
  }
  return undefined;
};

const pickPrimaryUrlFromList = (value: unknown): string | undefined => {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (typeof item === "string") {
      const hit = sanitize(item);
      if (hit) return hit;
      continue;
    }
    if (item && typeof item === "object") {
      const maybeObject = item as Record<string, unknown>;
      const nestedCandidates = [
        maybeObject.videoUrl,
        maybeObject.video_url,
        maybeObject.url,
        maybeObject.audioUrl,
        maybeObject.audio_url,
      ];
      for (const nested of nestedCandidates) {
        const hit = sanitize(nested);
        if (hit) return hit;
      }
    }
  }
  return undefined;
};

const pickVideoUrl = (node?: FlowNodeLike | null): string | undefined => {
  if (!node || !VIDEO_SOURCE_NODE_TYPES.has(String(node.type || ""))) return undefined;
  const data = node.data ?? {};
  const candidates = [
    data.videoUrl,
    data.outputVideoUrl,
    data.videoResults,
    data.videoUrls,
  ];
  for (const candidate of candidates) {
    const direct = sanitize(candidate);
    if (direct) return direct;
    const fromList = pickPrimaryUrlFromList(candidate);
    if (fromList) return fromList;
  }
  return undefined;
};

const pickAudioTrack = (node?: FlowNodeLike | null): VideoComposeAudioTrack | undefined => {
  if (!node) return undefined;
  if (!AUDIO_SOURCE_NODE_TYPES.has(String(node.type || "")) && !VIDEO_SOURCE_NODE_TYPES.has(String(node.type || ""))) {
    return undefined;
  }

  const data = node.data ?? {};
  const url =
    sanitize(data.audioUrl) ??
    pickPrimaryUrlFromList(data.audioUrls) ??
    sanitize(data.output?.audioUrl) ??
    sanitize(data.result?.audioUrl);
  if (!url) return undefined;

  return {
    url,
    title: pickNodeLabel(node),
    volume: sanitizeNumber(data.volume) ?? 1,
    loop: typeof data.loop === "boolean" ? data.loop : true,
    enabled: true,
  };
};

const resolveNodes = (state: FlowStateLike): FlowNodeLike[] => {
  if (typeof state.getNodes === "function") return state.getNodes();
  if (Array.isArray(state.nodes)) return state.nodes;
  if (state.nodeLookup instanceof Map) return Array.from(state.nodeLookup.values());
  return [];
};

const sortVideoEdges = (edges: Edge[], nodes: Map<string, FlowNodeLike>) =>
  [...edges].sort((a, b) => {
    const left = nodes.get(a.source);
    const right = nodes.get(b.source);
    const leftX = Number(left?.position?.x ?? 0);
    const rightX = Number(right?.position?.x ?? 0);
    if (leftX !== rightX) return leftX - rightX;
    const leftY = Number(left?.position?.y ?? 0);
    const rightY = Number(right?.position?.y ?? 0);
    return leftY - rightY;
  });

export function collectUpstreamComposeSources(
  nodeId: string,
  state: FlowStateLike
): VideoComposeUpstream {
  const nodes = resolveNodes(state);
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const videoEdges = sortVideoEdges(
    state.edges.filter(
      (edge) =>
        edge.target === nodeId &&
        typeof edge.targetHandle === "string" &&
        edge.targetHandle.startsWith("video")
    ),
    nodeMap
  );

  const videos: VideoComposeSource[] = [];
  for (const edge of videoEdges) {
    const sourceNode = nodeMap.get(edge.source);
    const url = pickVideoUrl(sourceNode);
    if (!url) continue;
    videos.push({
      id: `${sourceNode?.id ?? edge.source}:${videos.length}`,
      url,
      trimStart: 0,
      trimEnd: Number.MAX_SAFE_INTEGER,
      title: pickNodeLabel(sourceNode) ?? `Clip ${videos.length + 1}`,
      thumbnailUrl: pickThumbnailUrl(sourceNode),
    });
  }

  const audioEdge = state.edges.find(
    (edge) =>
      edge.target === nodeId &&
      typeof edge.targetHandle === "string" &&
      edge.targetHandle === "audio"
  );

  const audio = audioEdge ? pickAudioTrack(nodeMap.get(audioEdge.source)) : undefined;
  return { videos, audio };
}
