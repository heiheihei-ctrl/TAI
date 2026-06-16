import React from "react";
import { Image as ImageIcon, X } from "lucide-react";
import type { ImageMentionReference } from "@/utils/imageMentions";
import { toRenderableImageSrc } from "@/utils/imageSource";

type Props = {
  mentions: ImageMentionReference[];
  onRemove: (mention: ImageMentionReference) => void;
  className?: string;
  style?: React.CSSProperties;
};

export default function ImageMentionChipList({
  mentions,
  onRemove,
  className,
  style,
}: Props) {
  if (!mentions.length) return null;

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        ...style,
      }}
    >
      {mentions.map((mention) => {
        const src = toRenderableImageSrc(
          mention.item?.thumbnailUrl || mention.item?.url || ""
        );
        return (
          <div
            key={mention.id}
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              maxWidth: "100%",
              padding: "4px 10px 4px 4px",
              borderRadius: 999,
              border: "1px solid rgba(148, 163, 184, 0.45)",
              background: "rgba(255,255,255,0.98)",
            }}
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                overflow: "hidden",
                background: "#dbeafe",
                flexShrink: 0,
                display: "inline-flex",
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
                    display: "block",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <ImageIcon size={14} color="#2563eb" />
              )}
            </span>
            <span
              style={{
                minWidth: 0,
                maxWidth: 160,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
                lineHeight: 1.2,
                color: "#1e3a8a",
              }}
              title={mention.label}
            >
              {mention.label}
            </span>
            <button
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onRemove(mention);
              }}
              style={{
                position: "absolute",
                top: -4,
                right: -4,
                width: 16,
                height: 16,
                borderRadius: 999,
                border: 0,
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#ef4444",
                color: "#ffffff",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.28)",
                cursor: "pointer",
              }}
              aria-label={`remove ${mention.label}`}
            >
              <X size={10} strokeWidth={2.4} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
