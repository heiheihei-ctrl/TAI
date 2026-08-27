import React from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  onUploadImage?: (file: File) => Promise<string>;
  disabled?: boolean;
};

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs ${
        active ? "bg-blue-100 text-blue-700" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "请输入内容…",
  minHeight = 180,
  onUploadImage,
  disabled = false,
}: Props) {
  const imageInputRef = React.useRef<HTMLInputElement | null>(null);
  const syncingRef = React.useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || "",
    editable: !disabled,
    onUpdate: ({ editor: ed }) => {
      if (syncingRef.current) return;
      onChange(ed.getHTML());
    },
  });

  React.useEffect(() => {
    if (!editor) return;
    const next = value || "";
    const current = editor.getHTML();
    if (next === current) return;
    syncingRef.current = true;
    editor.commands.setContent(next, { emitUpdate: false });
    syncingRef.current = false;
  }, [editor, value]);

  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  const insertImage = async (file: File) => {
    if (!editor || !onUploadImage) return;
    const url = await onUploadImage(file);
    editor.chain().focus().setImage({ src: url }).run();
  };

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("链接地址", previous || "https://");
    if (url === null) return;
    if (!url.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  };

  if (!editor) {
    return (
      <div
        className="rounded border bg-gray-50 text-sm text-gray-400"
        style={{ minHeight }}
      >
        编辑器加载中…
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border bg-white">
      <div className="flex flex-wrap gap-1 border-b bg-gray-50 px-2 py-1.5">
        <ToolbarButton
          title="加粗"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          B
        </ToolbarButton>
        <ToolbarButton
          title="斜体"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </ToolbarButton>
        <ToolbarButton
          title="二级标题"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          title="三级标题"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolbarButton>
        <ToolbarButton
          title="无序列表"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • 列表
        </ToolbarButton>
        <ToolbarButton
          title="有序列表"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. 列表
        </ToolbarButton>
        <ToolbarButton title="插入链接" active={editor.isActive("link")} onClick={setLink}>
          链接
        </ToolbarButton>
        {onUploadImage ? (
          <>
            <ToolbarButton title="插入图片" onClick={() => imageInputRef.current?.click()}>
              图片
            </ToolbarButton>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void insertImage(file);
              }}
            />
          </>
        ) : null}
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none px-3 py-2 [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[var(--editor-min-height)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_img]:max-w-full"
        style={{ ["--editor-min-height" as string]: `${minHeight}px` }}
      />
    </div>
  );
}
