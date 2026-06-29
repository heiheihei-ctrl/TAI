import React from "react";
import ImageMentionMenu from "@/components/common/ImageMentionMenu";
import { toRenderableImageSrc } from "@/utils/imageSource";
import {
  createImageMentionToken,
  filterImageMentionItems,
  getImageMentionSegments,
  type ImageMentionItem,
} from "@/utils/imageMentions";

type MentionQuery = {
  endOffset: number;
  node: Text;
  query: string;
  startOffset: number;
};

type Props = {
  containerStyle?: React.CSSProperties;
  editorRef?: React.Ref<HTMLDivElement>;
  emptyText?: string;
  items: ImageMentionItem[];
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  menuStyle?: React.CSSProperties;
  onBlur?: React.FocusEventHandler<HTMLDivElement>;
  onChange: (value: string) => void;
  onFocus?: React.FocusEventHandler<HTMLDivElement>;
  onKeyUp?: React.KeyboardEventHandler<HTMLDivElement>;
  onMouseDownCapture?: React.MouseEventHandler<HTMLDivElement>;
  onPaste?: React.ClipboardEventHandler<HTMLDivElement>;
  onPointerDownCapture?: React.PointerEventHandler<HTMLDivElement>;
  onWheelCapture?: React.WheelEventHandler<HTMLDivElement>;
  placeholder?: string;
  style?: React.CSSProperties;
  value: string;
};

const ZERO_WIDTH_SPACE = "\u200b";

const setStyles = (
  element: HTMLElement,
  styles: Partial<CSSStyleDeclaration>
) => {
  Object.assign(element.style, styles);
};

const buildMentionChip = (
  item: ImageMentionItem,
  onRemove: (chip: HTMLElement) => void
): HTMLElement => {
  const chip = document.createElement("span");
  chip.dataset.inlineMentionInteractive = "true";
  chip.dataset.mentionToken = createImageMentionToken(item);
  chip.dataset.mentionId = item.id;
  chip.dataset.mentionLabel = item.label;
  chip.contentEditable = "false";
  setStyles(chip, {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    margin: "0 2px",
    padding: "1px 8px 1px 4px",
    borderRadius: "999px",
    border: "1px solid rgba(147, 197, 253, 0.9)",
    background: "rgba(239, 246, 255, 0.98)",
    color: "#1e3a8a",
    verticalAlign: "text-bottom",
    whiteSpace: "nowrap",
  });

  const thumb = document.createElement("span");
  setStyles(thumb, {
    width: "18px",
    height: "18px",
    borderRadius: "999px",
    overflow: "hidden",
    background: "#dbeafe",
    flexShrink: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  const src = toRenderableImageSrc(item.thumbnailUrl || item.url);
  if (src) {
    const image = document.createElement("img");
    image.src = src;
    image.alt = "";
    setStyles(image, {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
    });
    thumb.appendChild(image);
  } else {
    thumb.textContent = "@";
    setStyles(thumb, {
      color: "#2563eb",
      fontSize: "10px",
      fontWeight: "700",
    });
  }

  const label = document.createElement("span");
  label.textContent = item.label;
  label.title = item.label;
  setStyles(label, {
    maxWidth: "120px",
    overflow: "hidden",
    textOverflow: "ellipsis",
    fontSize: "0.92em",
    lineHeight: "1.2",
  });

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.dataset.inlineMentionInteractive = "true";
  removeButton.setAttribute("aria-label", `remove ${item.label}`);
  removeButton.textContent = "x";
  setStyles(removeButton, {
    position: "absolute",
    top: "-4px",
    right: "-4px",
    width: "14px",
    height: "14px",
    borderRadius: "999px",
    border: "0",
    padding: "0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ef4444",
    color: "#ffffff",
    boxShadow: "0 1px 3px rgba(15, 23, 42, 0.28)",
    cursor: "pointer",
    fontSize: "10px",
    lineHeight: "1",
  });
  removeButton.onmousedown = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onRemove(chip);
  };

  chip.appendChild(thumb);
  chip.appendChild(label);
  chip.appendChild(removeButton);
  return chip;
};

const serializeNode = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent || "").replaceAll(ZERO_WIDTH_SPACE, "");
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  if (node.dataset.mentionToken) {
    return node.dataset.mentionToken;
  }

  if (node.tagName === "BR") {
    return "\n";
  }

  let text = "";
  node.childNodes.forEach((child) => {
    text += serializeNode(child);
  });
  return text;
};

const serializeEditor = (editor: HTMLDivElement): string => {
  let nextValue = "";
  editor.childNodes.forEach((child) => {
    nextValue += serializeNode(child);
  });
  return nextValue;
};

const focusEditorAtEnd = (editor: HTMLDivElement) => {
  editor.focus();
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  if (editor.lastChild) {
    range.setStartAfter(editor.lastChild);
  } else {
    range.selectNodeContents(editor);
    range.collapse(false);
  }
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

const MAX_UNDO_STACK = 100;

const isSelectionInside = (root: HTMLElement, node: Node | null): boolean =>
  !!node && (node === root || root.contains(node));

const getMentionQueryFromSelection = (
  root: HTMLDivElement
): MentionQuery | null => {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !selection.isCollapsed) return null;
  const anchorNode = selection.anchorNode;
  if (!isSelectionInside(root, anchorNode)) return null;
  if (!(anchorNode instanceof Text)) return null;

  const textBeforeCaret = (anchorNode.textContent || "").slice(
    0,
    selection.anchorOffset
  );
  const at = textBeforeCaret.lastIndexOf("@");
  if (at < 0) return null;
  const query = textBeforeCaret.slice(at + 1);
  if (query.length > 40) return null;
  if (/[\r\n()[\]{}]/.test(query) || /\s/.test(query)) return null;

  return {
    node: anchorNode,
    startOffset: at,
    endOffset: selection.anchorOffset,
    query: query.trim(),
  };
};

export default function InlineImageMentionEditor({
  containerStyle,
  editorRef,
  emptyText = "没有可引用的图片",
  items,
  onClick,
  menuStyle,
  onBlur,
  onChange,
  onFocus,
  onKeyUp,
  onMouseDownCapture,
  onPaste,
  onPointerDownCapture,
  onWheelCapture,
  placeholder = "",
  style,
  value,
}: Props) {
  const editorInnerRef = React.useRef<HTMLDivElement | null>(null);
  const queryRef = React.useRef<MentionQuery | null>(null);
  const valueRef = React.useRef(value);
  const undoStackRef = React.useRef<string[]>([]);
  const redoStackRef = React.useRef<string[]>([]);
  const isApplyingHistoryRef = React.useRef(false);
  const skipNextInputUndoRef = React.useRef(false);
  const [query, setQuery] = React.useState<MentionQuery | null>(null);

  React.useEffect(() => {
    if (isApplyingHistoryRef.current) {
      valueRef.current = value;
      return;
    }
    const editor = editorInnerRef.current;
    const domValue = editor ? serializeEditor(editor) : null;
    if (value !== domValue && value !== valueRef.current) {
      undoStackRef.current = [];
      redoStackRef.current = [];
    }
    valueRef.current = value;
  }, [value]);

  const pushUndoSnapshot = React.useCallback((snapshot: string) => {
    if (isApplyingHistoryRef.current) return;
    const stack = undoStackRef.current;
    if (stack.length > 0 && stack[stack.length - 1] === snapshot) return;
    stack.push(snapshot);
    while (stack.length > MAX_UNDO_STACK) {
      stack.shift();
    }
    redoStackRef.current = [];
  }, []);

  const applyHistoryValue = React.useCallback(
    (nextValue: string) => {
      isApplyingHistoryRef.current = true;
      valueRef.current = nextValue;
      onChange(nextValue);
      requestAnimationFrame(() => {
        isApplyingHistoryRef.current = false;
        const editor = editorInnerRef.current;
        if (editor) {
          focusEditorAtEnd(editor);
        }
      });
    },
    [onChange]
  );

  const handleUndo = React.useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) return;
    const snapshot = stack.pop();
    if (snapshot === undefined) return;
    redoStackRef.current.push(valueRef.current);
    applyHistoryValue(snapshot);
    queryRef.current = null;
    setQuery(null);
  }, [applyHistoryValue]);

  const handleRedo = React.useCallback(() => {
    const stack = redoStackRef.current;
    if (stack.length === 0) return;
    const snapshot = stack.pop();
    if (snapshot === undefined) return;
    undoStackRef.current.push(valueRef.current);
    applyHistoryValue(snapshot);
    queryRef.current = null;
    setQuery(null);
  }, [applyHistoryValue]);

  const setEditorNode = React.useCallback(
    (node: HTMLDivElement | null) => {
      editorInnerRef.current = node;
      if (!editorRef) return;
      if (typeof editorRef === "function") {
        editorRef(node);
        return;
      }
      editorRef.current = node;
    },
    [editorRef]
  );

  const filteredItems = React.useMemo(
    () => (query ? filterImageMentionItems(items, query.query, 8) : []),
    [items, query]
  );

  const syncQuery = React.useCallback(() => {
    const editor = editorInnerRef.current;
    if (!editor) return;
    const next = getMentionQueryFromSelection(editor);
    queryRef.current = next;
    setQuery(next);
  }, []);

  const emitValue = React.useCallback(() => {
    const editor = editorInnerRef.current;
    if (!editor) return;
    const nextValue = serializeEditor(editor);
    valueRef.current = nextValue;
    onChange(nextValue);
  }, [onChange]);

  const commitEditorMutation = React.useCallback(
    (mutate: () => void) => {
      pushUndoSnapshot(valueRef.current);
      skipNextInputUndoRef.current = true;
      mutate();
      emitValue();
    },
    [emitValue, pushUndoSnapshot]
  );

  const removeChipElement = React.useCallback(
    (chip: HTMLElement) => {
      commitEditorMutation(() => {
        chip.remove();
      });
      queryRef.current = null;
      setQuery(null);
      requestAnimationFrame(() => {
        const editor = editorInnerRef.current;
        if (!editor) return;
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          if (editor.lastChild) {
            range.setStartAfter(editor.lastChild);
          } else {
            range.selectNodeContents(editor);
            range.collapse(false);
          }
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        editor.focus();
      });
    },
    [commitEditorMutation]
  );

  const renderValue = React.useCallback(() => {
    const editor = editorInnerRef.current;
    if (!editor) return;
    const currentValue = serializeEditor(editor);
    if (currentValue === value) return;
    editor.innerHTML = "";
    const fragment = document.createDocumentFragment();
    const mentionMap = new Map(items.map((item) => [item.id, item]));
    getImageMentionSegments(value, items).forEach((segment) => {
      if (segment.type === "text") {
        fragment.appendChild(document.createTextNode(segment.text));
        return;
      }
      const item =
        mentionMap.get(segment.id) ||
        ({
          id: segment.id,
          label: segment.label,
          url: segment.item?.url || "",
          thumbnailUrl: segment.item?.thumbnailUrl,
        } satisfies ImageMentionItem);
      fragment.appendChild(buildMentionChip(item, removeChipElement));
    });
    editor.appendChild(fragment);
  }, [items, removeChipElement, value]);

  React.useLayoutEffect(() => {
    renderValue();
  }, [renderValue]);

  const insertTextAtSelection = React.useCallback(
    (text: string) => {
      const selection = window.getSelection();
      const editor = editorInnerRef.current;
      if (!selection || !selection.rangeCount || !editor) return;
      const range = selection.getRangeAt(0);
      if (!isSelectionInside(editor, range.startContainer)) return;
      commitEditorMutation(() => {
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStart(textNode, textNode.textContent?.length || 0);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      });
      syncQuery();
    },
    [commitEditorMutation, syncQuery]
  );

  const handleSelectMention = React.useCallback(
    (item: ImageMentionItem) => {
      const activeQuery = queryRef.current;
      const editor = editorInnerRef.current;
      if (!activeQuery || !editor) return;

      const sourceNode = activeQuery.node;
      if (!editor.contains(sourceNode)) return;

      pushUndoSnapshot(valueRef.current);
      skipNextInputUndoRef.current = true;
      const text = (sourceNode.textContent || "").replaceAll(ZERO_WIDTH_SPACE, "");
      const before = text.slice(0, activeQuery.startOffset);
      const after = text.slice(activeQuery.endOffset);
      const fragment = document.createDocumentFragment();
      if (before) fragment.appendChild(document.createTextNode(before));
      const chip = buildMentionChip(item, removeChipElement);
      fragment.appendChild(chip);
      const trailingTextNode = document.createTextNode(
        after || ZERO_WIDTH_SPACE
      );
      fragment.appendChild(trailingTextNode);
      sourceNode.replaceWith(fragment);

      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.setStart(
          trailingTextNode,
          after ? 0 : trailingTextNode.textContent?.length || 0
        );
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }

      emitValue();
      queryRef.current = null;
      setQuery(null);
      requestAnimationFrame(() => {
        editorInnerRef.current?.focus();
      });
    },
    [emitValue, pushUndoSnapshot, removeChipElement]
  );

  return (
    <div style={{ position: "relative", ...containerStyle }}>
      <div
        ref={setEditorNode}
        className="tanva-inline-mention-editor nodrag nowheel"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={() => {
          if (skipNextInputUndoRef.current) {
            skipNextInputUndoRef.current = false;
            emitValue();
            syncQuery();
            return;
          }
          if (!isApplyingHistoryRef.current) {
            pushUndoSnapshot(valueRef.current);
          }
          emitValue();
          syncQuery();
        }}
        onKeyDown={(event) => {
          const isModKey = event.ctrlKey || event.metaKey;
          if (isModKey) {
            const key = event.key.toLowerCase();
            if (key === "z") {
              event.preventDefault();
              event.stopPropagation();
              if (event.shiftKey) {
                handleRedo();
              } else {
                handleUndo();
              }
              return;
            }
            if (key === "y") {
              event.preventDefault();
              event.stopPropagation();
              handleRedo();
              return;
            }
          }
          if (event.key === "Escape" && queryRef.current) {
            event.preventDefault();
            queryRef.current = null;
            setQuery(null);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            insertTextAtSelection("\n");
          }
        }}
        onPaste={(event) => {
          onPaste?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          insertTextAtSelection(
            event.clipboardData?.getData("text/plain") || ""
          );
        }}
        onKeyUp={(event) => {
          syncQuery();
          onKeyUp?.(event);
        }}
        onMouseUp={syncQuery}
        onClick={(event) => {
          syncQuery();
          onClick?.(event);
        }}
        onFocus={onFocus}
        onBlur={(event) => {
          window.setTimeout(() => {
            if (!editorInnerRef.current?.contains(document.activeElement)) {
              queryRef.current = null;
              setQuery(null);
            }
          }, 0);
          onBlur?.(event);
        }}
        onWheelCapture={onWheelCapture}
        onPointerDownCapture={onPointerDownCapture}
        onMouseDownCapture={onMouseDownCapture}
        style={{
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          outline: "none",
          ...style,
        }}
      />
      {query && (
        <ImageMentionMenu
          items={filteredItems}
          onSelect={handleSelectMention}
          emptyText={emptyText}
          style={menuStyle}
        />
      )}
    </div>
  );
}
