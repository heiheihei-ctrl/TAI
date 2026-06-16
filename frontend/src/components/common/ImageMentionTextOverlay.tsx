import React from "react";
import { Image as ImageIcon, X } from "lucide-react";
import {
  getImageMentionSegments,
  type ImageMentionItem,
  type ImageMentionSegment,
} from "@/utils/imageMentions";
import { toRenderableImageSrc } from "@/utils/imageSource";

type Props = {
  value: string;
  items: ImageMentionItem[];
  onRemoveMention?: (segment: Extract<ImageMentionSegment, { type: "mention" }>) => void;
  textColor?: string;
  chipBackground?: string;
  chipBorder?: string;
  chipTextColor?: string;
  style?: React.CSSProperties;
};

export default function ImageMentionTextOverlay({
  value,
  items,
  onRemoveMention,
  textColor = "#111827",
  chipBackground = "rgba(239, 246, 255, 0.98)",
  chipBorder = "rgba(147, 197, 253, 0.9)",
  chipTextColor = "#1e3a8a",
  style,
}: Props) {
  const segments = React.useMemo(
    () => getImageMentionSegments(value, items),
    [items, value]
  );

  if (!value) return null;

  return (
    <div
      style={{
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        color: textColor,
        ...style,
      }}
    >
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <React.Fragment key={`text-${index}`}>{segment.text}</React.Fragment>;
        }
        const src = toRenderableImageSrc(
          segment.item?.thumbnailUrl || segment.item?.url || ""
        );
        return (
          <span
            key={`mention-${segment.id}-${index}`}
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              maxWidth: "100%",
              margin: "0 2px",
              padding: "1px 6px 1px 4px",
              borderRadius: 999,
              border: `1px solid ${chipBorder}`,
              background: chipBackground,
              color: chipTextColor,
              verticalAlign: "text-bottom",
              pointerEvents: "auto",
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
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
                <ImageIcon size={10} color="#1d4ed8" />
              )}
            </span>
            <span
              style={{
                minWidth: 0,
                maxWidth: 104,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: "0.92em",
                lineHeight: 1.2,
              }}
            >
              {segment.label}
            </span>
            {onRemoveMention && (
              <button
                type="button"
                aria-label={`删除图片引用 ${segment.label}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemoveMention(segment);
                }}
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  width: 14,
                  height: 14,
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
                  pointerEvents: "auto",
                }}
              >
                <X size={9} strokeWidth={2.4} />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
