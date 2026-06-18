import React from "react";
import { Download, AlertTriangle, Share2, Video } from "lucide-react";
import { Handle, Position, useStore } from "reactflow";
import { proxifyRemoteAssetUrl } from "@/utils/assetProxy";
import { useLocaleText } from "@/utils/localeText";
import FlowResizableNodeShell from "./FlowResizableNodeShell";
import GenerationProgressBar from "./GenerationProgressBar";
import NodeSelect from "./NodeSelect";
import RunCreditBadge from "./RunCreditBadge";
import { useNodeRunCredits } from "../hooks/useNodeRunCredits";

type Props = {
  id: string;
  data: {
    status?: "idle" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    thumbnail?: string;
    error?: string;
    videoVersion?: number;
    videoMode?: "frame" | "reference";
    duration?: number;
    clipDuration?: number;
    resolution?: "720P" | "1080P" | "4K";
    aspectRatio?: "16:9" | "9:16";
    creditsPerCall?: number;
    boxW?: number;
    boxH?: number;
    onRun?: (id: string) => void;
  };
  selected?: boolean;
};

type DownloadFeedback = {
  type: "progress" | "success" | "error";
  message: string;
};

const updateNodeData = (id: string, patch: Record<string, any>) => {
  window.dispatchEvent(
    new CustomEvent("flow:updateNodeData", {
      detail: { id, patch },
    })
  );
};

function OmniFlashExtVideoNode({ id, data, selected }: Props) {
  const { lt } = useLocaleText();
  const [hover, setHover] = React.useState<string | null>(null);
  const [previewAspect, setPreviewAspect] = React.useState<string>("16/9");
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [videoSourceIndex, setVideoSourceIndex] = React.useState(0);
  const [videoPlaybackError, setVideoPlaybackError] = React.useState(false);
  const [downloadFeedback, setDownloadFeedback] =
    React.useState<DownloadFeedback | null>(null);
  const downloadFeedbackTimer = React.useRef<number | undefined>(undefined);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);

  const videoMode = data.videoMode === "reference" ? "reference" : "frame";
  const duration = [4, 6, 8, 10].includes(Number(data.duration ?? data.clipDuration))
    ? Number(data.duration ?? data.clipDuration)
    : 6;
  const resolution =
    data.resolution === "1080P" || data.resolution === "4K" ? data.resolution : "720P";
  const aspectRatio = data.aspectRatio === "9:16" ? "9:16" : "16:9";
  const { credits: runCredits, hasCredits: hasRunCredits } = useNodeRunCredits(
    data.creditsPerCall
  );

  const incomingHandleStats = useStore((state: any) => {
    const edges = Array.isArray(state?.edges) ? state.edges : [];
    const targetEdges = edges.filter((edge: any) => edge.target === id);
    const count = (handleId: string) =>
      targetEdges.filter((edge: any) => edge.targetHandle === handleId).length;
    return {
      textCount: count("text"),
      imageCount: count("image"),
      videoCount: count("video"),
    };
  });

  const sanitizedVideoUrl = React.useMemo(() => {
    if (!data.videoUrl || typeof data.videoUrl !== "string") return undefined;
    const trimmed = data.videoUrl.trim();
    if (!trimmed) return undefined;
    const markdownMatch = trimmed.match(/^\[[^\]]*\]\((https?:\/\/[^)\s]+)\)$/i);
    if (markdownMatch?.[1]) return markdownMatch[1];
    const markdownSplit = trimmed.split("](");
    const candidate =
      markdownSplit.length > 1
        ? markdownSplit[0].replace(/^\[/, "")
        : trimmed;
    const spaceIdx = candidate.indexOf(" ");
    return spaceIdx > 0 ? candidate.slice(0, spaceIdx) : candidate;
  }, [data.videoUrl]);

  const videoSources = React.useMemo(() => {
    if (!sanitizedVideoUrl) return [];
    const directUrl = sanitizedVideoUrl;
    const proxiedUrl = proxifyRemoteAssetUrl(directUrl, { forceProxy: true });
    return Array.from(new Set([directUrl, proxiedUrl].filter(Boolean)));
  }, [sanitizedVideoUrl]);

  const activeVideoSource = videoSources[videoSourceIndex] || videoSources[0];

  React.useEffect(() => {
    setVideoSourceIndex(0);
    setVideoPlaybackError(false);
  }, [sanitizedVideoUrl, data.videoVersion]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoSource) return;
    try {
      video.load();
    } catch {
      // Browser will surface playback failures through onError.
    }
  }, [activeVideoSource]);

  const feedbackColors = React.useMemo(() => {
    if (!downloadFeedback) return null;
    if (downloadFeedback.type === "error") {
      return {
        color: "#b91c1c",
        background: "#fef2f2",
        borderColor: "#fecaca",
      };
    }
    if (downloadFeedback.type === "success") {
      return {
        color: "#15803d",
        background: "#ecfdf5",
        borderColor: "#bbf7d0",
      };
    }
    return {
      color: "#1d4ed8",
      background: "#eff6ff",
      borderColor: "#bfdbfe",
    };
  }, [downloadFeedback]);

  React.useEffect(() => {
    return () => {
      if (downloadFeedbackTimer.current) {
        window.clearTimeout(downloadFeedbackTimer.current);
      }
    };
  }, []);

  const scheduleFeedbackClear = React.useCallback((delayMs: number) => {
    if (downloadFeedbackTimer.current) {
      window.clearTimeout(downloadFeedbackTimer.current);
    }
    downloadFeedbackTimer.current = window.setTimeout(() => {
      setDownloadFeedback(null);
      downloadFeedbackTimer.current = undefined;
    }, delayMs);
  }, []);

  const handleButtonMouseDown = React.useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    },
    []
  );

  const stopMediaInteraction = React.useCallback(
    (
      event:
        | React.PointerEvent<HTMLVideoElement>
        | React.MouseEvent<HTMLVideoElement>
        | React.TouchEvent<HTMLVideoElement>
    ) => {
      event.stopPropagation();
    },
    []
  );

  const handleVideoError = React.useCallback(() => {
    setVideoSourceIndex((currentIndex) => {
      if (currentIndex + 1 < videoSources.length) {
        return currentIndex + 1;
      }
      setVideoPlaybackError(true);
      return currentIndex;
    });
  }, [videoSources.length]);

  const copyVideoLink = React.useCallback(
    async (url?: string) => {
      if (!url) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          setDownloadFeedback({
            type: "success",
            message: lt("视频链接已复制", "Video link copied"),
          });
          scheduleFeedbackClear(2000);
          return;
        }
      } catch {}
      prompt(lt("请手动复制以下链接：", "Please copy this link manually:"), url);
    },
    [lt, scheduleFeedbackClear]
  );

  const triggerDownload = React.useCallback(
    async (url?: string) => {
      if (!url || isDownloading) return;
      if (downloadFeedbackTimer.current) {
        window.clearTimeout(downloadFeedbackTimer.current);
        downloadFeedbackTimer.current = undefined;
      }
      setIsDownloading(true);
      setDownloadFeedback({
        type: "progress",
        message: lt("视频下载中，请稍等...", "Downloading video..."),
      });
      try {
        const isOssUrl = url.includes("aliyuncs.com");
        const downloadUrl = isOssUrl ? url : proxifyRemoteAssetUrl(url, { forceProxy: true });
        const response = await fetch(downloadUrl, {
          mode: "cors",
          credentials: "omit",
        });
        if (response.ok) {
          const blob = await response.blob();
          const videoBlob = blob.type.startsWith("video/")
            ? blob
            : new Blob([blob], { type: "video/mp4" });
          const blobUrl = URL.createObjectURL(videoBlob);
          const link = document.createElement("a");
          link.href = blobUrl;
          link.download = `omni-flash-ext-${new Date().toISOString().split("T")[0]}.mp4`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.setTimeout(() => URL.revokeObjectURL(blobUrl), 200);
          setDownloadFeedback({
            type: "success",
            message: lt("下载完成", "Download completed"),
          });
          scheduleFeedbackClear(2000);
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
        setDownloadFeedback({
          type: "success",
          message: lt("已在新标签页打开视频链接", "Opened video link in new tab"),
        });
        scheduleFeedbackClear(3000);
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
        setDownloadFeedback({
          type: "error",
          message: lt("下载失败，已在新标签页打开", "Download failed, opened in new tab"),
        });
        scheduleFeedbackClear(4000);
      } finally {
        setIsDownloading(false);
      }
    },
    [isDownloading, lt, scheduleFeedbackClear]
  );

  const runDisabled = data.status === "running";
  const downloadDisabled = !data.videoUrl || isDownloading;

  return (
    <FlowResizableNodeShell
      id={id}
      data={data}
      selected={selected}
      defaultWidth={300}
      defaultHeight={340}
      minWidth={220}
      minHeight={220}
      style={{
        padding: 10,
        background: "#fff",
        border: `1px solid ${selected ? "#2563eb" : "#e5e7eb"}`,
        borderRadius: 10,
        boxShadow: selected
          ? "0 0 0 2px rgba(37,99,235,0.12)"
          : "0 1px 2px rgba(0,0,0,0.04)",
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="text"
        style={{ top: "24%" }}
        onMouseEnter={() => setHover("text-in")}
        onMouseLeave={() => setHover(null)}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="image"
        style={{ top: "48%" }}
        onMouseEnter={() => setHover("image-in")}
        onMouseLeave={() => setHover(null)}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="video"
        style={{ top: "72%" }}
        onMouseEnter={() => setHover("video-in")}
        onMouseLeave={() => setHover(null)}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="video"
        style={{ top: "50%" }}
        onMouseEnter={() => setHover("video-out")}
        onMouseLeave={() => setHover(null)}
      />

      {hover === "text-in" && (
        <div
          className="flow-tooltip"
          style={{ left: -8, top: "24%", transform: "translate(-100%, -50%)" }}
        >
          {lt("prompt", "prompt")}
        </div>
      )}
      {hover === "image-in" && (
        <div
          className="flow-tooltip"
          style={{ left: -8, top: "48%", transform: "translate(-100%, -50%)" }}
        >
          {lt("image (1-3)", "image (1-3)")}
        </div>
      )}
      {hover === "video-in" && (
        <div
          className="flow-tooltip"
          style={{ left: -8, top: "72%", transform: "translate(-100%, -50%)" }}
        >
          {lt("reference video (max 1)", "reference video (max 1)")}
        </div>
      )}
      {hover === "video-out" && (
        <div
          className="flow-tooltip"
          style={{ right: -8, top: "50%", transform: "translate(100%, -50%)" }}
        >
          video
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Video size={18} />
          <span>Omni Flash Ext</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            className="tanva-video-header-btn tanva-video-header-run run-btn-with-credit"
            onClick={() => data.onRun?.(id)}
            onMouseDown={handleButtonMouseDown}
            disabled={runDisabled}
            title={lt("运行", "Run")}
            style={{
              width: hasRunCredits ? "auto" : 36,
              minWidth: hasRunCredits ? 64 : 36,
              padding: hasRunCredits ? "0 10px" : undefined,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: runDisabled ? "#e5e7eb" : "#111827",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: runDisabled ? "not-allowed" : "pointer",
              fontSize: 12,
              opacity: runDisabled ? 0.6 : 1,
              gap: 0,
            }}
          >
            {runDisabled ? (
              <span className="run-text-trigger">Running...</span>
            ) : (
              <>
                <span className="run-text-trigger">Run</span>
                {hasRunCredits ? <RunCreditBadge credits={runCredits} runButton /> : null}
              </>
            )}
          </button>
          <button
            className="tanva-video-header-btn tanva-video-header-share"
            onClick={() => copyVideoLink(data.videoUrl)}
            onMouseDown={handleButtonMouseDown}
            title={lt("复制链接", "Copy link")}
            style={{
              width: 36,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: "#111827",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: data.videoUrl ? "pointer" : "not-allowed",
              color: "#fff",
              opacity: data.videoUrl ? 1 : 0.35,
            }}
            disabled={!data.videoUrl}
          >
            <Share2 size={14} />
          </button>
          <button
            className="tanva-video-header-btn tanva-video-header-download"
            onClick={() => triggerDownload(data.videoUrl)}
            onMouseDown={handleButtonMouseDown}
            title={lt("下载视频", "Download video")}
            style={{
              width: 36,
              height: 32,
              borderRadius: 8,
              border: "none",
              background: downloadDisabled ? "#e5e7eb" : "#111827",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: downloadDisabled ? "not-allowed" : "pointer",
              color: "#fff",
              opacity: downloadDisabled ? 0.35 : 1,
            }}
            disabled={downloadDisabled}
          >
            {isDownloading ? (
              <span style={{ fontSize: 10, fontWeight: 600, color: "#111827" }}>...</span>
            ) : (
              <Download size={14} />
            )}
          </button>
        </div>
      </div>

      {downloadFeedback && feedbackColors && (
        <div
          style={{
            margin: "2px 0 8px",
            padding: "4px 8px",
            borderRadius: 6,
            fontSize: 11,
            border: `1px solid ${feedbackColors.borderColor}`,
            background: feedbackColors.background,
            color: feedbackColors.color,
          }}
        >
          {downloadFeedback.message}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{lt("模式", "Mode")}</div>
          <NodeSelect
            value={videoMode}
            options={[
              { value: "frame", label: lt("单图", "Frame") },
              { value: "reference", label: lt("参考", "Reference") },
            ]}
            onChange={(value) => updateNodeData(id, { videoMode: value })}
            menuLabel={lt("模式", "Mode")}
            title={lt("选择模式", "Select mode")}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{lt("时长", "Duration")}</div>
          <NodeSelect
            value={String(duration)}
            options={[4, 6, 8, 10].map((value) => ({ value: String(value), label: `${value}s` }))}
            onChange={(value) =>
              updateNodeData(id, {
                duration: Number(value),
                clipDuration: Number(value),
              })
            }
            menuLabel={lt("时长", "Duration")}
            title={lt("选择时长", "Select duration")}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{lt("分辨率", "Resolution")}</div>
          <NodeSelect
            value={resolution}
            options={["720P", "1080P", "4K"].map((value) => ({ value, label: value }))}
            onChange={(value) => updateNodeData(id, { resolution: value })}
            menuLabel={lt("分辨率", "Resolution")}
            title={lt("选择分辨率", "Select resolution")}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{lt("比例", "Ratio")}</div>
          <NodeSelect
            value={aspectRatio}
            options={["16:9", "9:16"].map((value) => ({ value, label: value }))}
            onChange={(value) => updateNodeData(id, { aspectRatio: value })}
            menuLabel={lt("比例", "Ratio")}
            title={lt("选择比例", "Select ratio")}
          />
        </div>
      </div>

      <div
        style={{
          width: "100%",
          aspectRatio: previewAspect,
          minHeight: 140,
          background: "#f8fafc",
          borderRadius: 6,
          border: "1px solid #eef0f2",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          marginBottom: 8,
        }}
      >
        {activeVideoSource ? (
          <video
            key={`${activeVideoSource}-${data.videoVersion || 0}`}
            ref={videoRef}
            className="nodrag nopan nowheel"
            src={activeVideoSource}
            controls
            preload="metadata"
            playsInline
            poster={data.thumbnail ? proxifyRemoteAssetUrl(data.thumbnail) : undefined}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              borderRadius: 6,
              background: "#000",
            }}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.videoWidth && video.videoHeight) {
                setPreviewAspect(`${video.videoWidth}/${video.videoHeight}`);
              }
              setVideoPlaybackError(false);
            }}
            onCanPlay={() => setVideoPlaybackError(false)}
            onError={handleVideoError}
            onPointerDownCapture={stopMediaInteraction}
            onMouseDownCapture={stopMediaInteraction}
            onTouchStartCapture={stopMediaInteraction}
            onClick={(event) => event.stopPropagation()}
          />
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              color: "#94a3b8",
            }}
          >
            <Video size={24} strokeWidth={2} />
            <div style={{ fontSize: 11 }}>{lt("等待生成...", "Waiting...")}</div>
          </div>
        )}
      </div>

      {videoPlaybackError && (
        <div
          style={{
            margin: "-2px 0 8px",
            color: "#b91c1c",
            fontSize: 11,
          }}
        >
          {lt("视频加载失败，请刷新页面或使用下载按钮查看", "Video failed to load. Refresh or use Download.")}
        </div>
      )}

      <GenerationProgressBar status={data.status || "idle"} />

      {(incomingHandleStats.imageCount > 3 || incomingHandleStats.videoCount > 1) && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #fcd34d",
            background: "#fffbeb",
            color: "#92400e",
            fontSize: 11,
            display: "grid",
            gap: 4,
          }}
        >
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
            <AlertTriangle size={12} />
            <span>{lt("连接提示", "Connection hints")}</span>
          </div>
          {incomingHandleStats.imageCount > 3 && (
            <div>{lt("Omni Flash Ext 图片最多 3 张", "Omni Flash Ext supports up to 3 images")}</div>
          )}
          {incomingHandleStats.videoCount > 1 && (
            <div>
              {lt("Omni Flash Ext 最多支持 1 条参考视频", "Omni Flash Ext supports up to 1 reference video")}
            </div>
          )}
          {incomingHandleStats.textCount === 0 && (
            <div>{lt("请连接提示词输入", "Connect a prompt input")}</div>
          )}
        </div>
      )}

      {data.error && (
        <div
          style={{
            marginTop: 6,
            padding: "6px 8px",
            background: "#fef2f2",
            border: "1px solid #fecdd3",
            borderRadius: 6,
            color: "#b91c1c",
            fontSize: 12,
            display: "flex",
            gap: 6,
            alignItems: "center",
          }}
        >
          <AlertTriangle size={14} />
          <span>{data.error}</span>
        </div>
      )}
    </FlowResizableNodeShell>
  );
}

export default React.memo(OmniFlashExtVideoNode);
