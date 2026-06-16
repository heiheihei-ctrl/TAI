import React from "react";
import { Image as ImageIcon } from "lucide-react";
import type { ImageMentionItem } from "@/utils/imageMentions";
import { toRenderableImageSrc } from "@/utils/imageSource";

type Props = {
  items: ImageMentionItem[];
  onSelect: (item: ImageMentionItem) => void;
  emptyText?: string;
  className?: string;
  style?: React.CSSProperties;
};

export default function ImageMentionMenu({
  items,
  onSelect,
  emptyText = "没有可引用的图片",
  className,
  style,
}: Props) {
  return (
    <div
      className={className}
      style={{
        width: 280,
        maxHeight: 260,
        overflowY: "auto",
        border: "1px solid rgba(148, 163, 184, 0.35)",
        borderRadius: 8,
        background: "rgba(255,255,255,0.98)",
        boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
        padding: 6,
        zIndex: 80,
        ...style,
      }}
    >
      {items.length === 0 ? (
        <div style={{ padding: "10px 12px", fontSize: 12, color: "#64748b" }}>
          {emptyText}
        </div>
      ) : (
        items.map((item) => {
          const src = toRenderableImageSrc(item.thumbnailUrl || item.url);
          return (
            <button
              key={item.id}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onSelect(item);
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 6,
                border: 0,
                borderRadius: 6,
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = "#f1f5f9";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = "transparent";
              }}
              title={item.label}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 6,
                  overflow: "hidden",
                  background: "#e2e8f0",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {src ? (
                  <img
                    src={src}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                ) : (
                  <ImageIcon size={16} color="#64748b" />
                )}
              </span>
              <span
                style={{
                  minWidth: 0,
                  flex: 1,
                  fontSize: 12,
                  color: "#0f172a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
