import React from "react";
import { Handle, Position, useStore, type Node, type ReactFlowState } from "reactflow";

import { ossUploadService } from "@/services/ossUploadService";
import { useProjectContentStore } from "@/stores/projectContentStore";
import { useLocaleText } from "@/utils/localeText";

import FlowResizableNodeShell from "./FlowResizableNodeShell";
import VideoComposeEditorModal from "./VideoComposeEditorModal";
import { collectUpstreamComposeSources } from "./videoCompose/collectUpstreamComposeSources";
import { composeWriteback } from "./videoCompose/composeWriteback";
import type { VideoComposeAudioTrack, VideoComposeSource } from "./videoCompose/types";

type VideoComposeNodeData = {
  label?: string;
  videoUrl?: string;
  persistedVideoUrl?: string;
  tempBlobUrl?: string;
  thumbnail?: string;
  status?: "idle" | "ready" | "error";
  uploadStatus?: "idle" | "uploading" | "done" | "error";
  error?: string;
  composeSources?: VideoComposeSource[];
  composeAudioTrack?: VideoComposeAudioTrack;
  boxW?: number;
  boxH?: number;
};

type Props = {
  id: string;
  data: VideoComposeNodeData;
  selected?: boolean;
};

export default function VideoComposeNode({ id, data, selected }: Props) {
  const { lt } = useLocaleText();
  const projectId = useProjectContentStore((state) => state.projectId);
  const [modalOpen, setModalOpen] = React.useState(false);
  const tempBlobRef = React.useRef<string | null>(null);

  const upstream = useStore(
    React.useCallback(
      (state: ReactFlowState) => collectUpstreamComposeSources(id, state),
      [id]
    )
  );
  const canCompose = upstream.videos.length >= 2 || (Array.isArray(data.composeSources) && data.composeSources.length >= 2);

  const effectiveSources =
    Array.isArray(data.composeSources) && data.composeSources.length >= 2
      ? data.composeSources
      : upstream.videos;
  const effectiveAudio = data.composeAudioTrack ?? upstream.audio;

  const updateNodeData = React.useCallback(
    (patch: Record<string, any>) => {
      window.dispatchEvent(new CustomEvent("flow:updateNodeData", { detail: { id, patch } }));
    },
    [id]
  );

  React.useEffect(() => {
    if (tempBlobRef.current && tempBlobRef.current !== data.tempBlobUrl) {
      try {
        URL.revokeObjectURL(tempBlobRef.current);
      } catch {}
      tempBlobRef.current = null;
    }
    if (typeof data.tempBlobUrl === "string" && data.tempBlobUrl.startsWith("blob:")) {
      tempBlobRef.current = data.tempBlobUrl;
    }
  }, [data.tempBlobUrl]);

  React.useEffect(
    () => () => {
      if (tempBlobRef.current) {
        try {
          URL.revokeObjectURL(tempBlobRef.current);
        } catch {}
      }
    },
    []
  );

  const uploadToOSS = React.useCallback(
    async (file: File) => {
      const result = await ossUploadService.uploadToOSS(file, {
        dir: projectId ? `projects/${projectId}/videos/` : "video-compose/",
        projectId: null,
        fileName: file.name,
        contentType: "video/mp4",
        maxSize: 1024 * 1024 * 1024,
      });
      if (!result.success || !result.url) {
        throw new Error(result.error || lt("上传合成视频失败", "Failed to upload composed video"));
      }
      return result.url;
    },
    [lt, projectId]
  );

  const handleSaveComposed = React.useCallback(
    async ({
      blob,
      sources,
      audioTrack,
      thumbnailUrl,
    }: {
      blob: Blob;
      sources: VideoComposeSource[];
      audioTrack?: VideoComposeAudioTrack;
      thumbnailUrl?: string;
    }) => {
      updateNodeData({
        composeSources: sources,
        composeAudioTrack: audioTrack,
        error: undefined,
      });
      const fileName = `video-compose-${Date.now()}.mp4`;
      const result = await composeWriteback({
        blob,
        fileName,
        thumbnailUrl,
        updateNodeData,
        uploadToOSS,
      });
      if (result.blobUrl) {
        tempBlobRef.current = result.blobUrl;
      }
    },
    [updateNodeData, uploadToOSS]
  );

  const borderColor = selected ? "#2563eb" : "#e5e7eb";
  const boxShadow = selected ? "0 0 0 2px rgba(37,99,235,0.12)" : "0 1px 2px rgba(0,0,0,0.04)";

  return (
    <>
      <FlowResizableNodeShell
        id={id}
        data={data}
        selected={selected}
        defaultWidth={340}
        defaultHeight={380}
        minWidth={280}
        minHeight={260}
        className="flow-video-compose-node"
        style={{
          padding: 12,
          background: "#fff",
          border: `1px solid ${borderColor}`,
          borderRadius: 14,
          boxShadow,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111827" }}>{data.label || lt("视频合成", "Video Compose")}</div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {effectiveSources.length > 0 ? `${effectiveSources.length} ${lt("段视频", "clips")}` : lt("0 段视频", "0 clips")}
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 246,
            borderRadius: 12,
            border: "1px dashed #d7dde6",
            background: "#f8fafc",
            overflow: "hidden",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            marginTop: 15,
          }}
        >
          {data.videoUrl ? (
            <video
              src={data.videoUrl}
              style={{ width: "100%", height: "100%", objectFit: "contain", background: "#020617" }}
              controls
            />
          ) : (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: 18 }}>
              <div style={{ fontSize: 42, lineHeight: 1, opacity: 0.8 }}>✂</div>
              <div style={{ marginTop: 12, fontSize: 14 }}>{lt("连接 2 个及以上视频节点", "Connect 2 or more video nodes")}</div>
              <button
                onClick={() => setModalOpen(true)}
                disabled={!canCompose}
                style={{
                  marginTop: 14,
                  border: "1px solid #d7dde6",
                  borderRadius: 10,
                  padding: "8px 14px",
                  background: canCompose ? "#ffffff" : "#eef2f7",
                  color: canCompose ? "#111827" : "#94a3b8",
                  cursor: canCompose ? "pointer" : "not-allowed",
                  fontWeight: 600,
                }}
              >
                {lt("合成视频", "Compose Video")}
              </button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 32 }}>
          <div style={{ fontSize: 12, color: data.error ? "#dc2626" : "#64748b", minHeight: 18, lineHeight: 1.4 }}>
            {data.error
              ? data.error
              : data.uploadStatus === "uploading"
              ? lt("已生成本地 blob 预览，正在异步上传 OSS", "Local blob preview ready, uploading to OSS")
              : effectiveAudio?.enabled
              ? lt("含背景音频混入", "Background audio enabled")
              : ""}
          </div>
          {data.videoUrl ? (
            <button
              onClick={() => setModalOpen(true)}
              style={{
                border: "1px solid #cbd5e1",
                borderRadius: 999,
                padding: "8px 16px",
                background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 500,
                whiteSpace: "nowrap",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                boxShadow: "0 8px 18px rgba(15,23,42,0.08)",
                marginTop: 6,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1, fontWeight: 400 }}>↻</span>
              {lt("重新合成", "Re-compose")}
            </button>
          ) : null}
        </div>

        <Handle type="target" position={Position.Left} id="video" style={{ top: "42%" }} />
        <Handle
          type="target"
          position={Position.Left}
          id="audio"
          className="tanva-beta-handle tanva-video-compose-audio-handle"
          style={{
            top: "62%",
            background: "#ec4899",
          }}
        />
        <Handle type="source" position={Position.Right} id="video" style={{ top: "50%" }} />
      </FlowResizableNodeShell>

      <VideoComposeEditorModal
        isOpen={modalOpen}
        initialSources={effectiveSources}
        initialAudio={effectiveAudio}
        onClose={() => {
          setModalOpen(false);
        }}
        onSaveComposed={handleSaveComposed}
      />
    </>
  );
}
