import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PptOutlineEditor, { type OutlinePage } from "./PptOutlineEditor";
import type { PptOutlinePageInput } from "@/services/pptOutlineService";
import { readPptOutlineDraft } from "./pptOutlineDraft";

type LocationState = {
  pages?: PptOutlinePageInput[];
  prompt?: string;
};

export default function PptEditOutlinePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;

  const initialPages = React.useMemo(() => {
    if (state.pages?.length) return state.pages;
    return readPptOutlineDraft()?.pages;
  }, [state.pages]);

  React.useEffect(() => {
    if (!initialPages?.length) {
      navigate("/ppt/outline/oneshot", { replace: true });
    }
  }, [initialPages, navigate]);

  if (!initialPages?.length) {
    return null;
  }

  return (
    <PptOutlineEditor
      title="编辑大纲"
      subtitle="用一句话描述你的想法，AI将为你自动生成结构清晰的大纲"
      initialPages={initialPages}
      showImageAction={false}
      onBack={() => navigate("/ppt/outline/oneshot")}
      onNext={(_pages: OutlinePage[]) => navigate("/ppt/create?mode=oneshot")}
    />
  );
}
