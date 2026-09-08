import React from "react";
import { useNavigate } from "react-router-dom";
import PptOutlineEditor, { type OutlinePage } from "./PptOutlineEditor";

export default function PptCustomOutlinePage() {
  const navigate = useNavigate();

  return (
    <PptOutlineEditor
      title="自定义大纲"
      showImageAction
      onBack={() => navigate("/ppt/outline")}
      onNext={(_pages: OutlinePage[]) => navigate("/ppt/create?mode=custom")}
    />
  );
}
