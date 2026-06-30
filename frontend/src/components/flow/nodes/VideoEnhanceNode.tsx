import React from "react";
import { Download, History } from "lucide-react";
import {
  Handle,
  Position,
  useStore,
  type Node,
  type ReactFlowState,
} from "reactflow";
import FlowResizableNodeShell from "./FlowResizableNodeShell";
import GenerationProgressBar from "./GenerationProgressBar";
import RunCreditBadge from "./RunCreditBadge";
import { proxifyRemoteAssetUrl } from "@/utils/assetProxy";
import { useLocaleText } from "@/utils/localeText";
import { useNodeRunCredits } from "../hooks/useNodeRunCredits";
import { useVideoEnhanceCreditsPreview } from "../hooks/useVideoEnhanceCreditsPreview";
import { useVideoEnhancePolling } from "../hooks/useVideoEnhancePolling";
import {
  VIDEO_ENHANCE_FPS_RANGE,
  VIDEO_ENHANCE_HISTORY_LIMIT,
  VIDEO_ENHANCE_LIMIT_RANGE,
  VIDEO_ENHANCE_RESOLUTIONS,
  VIDEO_ENHANCE_SCENES,
  VIDEO_ENHANCE_TOOL_VERSIONS,
} from "@/constants/videoEnhance";
import type {
  CreateVideoEnhanceTaskRequest,
  VideoEnhanceNodeData,
  VideoEnhanceTaskHistoryItem,
} from "@/types/videoEnhance";
import { createVideoEnhanceTask } from "@/services/videoEnhanceAPI";

type Props = {
  id: string;
  data: VideoEnhanceNodeData;
  selected?: boolean;
};

const DEFAULT_DATA: Required<
  Pick<
    VideoEnhanceNodeData,
    "toolVersion" | "scene" | "resolutionMode" | "resolution" | "resolutionLimit"
  >
> = {
  toolVersion: "standard",
  scene: "aigc",
  resolutionMode: "preset",
  resolution: "1080p",
  resolutionLimit: 1080,
};
const LEGACY_NODE_HEIGHT = 536;
const COMPACT_NODE_HEIGHT = 472;

const sanitizeMediaUrl = (raw?: string | null): string | undefined => {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
};

const resolveVideoUrlFromNode = (node?: Node<any> | null): string | undefined => {
  if (!node) return undefined;
  const nodeData = (node.data ?? {}) as Record<string, any>;
  const candidates = [
    nodeData.videoUrl,
    nodeData.video_url,
    nodeData.outputVideoUrl,
    nodeData.result?.videoUrl,
    nodeData.output?.videoUrl,
    nodeData.output?.video_url,
    nodeData.inputVideoUrl,
    Array.isArray(nodeData.history) ? nodeData.history[0]?.videoUrl : undefined,
  ];

  for (const candidate of candidates) {
    const normalized = sanitizeMediaUrl(candidate);
    if (normalized) return normalized;
  }
  return undefined;
};

const buildVideoSources = (url?: string) => {
  if (!url) return [];
  const direct = url;
  const proxied = proxifyRemoteAssetUrl(url, { forceProxy: true });
  return Array.from(new Set([direct, proxied].filter(Boolean)));
};

const updateNodeData = (id: string, patch: Record<string, any>) => {
  window.dispatchEvent(
    new CustomEvent("flow:updateNodeData", {
      detail: { id, patch },
    })
  );
};

export default function VideoEnhanceNode({ id, data, selected }: Props) {
  const { lt } = useLocaleText();
  const [showHistory, setShowHistory] = React.useState(false);
  const [inputVideoSourceIndex, setInputVideoSourceIndex] = React.useState(0);
  const [outputVideoSourceIndex, setOutputVideoSourceIndex] = React.useState(0);
  const legacyBoxHeight =
    typeof (data as { boxHeight?: unknown }).boxHeight === "number"
      ? ((data as { boxHeight?: number }).boxHeight ?? undefined)
      : undefined;

  const connectedVideoUrl = useStore(
    React.useCallback(
      (state: ReactFlowState) => {
        const edge = state.edges.find(
          (e) => e.target === id && e.targetHandle === "video"
        );
        if (!edge) return undefined;
        const sourceNode = state.getNodes().find((n: Node<any>) => n.id === edge.source);
        return resolveVideoUrlFromNode(sourceNode);
      },
      [id]
    )
  );

  const toolVersion = data.toolVersion || DEFAULT_DATA.toolVersion;
  const scene = data.scene || DEFAULT_DATA.scene;
  const resolutionMode = data.resolutionMode || DEFAULT_DATA.resolutionMode;
  const resolution = data.resolution || DEFAULT_DATA.resolution;
  const resolutionLimit =
    typeof data.resolutionLimit === "number"
      ? Math.min(
          VIDEO_ENHANCE_LIMIT_RANGE.max,
          Math.max(VIDEO_ENHANCE_LIMIT_RANGE.min, Math.round(data.resolutionLimit))
        )
      : DEFAULT_DATA.resolutionLimit;
  const fps =
    typeof data.fps === "number" &&
    Number.isFinite(data.fps) &&
    data.fps >= VIDEO_ENHANCE_FPS_RANGE.min &&
    data.fps <= VIDEO_ENHANCE_FPS_RANGE.max
      ? Math.round(data.fps)
      : undefined;

  const effectiveInputVideoUrl = connectedVideoUrl || data.inputVideoUrl;
  const inputVideoSources = React.useMemo(
    () => buildVideoSources(sanitizeMediaUrl(effectiveInputVideoUrl)),
    [effectiveInputVideoUrl]
  );
  const outputVideoSources = React.useMemo(
    () => buildVideoSources(sanitizeMediaUrl(data.videoUrl)),
    [data.videoUrl]
  );

  React.useEffect(() => {
    setInputVideoSourceIndex(0);
  }, [effectiveInputVideoUrl]);

  React.useEffect(() => {
    setOutputVideoSourceIndex(0);
  }, [data.videoUrl]);

  React.useEffect(() => {
    if (data.boxH === LEGACY_NODE_HEIGHT) {
      updateNodeData(id, { boxH: COMPACT_NODE_HEIGHT });
    }
    if (legacyBoxHeight === LEGACY_NODE_HEIGHT) {
      updateNodeData(id, { boxHeight: COMPACT_NODE_HEIGHT });
    }
  }, [data.boxH, id, legacyBoxHeight]);

  const inputVideoUrl = inputVideoSources[inputVideoSourceIndex] || inputVideoSources[0];
  const outputVideoUrl = outputVideoSources[outputVideoSourceIndex] || outputVideoSources[0];

  const { credits: previewCredits } = useVideoEnhanceCreditsPreview({
    toolVersion,
    scene,
    resolutionMode,
    resolution,
    resolutionLimit,
    fps,
  });
  const { credits: runCredits, hasCredits } = useNodeRunCredits(previewCredits);

  const appendHistory = React.useCallback(
    (item: VideoEnhanceTaskHistoryItem) => {
      const nextHistory = [item, ...(Array.isArray(data.history) ? data.history : [])].slice(
        0,
        VIDEO_ENHANCE_HISTORY_LIMIT
      );
      updateNodeData(id, { history: nextHistory });
    },
    [data.history, id]
  );

  const polling = useVideoEnhancePolling({
    onProgress: (patch) => updateNodeData(id, patch),
    onSucceeded: ({ result, processingTime }) => {
      const finishedAt = Date.now();
      updateNodeData(id, {
        status: "succeeded",
        error: undefined,
        progress: 100,
        taskId: result.taskId,
        videoUrl: result.videoUrl,
        upstreamStatus: result.upstreamStatus,
        processingTime,
        pendingTaskId: undefined,
        pendingApiUsageId: undefined,
        pendingStartMs: undefined,
      });
      appendHistory({
        id: `${result.taskId}:${finishedAt}`,
        taskId: result.taskId,
        apiUsageId: data.pendingApiUsageId || data.apiUsageId,
        status: "succeeded",
        inputVideoUrl: sanitizeMediaUrl(effectiveInputVideoUrl) || "",
        outputVideoUrl: result.videoUrl,
        createdAt: data.pendingStartMs || finishedAt,
        finishedAt,
        processingTime,
        toolVersion,
        scene,
        resolutionMode,
        resolution: resolutionMode === "preset" ? resolution : undefined,
        resolutionLimit: resolutionMode === "limit" ? resolutionLimit : undefined,
        fps,
      });
    },
    onFailed: ({ error, processingTime, timedOut }) => {
      const finishedAt = Date.now();
      updateNodeData(id, {
        status: "failed",
        error:
          timedOut
            ? lt("视频增强轮询超时，已触发退款", "Video enhance polling timed out and was refunded")
            : error,
        progress: undefined,
        pendingTaskId: undefined,
        pendingApiUsageId: undefined,
        pendingStartMs: undefined,
        processingTime,
      });
      appendHistory({
        id: `${data.pendingTaskId || data.taskId || "task"}:${finishedAt}`,
        taskId: data.pendingTaskId || data.taskId || "",
        apiUsageId: data.pendingApiUsageId || data.apiUsageId,
        status: timedOut ? "timeout" : "failed",
        inputVideoUrl: sanitizeMediaUrl(effectiveInputVideoUrl) || "",
        error,
        createdAt: data.pendingStartMs || finishedAt,
        finishedAt,
        processingTime,
        toolVersion,
        scene,
        resolutionMode,
        resolution: resolutionMode === "preset" ? resolution : undefined,
        resolutionLimit: resolutionMode === "limit" ? resolutionLimit : undefined,
        fps,
      });
    },
  });

  React.useEffect(() => {
    if (
      data.status !== "running" ||
      !data.pendingTaskId ||
      typeof data.pendingTaskId !== "string"
    ) {
      return;
    }
    if (
      typeof data.pendingStartMs === "number" &&
      Date.now() - data.pendingStartMs < 1000
    ) {
      return;
    }
    void polling.startPolling({
      taskId: data.pendingTaskId,
      apiUsageId: data.pendingApiUsageId,
    });
  }, [
    data.pendingStartMs,
    data.pendingApiUsageId,
    data.pendingTaskId,
    data.status,
    polling,
  ]);

  const handleRun = React.useCallback(async () => {
    const normalizedInput = sanitizeMediaUrl(effectiveInputVideoUrl);
    if (!normalizedInput) {
      updateNodeData(id, {
        status: "failed",
        error: lt("没有输入视频，请先连接上游视频节点", "Missing input video. Connect an upstream video node first."),
      });
      return false;
    }

    const request: CreateVideoEnhanceTaskRequest = {
      videoUrl: normalizedInput,
      toolVersion,
      scene,
      ...(resolutionMode === "preset"
        ? { resolution }
        : { resolutionLimit }),
      ...(typeof fps === "number" ? { fps } : {}),
    };

    updateNodeData(id, {
      status: "running",
      error: undefined,
      inputVideoUrl: normalizedInput,
      progress: 4,
      videoUrl: undefined,
      processingTime: undefined,
    });

    try {
      const createResult = await createVideoEnhanceTask(request);
      const pendingStartMs = Date.now();
      updateNodeData(id, {
        status: "running",
        taskId: createResult.taskId,
        apiUsageId: createResult.apiUsageId,
        pendingTaskId: createResult.taskId,
        pendingApiUsageId: createResult.apiUsageId,
        pendingStartMs,
        progress: createResult.status === "processing" ? 12 : 4,
      });
      await polling.startPolling({
        taskId: createResult.taskId,
        apiUsageId: createResult.apiUsageId,
      });
      return true;
    } catch (error) {
      updateNodeData(id, {
        status: "failed",
        error:
          error instanceof Error
            ? error.message
            : lt("视频增强创建任务失败", "Failed to create video enhance task"),
        progress: undefined,
      });
      return false;
    }
  }, [
    effectiveInputVideoUrl,
    fps,
    id,
    lt,
    polling,
    resolution,
    resolutionLimit,
    resolutionMode,
    scene,
    toolVersion,
  ]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; done?: (ok?: boolean) => void }>).detail;
      if (!detail || detail.id !== id) return;
      void handleRun().then((ok) => detail.done?.(ok));
    };

    window.addEventListener("flow:run-node", handler as EventListener);
    return () => window.removeEventListener("flow:run-node", handler as EventListener);
  }, [handleRun, id]);

  const historyItems = Array.isArray(data.history) ? data.history : [];
  const runDisabled = data.status === "running";
  const selectedBorder = selected ? "#8b5cf6" : "#d9dde5";
  const labelStyle: React.CSSProperties = {
    display: "grid",
    gap: 5,
    minWidth: 0,
    color: "#344054",
    fontSize: 11,
    lineHeight: 1.4,
  };
  const fieldStyle: React.CSSProperties = {
    width: "100%",
    height: 30,
    boxSizing: "border-box",
    border: "1px solid #cfd5df",
    borderRadius: 5,
    background: "#fff",
    color: "#344054",
    padding: "0 8px",
    fontSize: 12,
    outline: "none",
  };
  const previewStyle: React.CSSProperties = {
    height: 116,
    borderRadius: 5,
    border: "1px solid #d6dae1",
    background: "#000",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
  const previewEmptyStyle: React.CSSProperties = {
    color: "#aeb4c0",
    fontSize: 12,
    lineHeight: 1.4,
    textAlign: "center",
  };
  const formRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 8,
  };
  const runButtonTitle =
    runDisabled
      ? data.upstreamStatus
        ? `${lt("运行中", "Running...")} · ${data.upstreamStatus}`
        : "Running..."
      : hasCredits && typeof runCredits === "number"
        ? `${lt("Cost", "Cost")}: ${runCredits} ${lt("credits", "credits")}`
        : lt("Run", "Run");

  return (
    <FlowResizableNodeShell
      id={id}
      data={data}
      selected={selected}
      defaultWidth={320}
      defaultHeight={COMPACT_NODE_HEIGHT}
      minWidth={300}
      minHeight={440}
      style={{
        padding: "10px 10px 11px",
        background: "#fff",
        border: `1px solid ${selectedBorder}`,
        borderRadius: 10,
        boxShadow: selected
          ? "0 0 0 2px rgba(139,92,246,0.10), 0 2px 5px rgba(15,23,42,0.08)"
          : "0 2px 5px rgba(15,23,42,0.08)",
        gap: 7,
        color: "#1f2937",
      }}
    >
      <Handle type="target" position={Position.Left} id="video" style={{ top: "50%" }} />
      <Handle type="source" position={Position.Right} id="video" style={{ top: "50%" }} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 26 }}>
        <strong style={{ fontSize: 16, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
          Video Enhance
        </strong>
        <button
          type="button"
          onClick={() => void handleRun()}
          disabled={runDisabled}
          className="run-btn-with-credit"
          title={runButtonTitle}
          style={{
            minHeight: 28,
            border: 0,
            borderRadius: 6,
            background: effectiveInputVideoUrl && !runDisabled ? "#1f2937" : "#e0e3e8",
            color: "#fff",
            cursor: runDisabled ? "not-allowed" : "pointer",
            fontSize: 11,
            fontWeight: 600,
            padding: "0 9px",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            flexShrink: 0,
            width: "fit-content",
            alignSelf: "flex-start",
          }}
        >
          {data.status === "running" ? (
            <span className="run-text-trigger">
              {data.upstreamStatus
                ? `${lt("运行中", "Running")} · ${data.upstreamStatus}`
                : lt("运行中", "Running...")}
            </span>
          ) : (
            <>
              <span className="run-text-trigger">Run</span>
              {hasCredits ? <RunCreditBadge credits={runCredits} runButton /> : null}
            </>
          )}
        </button>
      </div>

      <GenerationProgressBar status={data.status} progress={data.progress ?? null} />

      {data.status === "running" && data.upstreamStatus ? (
        <div
          style={{
            fontSize: 11,
            color: "#667085",
            lineHeight: 1.35,
            textAlign: "center",
          }}
        >
          {lt("上游状态", "Upstream")}: {data.upstreamStatus}
        </div>
      ) : null}

      <section style={{ display: "grid", gap: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "#344054" }}>
          {lt("输入视频", "Input Video")}
        </div>
        <div style={previewStyle}>
          {inputVideoUrl ? (
            <video
              key={inputVideoUrl}
              src={inputVideoUrl}
              controls
              preload="metadata"
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
              onError={() =>
                setInputVideoSourceIndex((value) =>
                  value + 1 < inputVideoSources.length ? value + 1 : value
                )
              }
            />
          ) : (
            <div style={previewEmptyStyle}>{lt("请连接视频节点", "Please connect a video node")}</div>
          )}
        </div>
      </section>

      <div style={formRowStyle}>
        <label style={labelStyle}>
          <span>{lt("版本", "Version")}</span>
          <select
            value={toolVersion}
            style={fieldStyle}
            onChange={(event) =>
              updateNodeData(id, { toolVersion: event.target.value, error: undefined })
            }
          >
            {VIDEO_ENHANCE_TOOL_VERSIONS.map((item) => (
              <option key={item} value={item}>
                {item === "standard" ? lt("标准版", "Standard") : lt("专业版", "Professional")}
              </option>
            ))}
          </select>
        </label>

        <label style={labelStyle}>
          <span>{lt("场景", "Scene")}</span>
          <select
            value={scene}
            style={fieldStyle}
            onChange={(event) =>
              updateNodeData(id, { scene: event.target.value, error: undefined })
            }
          >
            {VIDEO_ENHANCE_SCENES.map((item) => (
              <option key={item} value={item}>
                {item === "aigc"
                  ? "AIGC"
                  : item === "ugc"
                    ? "UGC"
                    : item === "short_series"
                      ? lt("短剧", "Short Series")
                      : lt("老电影", "Old Film")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={formRowStyle}>
        <label style={labelStyle}>
          <span>{lt("分辨率模式", "Resolution Mode")}</span>
          <select
            value={resolutionMode}
            style={fieldStyle}
            onChange={(event) =>
              updateNodeData(id, {
                resolutionMode: event.target.value,
                error: undefined,
              })
            }
          >
            <option value="preset">{lt("预设", "Preset")}</option>
            <option value="limit">{lt("短边像素", "Short Edge Pixels")}</option>
          </select>
        </label>

        {resolutionMode === "preset" ? (
          <label style={labelStyle}>
            <span>{lt("分辨率", "Resolution")}</span>
            <select
              value={resolution}
              style={fieldStyle}
              onChange={(event) =>
                updateNodeData(id, {
                  resolution: event.target.value,
                  resolutionLimit: undefined,
                  error: undefined,
                })
              }
            >
              {VIDEO_ENHANCE_RESOLUTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label style={labelStyle}>
            <span>{lt("短边像素", "Short Edge Pixels")}</span>
            <input
              type="number"
              min={VIDEO_ENHANCE_LIMIT_RANGE.min}
              max={VIDEO_ENHANCE_LIMIT_RANGE.max}
              value={resolutionLimit}
              style={fieldStyle}
              onChange={(event) =>
                updateNodeData(id, {
                  resolutionLimit: Number(event.target.value),
                  resolution: undefined,
                  error: undefined,
                })
              }
            />
          </label>
        )}
      </div>

      <label style={{ ...labelStyle, marginTop: 8 }}>
        <span>{lt("帧率（可选）", "FPS (Optional)")}</span>
        <input
          type="number"
          min={VIDEO_ENHANCE_FPS_RANGE.min}
          max={VIDEO_ENHANCE_FPS_RANGE.max}
          value={fps ?? ""}
          placeholder={lt("保持原始帧率", "Keep original frame rate")}
          style={fieldStyle}
          onChange={(event) => {
            const raw = event.target.value.trim();
            updateNodeData(id, {
              fps: raw ? Number(raw) : undefined,
              error: undefined,
            });
          }}
        />
      </label>

      <div style={{ minWidth: 0, color: "#7b8493", fontSize: 11, lineHeight: 1.35 }}>
        <span>
          {lt("输出为增强后视频，可继续连接到其他视频节点。", "The enhanced video can connect to another video node.")}
        </span>
      </div>

      <section style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#344054" }}>
            {lt("增强结果", "Enhanced Result")}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {historyItems.length > 0 ? (
              <button
                type="button"
                title={lt("任务历史", "Task history")}
                onClick={() => setShowHistory((value) => !value)}
                style={{ display: "inline-flex", alignItems: "center", gap: 3, border: 0, padding: 0, background: "transparent", color: "#7b8493", cursor: "pointer", fontSize: 10 }}
              >
                <History size={12} />
                {historyItems.length}
              </button>
            ) : null}
            {outputVideoUrl ? (
              <a
                href={outputVideoUrl}
                download
                target="_blank"
                rel="noreferrer"
                title={lt("下载结果", "Download result")}
                style={{ display: "inline-flex", color: "#667085" }}
              >
                <Download size={13} />
              </a>
            ) : null}
          </div>
        </div>
        <div style={previewStyle}>
          {outputVideoUrl ? (
            <video
              key={outputVideoUrl}
              src={outputVideoUrl}
              controls
              preload="metadata"
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
              onError={() =>
                setOutputVideoSourceIndex((value) =>
                  value + 1 < outputVideoSources.length ? value + 1 : value
                )
              }
            />
          ) : (
            <div style={previewEmptyStyle}>
              {lt("运行成功后将在此显示增强视频", "The enhanced video will appear here after processing")}
            </div>
          )}
        </div>
      </section>

      {data.error ? (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: "#fef2f2",
            color: "#b91c1c",
            fontSize: 12,
            border: "1px solid #fecaca",
          }}
        >
          {data.error}
        </div>
      ) : null}

      {showHistory ? (
        <div
          style={{
            borderTop: "1px solid #e5e7eb",
            paddingTop: 8,
            display: "grid",
            gap: 6,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {historyItems.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8" }}>
              {lt("暂无历史记录", "No history yet")}
            </div>
          ) : (
            historyItems.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: 8,
                  fontSize: 12,
                  display: "grid",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{item.status}</strong>
                  <span>{new Date(item.finishedAt || item.createdAt).toLocaleString()}</span>
                </div>
                <div>
                  {item.toolVersion} · {item.scene} ·{" "}
                  {item.resolutionMode === "preset"
                    ? item.resolution
                    : `${item.resolutionLimit}px`}
                  {typeof item.fps === "number" ? ` · ${item.fps}fps` : ""}
                </div>
                {item.outputVideoUrl ? (
                  <a href={item.outputVideoUrl} target="_blank" rel="noreferrer">
                    {lt("打开结果视频", "Open result video")}
                  </a>
                ) : null}
                {item.error ? <div style={{ color: "#b91c1c" }}>{item.error}</div> : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </FlowResizableNodeShell>
  );
}
