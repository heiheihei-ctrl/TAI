import React from "react";
import { useNavigate } from "react-router-dom";
import { ImageIcon, X } from "lucide-react";
import PptWizardLayout from "./PptWizardLayout";

type LocalImage = {
  id: string;
  name: string;
  objectUrl: string;
};

export default function PptSchemeUploadPage() {
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [images, setImages] = React.useState<LocalImage[]>([]);

  React.useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.objectUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
  }, []);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: LocalImage[] = [];
    Array.from(files).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        objectUrl: URL.createObjectURL(file),
      });
    });
    if (next.length) setImages((prev) => [...prev, ...next]);
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.objectUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  return (
    <PptWizardLayout
      title="方案上传"
      subtitle="上传方案效果图/平面图/概念图等相关图纸"
      onBack={() => navigate("/ppt")}
      onNext={() => navigate("/ppt/create?mode=scheme")}
      nextDisabled={images.length === 0}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {images.length === 0 ? (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-12 sm:min-h-[320px]">
          <ImageIcon className="h-14 w-14 text-slate-300" strokeWidth={1.25} />
          <button
            type="button"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            onClick={() => inputRef.current?.click()}
          >
            上传图片
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img) => (
              <div
                key={img.id}
                className="group relative aspect-[4/3] overflow-hidden rounded-xl border border-slate-100 bg-slate-50"
              >
                <img
                  src={img.objectUrl}
                  alt={img.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100"
                  onClick={() => removeImage(img.id)}
                  aria-label="移除图片"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-full border border-slate-300 bg-white px-5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              onClick={() => inputRef.current?.click()}
            >
              继续上传
            </button>
          </div>
        </div>
      )}
    </PptWizardLayout>
  );
}
